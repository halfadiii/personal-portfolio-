import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { RagDemo } from "@/components/viz/RagDemo";

export const metadata: Metadata = {
  title: "Agentic RAG demo",
  description:
    "Ask 116 FDA documents a question. It answers only from what they say, shows where each fact came from, and refuses when the documents don't cover it.",
};

/**
 * The live demonstration behind the Agentic RAG project.
 *
 * Everything on this page that is not the model's prose is the pipeline's own
 * record of what it did with the question: which passages each search found,
 * what the gate said, which drafts the citation check threw away. The copy
 * below it only states things that were measured.
 *
 * The words were rewritten on 2026-10-04, at his request, for somebody who has
 * never heard of retrieval: what it does and why it can say no, in five short
 * steps, with the measurements that only an engineer would ask for folded
 * under one line.
 */
export default function RagDemoPage() {
  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live demo"
          meta="116 FDA documents / 1,752 passages"
        />
        <h1 className="font-display text-hero leading-[0.88]">
          It answers from the documents, or it doesn&rsquo;t answer.
        </h1>
        <p className="measure text-lead text-steel">
          Ask it about FDA approvals for wound dressings. It finds the five
          most relevant passages in 116 official documents, answers only from
          those, and shows which passage each fact came from. If the documents
          don&rsquo;t answer your question, it says so. On a regulatory
          question, a confident wrong answer is worse than no answer.
        </p>
        <p className="label-mono">
          97 FDA clearances and 19 guidance documents · answers written by
          DeepSeek V3
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
            title="Search"
            body="Two searches through the documents: one by meaning, one by exact words. The best five passages from both are kept."
          />
          <Step
            n="02"
            title="Check they help"
            body="A search always finds something, useful or not. So it's asked one yes-or-no question: do these passages actually answer this? If not, it stops here."
          />
          <Step
            n="03"
            title="Write"
            body="The answer is written from those five passages only, and every fact has to point at the passage it came from."
          />
          <Step
            n="04"
            title="Check the sources"
            body="A simple check with no AI in it: every source the answer points at has to be one it was actually given. This is what stops a made-up source getting through."
          />
          <Step
            n="05"
            title="Retry or refuse"
            body="A failed answer gets one more try, with what was wrong. If that fails too, it refuses. No best-of-two-bad-answers."
          />
        </ol>
      </section>

      <section aria-labelledby="parity-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">03</span> / is this actually the project
        </p>
        <h2 id="parity-title" className="font-display text-section mt-5">
          The same search as the original, checked.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          The real project is written in Python and is too heavy to run on a
          website. So this page runs a copy of its search, rewritten for the
          web. A copy that&rsquo;s nearly right quietly gives different
          results, so I tested it against the original on 24 questions before
          letting it run here. It matched on all of them.
        </p>

        <details className="border-hairline mt-8 border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            The measurements, for anyone who wants them
          </summary>
          <div className="px-4 pb-5">
            <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
              <Cell value="24 / 24" label="questions tokenised identically" note="plus 300 chunks of corpus text" />
              <Cell value="0.99999997" label="lowest cosine to the Python vectors" note="1.0 would be bit-identical" />
              <Cell value="24 / 24" label="identical top 30, both searches" note="meaning and keyword, in order" />
              <Cell value="24 / 24" label="identical top 5, every mode" note="dense, keyword, and fused" />
            </div>
            <p className="measure text-body text-steel mt-6">
              The search by meaning uses bge-small embeddings and the search by
              exact words uses BM25; thirty candidates from each are fused by
              rank into five. The embedding model ships at half precision, 67
              MB instead of 133. That was measured before it was chosen: half
              precision kept every ranking identical on all 24 questions, while
              8-bit, at half the size again, changed the top 30 on 23 of them.
            </p>
          </div>
        </details>
      </section>

      <section aria-labelledby="limits-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">04</span> / what it doesn&rsquo;t do yet
        </p>
        <h2 id="limits-title" className="font-display text-section mt-5">
          Where I&rsquo;d push on it.
        </h2>
        <ul className="measure mt-8 flex list-none flex-col gap-5 p-0">
          <Limit title="It hasn't been graded yet.">
            The source check proves an answer only points at passages it was
            given, not that it read them correctly. To measure that there are
            now 49 test questions, each reviewed by hand: 40 with a known
            answer, and 9 it should refuse. Scoring it against them is the
            next step, so this page makes no accuracy claim.
          </Limit>
          <Limit title="It can find the right topic in the wrong document.">
            Ask what testing the FDA expects for a dressing, and it mostly
            finds manufacturers describing the tests they ran themselves. When
            that happens it declines, which is the right call with those
            passages. Searching the FDA&rsquo;s own guidance first is the fix.
          </Limit>
          <Limit title="Older documents are mostly missing.">
            42 of the 140 clearances I downloaded were scanned paper with no
            readable text, and most of those are older. They were left out
            rather than added as blank pages.
          </Limit>
          <Limit title="It only knows wound dressings.">
            Ask about anything else and the right behaviour is the one it has:
            refusing. It&rsquo;s a demonstration, not regulatory advice.
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
