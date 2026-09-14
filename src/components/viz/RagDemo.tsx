"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, Source } from "@/lib/rag/answer";
import { cn } from "@/lib/utils";

/**
 * The Agentic RAG pipeline, one question at a time.
 *
 * The route streams one event per step. This renders each as it lands, so the
 * refusal paths are as visible as the answer: a gate that said no, a draft the
 * citation check threw away. Nothing here decides anything — every verdict on
 * screen is the server's, and the model's text is shown as the model wrote it.
 */

const SUGGESTIONS: { question: string; note?: string }[] = [
  { question: "How are silver dressings sterilized?" },
  { question: "What is a predicate device?" },
  { question: "What does ISO 10993-1 require?" },
  {
    question: "When should a manufacturer submit a new 510(k) for a software change?",
  },
  { question: "Is wool a good wound dressing material?", note: "out of scope" },
];

const MAX_CHARS = 300;

type Status = {
  ready: boolean;
  answering: boolean;
  chunks: number;
  documents: number;
};

type Retrieval = Extract<AgentEvent, { type: "retrieval" }>;
type Gate = Extract<AgentEvent, { type: "gate" }>;
type Draft = Extract<AgentEvent, { type: "draft" }>;
type Final = Extract<AgentEvent, { type: "final" }>;

type Run = {
  question: string;
  running: boolean;
  retrieval?: Retrieval;
  gate?: Gate;
  drafts: Draft[];
  final?: Final;
  error?: string;
};

const PASS = "text-[var(--line-green-on-void)]";
const FAIL = "text-[var(--line-red-on-void)]";

