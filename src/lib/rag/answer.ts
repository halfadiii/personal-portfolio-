/**
 * The answering half of the project, ported from answer.py.
 *
 *   question
 *     -> retrieve five chunks                        (retrieve.ts)
 *     -> RELEVANCE GATE: do they answer this at all?  one word from the model
 *     -> DRAFT an answer that cites [S1]..[S5]
 *     -> CITATION CHECK: is every tag a source it was given?   plain code
 *     -> if not, say what was wrong and draft once more; if still wrong, refuse
 *
 * The prompts, the regular expression, the order of the checks and the retry
 * budget are the Python's, unchanged. What is added is only visibility: each
 * step is emitted as an event as it happens, so the page can show the gate's
 * verdict and a rejected draft instead of just the answer that survived them.
 *
 * The citation check is the guarantee, and it is deliberately not a model.
 * A model can be asked to cite honestly; only code can make a fabricated
 * source number impossible to serve.
 */

import { search, type Corpus, type Hit } from "./retrieve";

export const MODEL = "deepseek-chat";
const GRADER_MODEL = "deepseek-chat";
const TOP_K = 5;
const MAX_REGENERATIONS = 1;
const ENDPOINT = "https://api.deepseek.com/chat/completions";

export const REFUSAL =
  "I don't have that in my documents. My corpus covers FDA 510(k) wound " +
  "dressing clearances and related guidance documents.";

const GATE_PROMPT = `You are checking whether retrieved passages are relevant to a question.

QUESTION: {question}

PASSAGES:
{passages}

Do these passages contain information that helps answer the question?

Answer with one word:
YES  - the passages contain relevant information, even if partial or spread
       across several passages
NO   - the passages are about a different subject entirely, or the specific
       thing asked about is never mentioned

Default to YES when the passages are on-topic. Only answer NO when the question
asks about something genuinely absent from the passages.`;

const SYSTEM_PROMPT = `You answer questions about FDA medical device regulations and 510(k) wound dressing clearances, using ONLY the sources provided.

RULES
1. Use only information in the numbered sources. Never use outside knowledge.
2. Cite every factual sentence with the source tag, like [S1] or [S2, S4].
3. Cite ONLY sources that appear in the list. Never invent a source number.
4. If the sources don't contain the answer, reply exactly:
   "INSUFFICIENT: " followed by what specific information is missing.
5. Never state a regulatory requirement you cannot cite.
6. Be concise. Two to four sentences unless the question needs more.
7. Do not repeat the question or add a preamble. Answer directly.`;

const USER_PROMPT = `SOURCES:
{sources}

QUESTION: {question}

Answer using only the sources above, citing each factual claim.`;

// ---------------------------------------------------------------------------
// The citation check: plain code, no model involved.
// ---------------------------------------------------------------------------

const CITE_RE = /\[(?:S|Source\s*)?(\d+(?:\s*,\s*(?:S|Source\s*)?\d+)*)\]/gi;

export function extractCitations(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(CITE_RE)) {
    for (const part of match[1].split(",")) {
      const digits = part.replace(/[^\d]/g, "");
      if (digits) found.push(Number(digits));
    }
  }
  return found;
}

export function validateCitations(
  text: string,
  sourceCount: number,
): { valid: boolean; invalid: number[]; reason: string } {
  const cited = extractCitations(text);
  const invalid = cited.filter((n) => n < 1 || n > sourceCount);
  if (invalid.length) {
    return {
      valid: false,
      invalid,
      reason: `cited nonexistent source(s) [${invalid.join(", ")}]; only S1-S${sourceCount} exist`,
    };
  }
  if (!cited.length && !text.startsWith("INSUFFICIENT")) {
    return { valid: false, invalid: [], reason: "no citations at all" };
  }
  if (!text.trim()) return { valid: false, invalid: [], reason: "empty answer" };
  return { valid: true, invalid: [], reason: "" };
}

// ---------------------------------------------------------------------------

export type Source = {
  tag: string;
  chunkId: string;
  docId: string;
  docTitle: string;
  docType: "510k" | "guidance";
  section: string;
  pageStart: number;
  pageEnd: number;
  url: string | null;
  text: string;
  rankDense: number | null;
  rankBm25: number | null;
  score: number;
};

export type AgentEvent =
  | {
      type: "retrieval";
      sources: Source[];
      denseCandidates: number;
      keywordCandidates: number;
      embedMs: number;
      searchMs: number;
    }
  | { type: "gate"; relevant: boolean; verdict: string; ms: number }
  | {
      type: "draft";
      attempt: number;
      text: string;
      cited: number[];
      valid: boolean;
      invalid: number[];
      reason: string;
      ms: number;
    }
  | {
      type: "final";
      outcome: "answered" | "refused" | "unavailable";
      text: string;
      reason: string;
      /** Tags actually cited, resolved to their real documents. */
      cited: string[];
      attempts: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      latencyMs: number;
    }
  | { type: "error"; message: string };

