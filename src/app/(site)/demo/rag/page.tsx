import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { RagDemo } from "@/components/viz/RagDemo";

export const metadata: Metadata = {
  title: "Agentic RAG demo",
  description:
    "Ask 116 FDA documents a question and watch the pipeline work: hybrid retrieval, a relevance gate that can refuse, and a citation check in plain code that throws away any draft citing a source it was never given.",
};

/**
 * The live demonstration behind the Agentic RAG project.
 *
 * Everything on this page that is not the model's prose is the pipeline's own
 * record of what it did with the question: which passages each search found,
 * what the gate said, which drafts the citation check threw away. The copy
 * below it only states things that were measured.
 */
export default function RagDemoPage() {
  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live demo"
          meta="116 FDA documents / 1,752 chunks"
        />
        <h1 className="font-display text-hero leading-[0.88]">
          It answers from the documents, or it doesn&rsquo;t answer.
        </h1>
        <p className="measure text-lead text-steel">
          Regulatory questions are the kind where a confident wrong answer is
          worse than no answer. So this doesn&rsquo;t just search and summarise.
          It pulls five passages out of 97 FDA 510(k) clearances and 19 guidance
          documents, asks whether they actually answer the question, drafts an
          answer that has to cite them by number, and then checks those
          citations in plain code. A draft that cites something it was never
          given gets thrown away.
        </p>
        <p className="label-mono">
          Wound dressing clearances and FDA guidance · retrieval runs on this
          server · drafting by DeepSeek V3
        </p>
      </header>

      <div className="mt-14">
        <RagDemo />
      </div>

      <section aria-labelledby="steps-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">02</span> / what happens to a question
        </p>
        <h2 id="steps-title" className="font-display text-section mt-5">
          Five steps, and two of them are allowed to say no.
        </h2>

        <ol className="mt-10 grid list-none gap-px p-0 sm:grid-cols-2 lg:grid-cols-5">
          <Step
            n="01"
            title="Retrieve"
            body="Two searches over 1,752 chunks. One by meaning, using bge-small embeddings, which finds “gamma irradiation” when you ask about sterilisation. One by exact keyword, BM25, which finds “ISO 10993-1” when meaning search would wander. Thirty candidates each, fused by rank into five."
          />
          <Step
            n="02"
            title="Gate"
            body="Search always returns something, relevant or not. So a model is asked one question with a one-word answer: do these passages actually help? If not, it refuses before writing a word."
          />
          <Step
            n="03"
            title="Draft"
            body="The model answers from the five passages only, and every factual sentence has to carry a tag, [S1] to [S5]. Numbered tags, not document names, because a number can only be right or wrong."
          />
          <Step
            n="04"
            title="Check"
            body="Plain code, no model. Every tag has to point at a passage the model was actually given, and an answer with no tags at all fails too. This is the step that makes a made-up source impossible to serve."
          />
          <Step
            n="05"
            title="Retry or refuse"
            body="A failed draft is sent back once, with what was wrong. If the second draft fails the check too, the answer is a refusal, not the best of two bad drafts."
          />
        </ol>
      </section>

      <section aria-labelledby="parity-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">03</span> / is this actually the project
        </p>
        <h2 id="parity-title" className="font-display text-section mt-5">
          The same search as the Python, checked number for number.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          The project is Python, and it searches with PyTorch and an embedded
          Qdrant database, neither of which fits in a serverless function. So
          the search on this page is a TypeScript port, embedding model
          included. A port that&rsquo;s nearly right quietly returns different
          passages, so it was checked against the real Python retriever on 24
          questions before it was allowed to run here.
        </p>

        <div className="mt-10 grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          <Cell value="24 / 24" label="questions tokenised identically" note="plus 300 chunks of corpus text" />
          <Cell value="0.99999997" label="lowest cosine to the Python vectors" note="1.0 would be bit-identical" />
          <Cell value="24 / 24" label="identical top 30, both searches" note="meaning and keyword, in order" />
          <Cell value="24 / 24" label="identical top 5, every mode" note="dense, keyword, and fused" />
        </div>

        <p className="measure text-body text-steel mt-8">
          The embedding model ships at half precision, 67 MB instead of 133.
          That was measured before it was chosen: half precision kept every
          ranking identical on all 24 questions, while 8-bit, at half the size
          again, changed the top 30 on 23 of them. A small model is not a reason
          to accept a different answer.
        </p>
      </section>

      <section aria-labelledby="limits-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">04</span> / what it doesn&rsquo;t do yet
        </p>
        <h2 id="limits-title" className="font-display text-section mt-5">
          Where I&rsquo;d push on it.
        </h2>
        <ul className="measure mt-8 flex list-none flex-col gap-5 p-0">
          <Limit title="The exam is written. It hasn't been sat yet.">
            The citation check proves an answer only cites passages it was
            given, not that it reads them correctly. Measuring that needs
            questions with known answers, so I built them: a model drafted 66
            from real passages and I reviewed every one by hand. 26 were
            dropped, mostly because the passage was a mangled comparison table
            or a boilerplate cover letter and the answer couldn&rsquo;t be
            trusted. That left 49: 40 with a known answer and the page it lives
            on, across 36 documents, and 9 it should refuse. Scoring the system
            against them is the next step, so this page makes no accuracy
            claim yet.
          </Limit>
          <Limit title="The gate is a judgement, not a rule.">
            Whether passages are relevant is decided by a model saying one word.
            It is told to lean towards yes, so it will sometimes let a weak set
            of passages through; the drafting step can still refuse, and often
            does.
          </Limit>
          <Limit title="It can find the right subject in the wrong kind of document.">
            Ask what biocompatibility testing FDA expects for a dressing on an
            open wound, and it declines. Four of the five passages it retrieves
            are manufacturers describing the tests they ran on their own
            devices, and the model reports that none of them says what FDA
            expects. Declining is the right call with those passages. Finding
            better ones, by searching the guidance when a question asks what
            FDA wants, is the fix.
          </Limit>
          <Limit title="Older filings are under-represented.">
            42 of the 140 clearances downloaded were scanned paper with no
            extractable text, and most of those are older. They were left out
            rather than indexed as empty pages, which is honest but skews the
            corpus towards recent submissions.
          </Limit>
          <Limit title="It is a demonstration, not regulatory advice.">
            It knows wound dressings and the guidance around them, and nothing
            else. Ask it about something outside that and the right behaviour is
            the one it has: refusing.
          </Limit>
        </ul>
      </section>

      <p className="label-mono mt-10 flex flex-wrap gap-x-8 gap-y-3">
        <Link href="/#work" className="tap text-signal inline-flex">
          ← Back to the work
        </Link>
        <a
          href="https://github.com/halfadiii/fda-510k-agentic-rag"
          rel="noreferrer"
          className="tap text-steel hover:text-signal inline-flex"
        >
          Read the code on GitHub →
        </a>
      </p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="border-hairline flex flex-col gap-3 border p-5">
      <p className="label-mono">
        <span className="text-signal">{n}</span> / {title}
      </p>
      <p className="text-small text-steel">{body}</p>
    </li>
  );
}

function Cell({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="border-hairline flex flex-col gap-2 border p-5">
      <p className="font-display text-sub leading-none" data-numeric>
        {value}
      </p>
      <p className="label-mono text-signal">{label}</p>
      <p className="label-mono">{note}</p>
    </div>
  );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rule-top pt-5">
      <p className="text-body text-signal">{title}</p>
      <p className="text-body text-steel mt-2">{children}</p>
    </li>
  );
}