// The same pattern the server's check uses, so the tags that become links are
// exactly the tags that were validated.
const TAG = /\[(?:S|Source\s*)?(\d+(?:\s*,\s*(?:S|Source\s*)?\d+)*)\]/gi;

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function RagDemo() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);

  // Loading the index is the slow part of a cold start; asking for readiness on
  // arrival pays it before anyone has typed.
  useEffect(() => {
    let alive = true;
    fetch("/api/rag")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Status) => alive && setStatus(data))
      .catch(() => alive && setStatusError(true));
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, []);

  const apply = useCallback((event: AgentEvent) => {
    setRun((current) => {
      if (!current) return current;
      switch (event.type) {
        case "retrieval":
          setAnnouncement(`Retrieved ${event.sources.length} passages.`);
          return { ...current, retrieval: event };
        case "gate":
          setAnnouncement(
            event.relevant
              ? "Relevance check passed."
              : "Relevance check failed. Refusing.",
          );
          return { ...current, gate: event };
        case "draft":
          setAnnouncement(
            `Draft ${event.attempt} ${event.valid ? "passed" : "failed"} the citation check.`,
          );
          return { ...current, drafts: [...current.drafts, event] };
        case "final":
          setAnnouncement(
            event.outcome === "answered"
              ? "Answered."
              : event.outcome === "refused"
                ? "Refused."
                : "Retrieval finished. Answering is not configured.",
          );
          return { ...current, final: event, running: false };
        case "error":
          setAnnouncement(event.message);
          return { ...current, error: event.message, running: false };
      }
    });
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (!trimmed) return;

      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setQuestion(trimmed);
      setRun({ question: trimmed, running: true, drafts: [] });
      setAnnouncement("Searching.");

      try {
        const response = await fetch("/api/rag", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          const message = data?.error ?? `The server answered ${response.status}.`;
          setRun((current) => current && { ...current, running: false, error: message });
          setAnnouncement(message);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line) apply(JSON.parse(line) as AgentEvent);
            newline = buffer.indexOf("\n");
          }
        }
        // A stream that ends without a verdict was cut off, not finished.
        setRun((current) =>
          current && current.running
            ? { ...current, running: false, error: "The connection closed before an answer arrived." }
            : current,
        );
      } catch (error) {
        if (abort.signal.aborted) return;
        const message = "The request failed. Check your connection and try again.";
        setRun((current) => current && { ...current, running: false, error: message });
        setAnnouncement(message);
        void error;
      }
    },
    [apply],
  );

  const busy = run?.running ?? false;

  return (
    <div className="flex flex-col gap-10">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <form
        className="border-hairline bg-panel flex flex-col gap-5 border p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="rag-question" className="label-mono text-signal">
          Ask about wound dressings or the FDA 510(k) process
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="rag-question"
            type="text"
            value={question}
            maxLength={MAX_CHARS}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="How are silver dressings sterilized?"
            autoComplete="off"
            className="text-body border-hairline bg-void focus:border-signal min-w-0 flex-1 border px-4 py-3 outline-none"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="label-mono border-signal text-signal ease-brief hover:bg-signal hover:text-void border px-5 py-3 transition-colors duration-[var(--dur-ui)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--signal)]"
          >
            {busy ? "Working…" : "Ask"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="label-mono">Or try one of these</p>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {SUGGESTIONS.map((item) => (
              <li key={item.question}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(item.question)}
                  className="label-mono border-hairline text-steel ease-brief hover:border-signal hover:text-signal border px-3 py-2 text-left transition-colors duration-[var(--dur-ui)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {item.question}
                  {item.note ? <span className="text-signal"> ({item.note})</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="label-mono">
          {statusError
            ? "The document index could not be reached."
            : status
              ? `Index loaded: ${status.documents} documents, ${status.chunks.toLocaleString()} chunks.${
                  status.answering ? "" : " Answering is switched off on this server, so questions stop after retrieval."
                }`
              : "Loading the document index…"}
        </p>
      </form>

      {run ? <Trace run={run} /> : null}
    </div>
  );
}

function Trace({ run }: { run: Run }) {
  const { retrieval, gate, drafts, final } = run;

  return (
    <div className="flex flex-col gap-8">
      <p className="label-mono">
        Question: <span className="text-signal">{run.question}</span>
      </p>

      <ol className="flex list-none flex-col gap-8 p-0">
        <Stage n="01" title="Retrieve" state={retrieval ? "done" : run.running ? "running" : "idle"}>
          {retrieval ? <Sources retrieval={retrieval} /> : null}
        </Stage>

        {retrieval && final?.outcome !== "unavailable" && (gate || run.running) ? (
          <Stage n="02" title="Relevance gate" state={gate ? (gate.relevant ? "done" : "failed") : "running"}>
            {gate ? (
              <p className="text-body text-steel">
                The model was asked whether these passages help answer the question. It said{" "}
                <span className={cn("label-mono", gate.relevant ? PASS : FAIL)}>
                  {gate.verdict || "(nothing)"}
                </span>
                {gate.relevant ? ", so drafting went ahead." : ", so it refused without drafting."}{" "}
                <span className="label-mono">{seconds(gate.ms)}</span>
              </p>
            ) : null}
          </Stage>
        ) : null}

        {gate?.relevant ? (
          <Stage
            n="03"
            title="Draft and citation check"
            state={
              drafts.some((d) => d.valid) ? "done" : final ? "failed" : "running"
            }
          >
            <div className="flex flex-col gap-6">
              {drafts.map((draft) => (
                <DraftView key={draft.attempt} draft={draft} />
              ))}
              {run.running && !final ? (
                <p className="label-mono">Drafting attempt {drafts.length + 1}…</p>
              ) : null}
            </div>
          </Stage>
        ) : null}
      </ol>

      {final ? <Verdict final={final} sources={retrieval?.sources ?? []} /> : null}

      {run.error ? (
        <p className={cn("label-mono border-hairline border p-4", FAIL)} role="alert">
          {run.error}
        </p>
      ) : null}
    </div>
  );
}

function Stage({
  n,
  title,
  state,
  children,
}: {
  n: string;
  title: string;
  state: "idle" | "running" | "done" | "failed";
  children?: React.ReactNode;
}) {
  return (
    <li className="rule-top flex flex-col gap-4 pt-5">
      <p className="label-mono flex flex-wrap items-baseline justify-between gap-3">
        <span>
          <span className="text-signal">{n}</span> / {title}
        </span>
        <span className={cn(state === "done" && PASS, state === "failed" && FAIL)}>
          {state === "running" ? "working…" : state === "done" ? "passed" : state === "failed" ? "stopped here" : ""}
        </span>
      </p>
      {children}
    </li>
  );
}

function Sources({ retrieval }: { retrieval: Retrieval }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-steel">
        {retrieval.denseCandidates} candidates by meaning, {retrieval.keywordCandidates} by keyword, fused by
        rank into these five.{" "}
        <span className="label-mono">
          embedding {Math.round(retrieval.embedMs)} ms · search {Math.round(retrieval.searchMs)} ms
        </span>
      </p>

      {/* `relative`, or the sr-only text inside the page links is positioned
          against the page instead of this scroller, and at 320px it pushed the
          whole document 84px wide while the table itself scrolled correctly. */}
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="The five retrieved passages and where each search ranked them"
      >
        <table className="text-small w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            The five passages given to the model, with each search&rsquo;s rank for them.
          </caption>
          <thead>
            <tr className="rule-top rule-bottom">
              <th scope="col" className="label-mono text-signal px-3 py-2">Tag</th>
              <th scope="col" className="label-mono text-signal px-3 py-2">Document</th>
              <th scope="col" className="label-mono text-signal px-3 py-2">Page</th>
              <th scope="col" className="label-mono text-signal px-3 py-2">By meaning</th>
              <th scope="col" className="label-mono text-signal px-3 py-2">By keyword</th>
            </tr>
          </thead>
          <tbody>
            {retrieval.sources.map((source) => (
              <tr key={source.chunkId} id={`rag-source-${source.tag}`} className="rule-bottom align-top">
                <th scope="row" className="label-mono text-signal px-3 py-3">{source.tag}</th>
                <td className="px-3 py-3">
                  <p className="text-small">{source.docTitle}</p>
                  <p className="label-mono">
                    {source.docType === "510k" ? `510(k) ${source.docId}` : "FDA guidance"} · {source.section}
                  </p>
                </td>
                <td className="label-mono px-3 py-3" data-numeric>
                  {source.url ? (
                    <a
                      href={`${source.url}#page=${source.pageStart}`}
                      rel="noreferrer"
                      className="hover:text-signal underline underline-offset-4"
                    >
                      p.{source.pageStart}
                      <span className="sr-only"> of {source.docTitle}, opens the FDA document</span>
                    </a>
                  ) : (
                    `p.${source.pageStart}`
                  )}
                </td>
                <td className="label-mono px-3 py-3" data-numeric>
                  {source.rankDense ? `#${source.rankDense}` : "not in top 30"}
                </td>
                <td className="label-mono px-3 py-3" data-numeric>
                  {source.rankBm25 ? `#${source.rankBm25}` : "not in top 30"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex list-none flex-col gap-2 p-0">
        {retrieval.sources.map((source) => (
          <li key={source.chunkId}>
            <details className="border-hairline border px-4 py-3">
              <summary className="label-mono cursor-pointer">
                <span className="text-signal">{source.tag}</span> · read the passage the model was given
              </summary>
              <p className="text-small text-steel mt-3 whitespace-pre-line">{source.text}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftView({ draft }: { draft: Draft }) {
  return (
    <div className="border-hairline flex flex-col gap-3 border p-4">
      <p className="label-mono flex flex-wrap justify-between gap-3">
        <span>Draft {draft.attempt}</span>
        <span>{seconds(draft.ms)}</span>
      </p>
      <p className={cn("text-small text-steel whitespace-pre-line", !draft.valid && "line-through")}>
        {draft.text || "(empty)"}
      </p>
      <p className={cn("label-mono", draft.valid ? PASS : FAIL)}>
        {draft.valid
          ? draft.cited.length
            ? `Citation check passed: every tag cited (${[...new Set(draft.cited)].map((n) => `S${n}`).join(", ")}) is a passage it was given.`
            : "Citation check passed: the model said the passages do not contain the answer."
          : `Citation check failed: ${draft.reason}. This draft was thrown away.`}
      </p>
    </div>
  );
}

function Verdict({ final, sources }: { final: Final; sources: Source[] }) {
  const cited = sources.filter((s) => final.cited.includes(s.tag));

  return (
    <section
      aria-label="Result"
      className={cn(
        "border p-5 sm:p-6",
        final.outcome === "answered" ? "border-signal" : "border-hairline",
      )}
    >
      <p className="label-mono">
        <span className={final.outcome === "answered" ? PASS : final.outcome === "refused" ? FAIL : undefined}>
          {final.outcome === "answered" ? "Answered" : final.outcome === "refused" ? "Refused" : "Stopped after retrieval"}
        </span>
        {final.reason ? ` · ${final.reason}` : null}
      </p>

      {final.text ? (
        <p className="text-lead mt-4 whitespace-pre-line">
          {final.outcome === "answered" ? <Tagged text={final.text} /> : final.text}
        </p>
      ) : null}

      {cited.length ? (
        <ul className="mt-5 flex list-none flex-col gap-2 p-0">
          {cited.map((source) => (
            <li key={source.tag} className="label-mono">
              <span className="text-signal">{source.tag}</span> {source.docTitle} ·{" "}
              {source.docType === "510k" ? source.docId : "FDA guidance"} · p.{source.pageStart} ·{" "}
              {source.section}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="label-mono mt-5">
        {seconds(final.latencyMs)} · {final.attempts} {final.attempts === 1 ? "draft" : "drafts"} ·{" "}
        {final.tokensIn.toLocaleString()} tokens in, {final.tokensOut.toLocaleString()} out, every model call
        included · about ${final.costUsd.toFixed(4)}
      </p>
    </section>
  );
}

function Tagged({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    const at = match.index ?? 0;
    parts.push(text.slice(last, at));
    const numbers = match[1]
      .split(",")
      .map((part) => part.replace(/[^\d]/g, ""))
      .filter(Boolean);
    parts.push(
      <span key={at} className="label-mono whitespace-nowrap">
        [
        {numbers.map((n, i) => (
          <Fragment key={n + i}>
            {i ? ", " : null}
            <a href={`#rag-source-S${n}`} className="text-signal underline underline-offset-4">
              S{n}
            </a>
          </Fragment>
        ))}
        ]
      </span>,
    );
    last = at + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