type Usage = { tokensIn: number; tokensOut: number };

async function chat(
  key: string,
  model: string,
  messages: { role: "system" | "user"; content: string }[],
  maxTokens: number,
  usage: Usage,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    // temperature 0, as in the Python: the same question should get the same
    // answer, or nothing about the system can be evaluated.
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`the model API answered ${response.status}`);
  }
  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  usage.tokensIn += data.usage?.prompt_tokens ?? 0;
  usage.tokensOut += data.usage?.completion_tokens ?? 0;
  return (data.choices[0]?.message.content ?? "").trim();
}

/** DeepSeek V3 list pricing per million tokens, as the Python estimates it. */
function cost(usage: Usage): number {
  return (usage.tokensIn * 0.27 + usage.tokensOut * 1.1) / 1_000_000;
}

function toSource(corpus: Corpus, hit: Hit, n: number): Source {
  const chunk = corpus.chunks[hit.index];
  return {
    tag: `S${n}`,
    chunkId: chunk.id,
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    docType: chunk.docType,
    section: chunk.section,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    url: corpus.sources[chunk.docId] ?? null,
    text: chunk.text,
    rankDense: hit.rankDense,
    rankBm25: hit.rankBm25,
    score: hit.score,
  };
}

export async function ask(
  corpus: Corpus,
  question: string,
  emit: (event: AgentEvent) => void,
  { key, signal }: { key: string | undefined; signal?: AbortSignal },
): Promise<void> {
  const started = performance.now();
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };

  const finish = (
    outcome: "answered" | "refused" | "unavailable",
    text: string,
    reason: string,
    attempts: number,
    cited: string[] = [],
  ) =>
    emit({
      type: "final",
      outcome,
      text,
      reason,
      cited,
      attempts,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: cost(usage),
      latencyMs: performance.now() - started,
    });

  const retrieval = search(corpus, question, { k: TOP_K });
  const sources = retrieval.hits.map((hit, i) => toSource(corpus, hit, i + 1));
  emit({
    type: "retrieval",
    sources,
    denseCandidates: retrieval.dense.length,
    keywordCandidates: retrieval.bm25.length,
    embedMs: retrieval.embedMs,
    searchMs: retrieval.searchMs,
  });

  if (!sources.length) return finish("refused", REFUSAL, "no results retrieved", 0);
  if (!key) {
    return finish(
      "unavailable",
      "",
      "the answering model is not configured on this server, so retrieval ran and nothing else did",
      0,
    );
  }

  // --- gate --------------------------------------------------------------
  const gateStarted = performance.now();
  const passages = sources.map((s) => `[${s.tag}] ${s.text}`).join("\n\n");
  const verdict = (
    await chat(
      key,
      GRADER_MODEL,
      [
        {
          role: "user",
          content: GATE_PROMPT.replace("{question}", question).replace("{passages}", passages),
        },
      ],
      5,
      usage,
      signal,
    )
  ).toUpperCase();
  const relevant = verdict.startsWith("YES");
  emit({ type: "gate", relevant, verdict, ms: performance.now() - gateStarted });
  if (!relevant) return finish("refused", REFUSAL, "passages not relevant", 0);

  // --- draft, check, maybe retry -----------------------------------------
  const formatted = sources
    .map(
      (s) =>
        `[${s.tag}] (document: ${s.docId}, page ${s.pageStart}, section: ${s.section})\n${s.text}`,
    )
    .join("\n\n");
  let feedback = "";
  let reason = "";

  for (let attempt = 1; attempt <= MAX_REGENERATIONS + 1; attempt++) {
    let user = USER_PROMPT.replace("{sources}", formatted).replace("{question}", question);
    if (feedback) user += `\n\nIMPORTANT: ${feedback}`;

    const draftStarted = performance.now();
    const text = await chat(
      key,
      MODEL,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      600,
      usage,
      signal,
    );
    const check = validateCitations(text, sources.length);
    reason = check.reason;
    emit({
      type: "draft",
      attempt,
      text,
      cited: extractCitations(text),
      valid: check.valid,
      invalid: check.invalid,
      reason: check.reason,
      ms: performance.now() - draftStarted,
    });

    if (check.valid) {
      if (text.startsWith("INSUFFICIENT")) {
        const missing = text.slice("INSUFFICIENT:".length).trim();
        return finish(
          "refused",
          `${REFUSAL}\n\nSpecifically missing: ${missing}`,
          "model reported insufficient context",
          attempt,
        );
      }
      const cited = [...new Set(extractCitations(text))].sort((a, b) => a - b).map((n) => `S${n}`);
      return finish("answered", text, "", attempt, cited);
    }

    feedback =
      `Your previous answer ${check.reason}. ` +
      `Use only [S1] through [S${sources.length}], and cite every factual sentence.`;
  }

  return finish(
    "refused",
    REFUSAL,
    `citation validation failed after ${MAX_REGENERATIONS + 1} attempts: ${reason}`,
    MAX_REGENERATIONS + 1,
  );
}
