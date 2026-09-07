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
    "Trains running a simulated line, the feed they would publish, and the inference that turns a vanished prediction into an arrival — with the error it makes, measured against ground truth.",
};

/**
 * The live demonstration behind the NYC subway case study.
 *
 * The project's own `ingest/watch.py` exists to watch one thing happen: a stop
 * dropping off a train's prediction list. That is hard to show in prose and
 * impossible to show in a diagram, so this runs it.
 */
export default function SubwayDemoPage() {
  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live demo"
          meta="496 stations / 26 routes / real GTFS geometry"
        />
        <h1 className="font-display text-hero leading-[0.88]">
          The whole system, and the one event it never reports.
        </h1>
        <p className="measure text-lead text-steel">
          There is no arrival event in the MTA feed. A train that reaches a
          platform simply stops being predicted for it, and the next snapshot is
          quietly shorter than the last. Everything this pipeline produces rests
          on reading that absence correctly — so here it is, running.
        </p>
        <p className="label-mono">
          Live · the same inference as{" "}
          <code className="text-signal">int_inferred_arrivals.sql</code>
        </p>
      </header>

      <div className="mt-14">
        <SubwayNetworkPanel />
      </div>

      <section aria-labelledby="arrival-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">02</span> / the part the pipeline cares
          about
        </p>
        <h2 id="arrival-title" className="font-display text-section mt-5">
          Now watch one arrival happen.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          The map above is the system. This is the mechanism underneath it, on
          the L, running right now: the MTA&rsquo;s own feed polled every{" "}
          {POLL_SECONDS} seconds, the numbers converging, and a stop dropping
          off the list at the moment a train reaches it. Nothing here is
          simulated, and nothing is pre-recorded — the arrivals below were
          inferred while you had this page open.
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
              title: "These are real trains, on the real L, right now",
              body: "The MTA publishes eight GTFS-realtime feeds; this reads the one carrying the L. It is protobuf, and it is served without CORS headers, so a browser cannot fetch it — the decoding happens in a route handler on this site's own server, which is what every live transit map on the web has behind it.",
            },
            {
              title: "A train between platforms is drawn where the feed thinks it is",
              body: "The feed publishes which stop a train is at or heading for, and when it expects to arrive. It never publishes a position. So the mark between two platforms is that prediction run backwards — the feed's belief made spatial, not a measurement. If the belief is wrong the mark is wrong in exactly the same way, which is the honest picture and also the interesting one: it is the same belief the arrival is about to be inferred from.",
            },
            {
              title: "The trains move continuously; the feed does not",
              body: "On the strip diagram, trains slide along the rail every frame because they are physical objects. The stems above the followed train — one per stop it is predicting, each with its countdown — hold still and then jump all at once, because a belief is not continuous. It is a snapshot that is right when it is taken and goes stale until the next one lands. Those two rates running side by side are this pipeline's entire problem.",
            },
            {
              title: `The feed is generated every ${POLL_SECONDS} seconds`,
              body: "For each train it publishes predicted arrivals for its next six stops, with error that grows the further ahead the guess is. That is why the numbers in the table visibly converge as a train closes on a platform.",
            },
            {
              title: "An arrival is a column going empty",
              body: "When a train passes a platform, that stop leaves its prediction list. The pipeline takes the last value the prediction carried and calls it the arrival. Nothing else in the feed marks the event.",
            },
            {
              title: "A vanish that was never due is thrown away",
              body: "A prediction that disappears while still more than two minutes in the future is a cancellation or a re-route, not an arrival. Those are counted separately and dropped — treating them as arrivals would flatter the service exactly when riders are suffering most.",
            },
            {
              title: "Then it becomes headway, and excess wait",
              body: "Consecutive inferred arrivals at one platform give headways; headways give excess wait, the time a rider spends beyond what an evenly spread service of the same frequency would ask. Bunching pushes it up while leaving the mean headway untouched, which is exactly why the mean headway is the wrong metric.",
            },
            {
              title: "There is no error column, and there cannot be",
              body: "Nothing here can be graded, because nobody publishes when the train actually arrived — that absence is the entire premise of the project. The method is checked instead in the pipeline's own test suite, against synthetic feeds whose answer is known by construction: a train that arrives, one cancelled ten minutes out, one still in the newest snapshot. That runs on every commit, which is a better place for a correctness check than a page.",
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
          Straight out of <code className="text-signal">ingest/feeds.py</code>.
          There are eight because that is how the MTA groups the lines — no key
          required for the subway feeds, refreshed roughly every thirty seconds.
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
          See the pipeline diagram
        </Link>
        <Link href="/#work" className="tap label-mono hover:text-signal inline-flex">
          Back to selected work
        </Link>
      </p>
    </div>
  );
}
