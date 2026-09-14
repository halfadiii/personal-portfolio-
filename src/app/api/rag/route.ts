import { ask, type AgentEvent } from "@/lib/rag/answer";
import { loadCorpus } from "@/lib/rag/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to three model calls in sequence (gate, draft, one retry), each a few
// seconds, plus a cold start that decodes the embedding model.
export const maxDuration = 60;

/**
 * The live Agentic RAG demo: one question in, the pipeline's steps out.
 *
 * ## The response is a stream of steps, not an answer
 *
 * NDJSON, one event per line, written as each step finishes. The point of the
 * demo is the machinery around the model -- the retrieval, the gate that can
 * refuse, the check that can throw a draft away -- and a single JSON reply
 * would show the one answer that survived all of it and hide everything that
 * made it trustworthy.
 *
 * ## The key, and what happens without it
 *
 * Retrieval is entirely local to this function: the embedding model, the
 * vectors and the keyword index all ship with the deployment. Only the gate
 * and the drafting call a model, and they need DEEPSEEK_API_KEY. Without it
 * the route still runs retrieval for real and says plainly that it stopped
 * there, rather than failing the whole request over the half that is missing.
 *
 * ## Abuse
 *
 * A public endpoint that spends someone's API credit needs a ceiling. Questions
 * are capped in length, and each address gets a handful per ten minutes. The
 * counter lives in this instance's memory, so it is a speed bump rather than a
 * wall -- a fresh instance starts at zero -- which is proportionate to a
 * prepaid key that costs a fraction of a cent per question.
 */

const MAX_QUESTION_CHARS = 300;
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 10;
const recent = new Map<string, number[]>();

function admit(address: string): number {
  const now = Date.now();
  const times = (recent.get(address) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_WINDOW) {
    recent.set(address, times);
    return Math.ceil((WINDOW_MS - (now - times[0])) / 1000);
  }
  times.push(now);
  recent.set(address, times);
  // Keep the map from growing without bound on a long-lived instance.
  if (recent.size > 5000) {
    for (const [key, value] of recent) {
      if (!value.length || now - value[value.length - 1] > WINDOW_MS) recent.delete(key);
    }
  }
  return 0;
}

const problem = (status: number, error: string, headers: HeadersInit = {}) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store", ...headers } });

/** Readiness, and a warm-up: the page calls this on load so a cold start is paid before anyone asks. */
export async function GET() {
  try {
    const corpus = await loadCorpus();
    return Response.json(
      {
        ready: true,
        answering: Boolean(process.env.DEEPSEEK_API_KEY),
        chunks: corpus.chunks.length,
        documents: new Set(corpus.chunks.map((c) => c.docId)).size,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return problem(503, "The document index could not be loaded.");
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "Send a JSON body with a question.");
  }
  const raw = (body as { question?: unknown } | null)?.question;
  if (typeof raw !== "string") return problem(400, "Send a JSON body with a question.");

  const question = raw.replace(/\s+/g, " ").trim();
  if (!question) return problem(400, "Ask something first.");
  if (question.length > MAX_QUESTION_CHARS) {
    return problem(413, `Keep it under ${MAX_QUESTION_CHARS} characters.`);
  }

  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const wait = admit(address);
  if (wait) {
    return problem(429, "That is a lot of questions. Give it a few minutes.", {
      "retry-after": String(wait),
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // The reader went away; nothing left to tell.
          open = false;
        }
      };
      try {
        const corpus = await loadCorpus();
        await ask(corpus, question, emit, {
          key: process.env.DEEPSEEK_API_KEY,
          signal: request.signal,
        });
      } catch (error) {
        const aborted = request.signal.aborted;
        if (!aborted) {
          emit({
            type: "error",
            message:
              error instanceof Error && error.message.startsWith("the model API")
                ? `The answering step failed: ${error.message}.`
                : "Something broke while answering. Try again in a moment.",
          });
        }
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
