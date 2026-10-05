import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { SubwayDemoPanel } from "@/components/viz/SubwayDemoPanel";
import { SubwayNetworkPanel } from "@/components/viz/SubwayNetworkPanel";
import { feeds } from "@/content/pipeline";
import { POLL_SECONDS } from "@/lib/subway-live";

export const metadata: Metadata = {
  title: "Subway arrival demo",
  description:
    "Live New York subway trains on a map, and one line where you can watch an arrival being worked out from the MTA's own feed.",
};

/**
 * The live demonstration behind the NYC subway case study.
 *
 * The project's own `ingest/watch.py` exists to watch one thing happen: a stop
 * dropping off a train's prediction list. That is hard to show in prose and
 * impossible to show in a diagram, so this runs it.
 *
 * The words are for somebody who has never heard of a data feed. They were
 * rewritten on 2026-10-04 at his request, shorter and without the vocabulary
 * (protobuf, CORS, route handlers): eight explanations became five, and each
 * one says what you are looking at before it says anything else.
 */
export default function SubwayDemoPage() {
  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live demo"
          meta="496 stations / 26 routes / live trains"
        />
        <h1 className="font-display text-hero leading-[0.88]">
          The whole system, and the one event it never reports.
        </h1>
        <p className="measure text-lead text-steel">
          The MTA&rsquo;s live data never says when a train arrives. A train
          that reaches a platform just stops being listed for it. This page
          shows that happening, on real trains, right now.
        </p>
        <p className="label-mono">Live, from the MTA&rsquo;s own feeds</p>
      </header>

      <div className="mt-14">
        <SubwayNetworkPanel />
      </div>

      <section aria-labelledby="arrival-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">02</span> / one line, up close
        </p>
        <h2 id="arrival-title" className="font-display text-section mt-5">
          Now watch one arrival happen.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          This is the L train, right now. The table shows when the MTA expects
          each train at its next stops, refreshed every {POLL_SECONDS} seconds.
          When a train reaches a platform, that stop drops off its list.
          That&rsquo;s the arrival. Nothing here is recorded or simulated.
        </p>

        <div className="mt-10">
          <SubwayDemoPanel />
        </div>
      </section>

      <section aria-labelledby="how-title" className="section-gap">
        <h2 id="how-title" className="font-display text-section">
          What you are looking at.
        </h2>

        <ol className="mt-10 flex list-none flex-col p-0">
          {[
            {
              title: "These are real trains",
              body: `The page reads the MTA's live data and refreshes every ${POLL_SECONDS} seconds: every line on the map, and the L in the table.`,
            },
            {
              title: "A train between stations is a best guess",
              body: "The MTA says which stop a train is heading for and when it expects to get there. It never says where the train is. So each train is placed from that prediction.",
            },
            {
              title: "An arrival is a stop disappearing",
              body: "When a train passes a platform, that stop leaves its list, and the last time it was predicted is taken as the arrival. If it disappears while still more than two minutes away, it was cancelled, so it doesn't count.",
            },
            {
              title: "Then it becomes waiting time",
              body: "Arrivals give the gaps between trains, and the gaps give how long a rider waits. Bunched trains make the wait worse even when the average gap looks fine.",
            },
            {
              title: "Nobody can mark it right or wrong",
              body: "Nobody publishes when a train really arrived, so there's no answer sheet to check this page against. The method is tested separately, on made-up data where the answer is known.",
            },
          ].map((step, i) => (
            <li
              key={step.title}
              className="rule-top last:rule-bottom grid gap-x-8 gap-y-2 py-6 lg:grid-cols-[3rem_1fr]"
            >
              <span className="label-mono text-signal" data-numeric>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-body text-signal">{step.title}</h3>
                <p className="measure text-body text-steel mt-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="feeds-title" className="section-gap">
        <h2 id="feeds-title" className="font-display text-section">
          The eight feeds this reads from.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          The MTA splits the subway into eight live feeds, grouped by line.
          They&rsquo;re open to anyone, with no password.
        </p>

        <ul className="mt-10 grid list-none gap-px p-0 sm:grid-cols-2 lg:grid-cols-4">
          {feeds.map((feed) => (
            <li
              key={feed.id}
              className="border-hairline bg-panel flex flex-col gap-2 border p-4"
            >
              <span className="label-mono text-signal">{feed.label}</span>
              <span className="label-mono">{feed.lines.join(" · ")}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
        <Link
          href="/work/nyc-subway-reliability"
          className="tap label-mono text-signal hover:text-steel inline-flex"
        >
          Read the case study
        </Link>
        <Link
          href="/work/nyc-subway-reliability#pipeline"
          className="tap label-mono hover:text-signal inline-flex"
        >
          See the six steps
        </Link>
        <Link href="/#work" className="tap label-mono hover:text-signal inline-flex">
          Back to selected work
        </Link>
      </p>
    </div>
  );
}
