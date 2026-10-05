import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { PrintInspectionDemo } from "@/components/viz/PrintInspectionDemo";
import { FAILURE_LABELS, printInspection } from "@/lib/print-inspection";

export const metadata: Metadata = {
  title: "Print inspection demo",
  description:
    "A camera system checking printed tickets on a real press: 2,315 photos replayed, and the four checks that decide whether each one passes.",
};

const { measured, rules, source } = printInspection;

/**
 * The live demonstration behind the print-inspection case study.
 *
 * A vision system is almost impossible to describe in prose, because the whole
 * thing is a sequence: stock, print, strobe, detector, four gates, a verdict
 * on a screen. So this runs the sequence, with the production engine's own
 * recorded verdicts driving it — the frames the press turns down here are the
 * ones it turned down there, for the reasons it wrote down.
 *
 * The words were rewritten on 2026-10-04, at his request, for somebody who has
 * never seen a press: "photos" and "checks" where it said frames and gates,
 * the failure codes shown by their plain names, and the exact thresholds folded away under one
 * line for whoever wants them.
 */
export default function PrintInspectionPage() {
  const percent = (n: number, of: number) =>
    of === 0 ? "0" : ((n / of) * 100).toFixed(1);

  const ranges = [
    `exactly ${rules.allowedBigCounts.join(" or ")} big blocks`,
    `confidence ${rules.conf.min.toFixed(3)}–${rules.conf.max.toFixed(3)}`,
    `mean grey ${rules.meanGray.min}–${rules.meanGray.max}, dark ratio ${rules.darkRatio.min}–${rules.darkRatio.max}`,
    `within ${rules.zThreshold}σ of the learned spacing`,
  ];

  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live demo"
          meta={`${measured.frames.toLocaleString()} photos / 21 tickets each / 4 checks`}
        />
        <h1 className="font-display text-hero leading-[0.88]">
          Twenty-one tickets a photograph, three photographs a second.
        </h1>
        <p className="measure text-lead text-steel">
          Tickets come off this press 21 at a time, and each one carries a small
          printed mark called a Q-block. When the print starts to fail, those
          blocks are the first thing to go faint, go missing, or drift out of
          place. {source.system} photographs all 21 at once and puts them
          through four checks. Fail one, and the whole photo is rejected.
        </p>
        <p className="label-mono">
          {source.client} · {source.line} · replaying the real system&rsquo;s
          own results
        </p>
      </header>

      <div className="mt-14">
        <PrintInspectionDemo />
      </div>

      <section aria-labelledby="measured-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">02</span> / how well it actually did
        </p>
        <h2 id="measured-title" className="font-display text-section mt-5">
          {measured.frames.toLocaleString()} photos, nothing missed and nothing
          wrongly rejected.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          Every photo came labelled good or bad by the camera that took it, so
          the system&rsquo;s verdict can be marked against the truth. Over all{" "}
          {measured.frames.toLocaleString()}, it agreed every time.
        </p>

        <div className="mt-10 grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          <Cell
            value={measured.passed.toLocaleString()}
            label="good photos passed"
            note={`of ${measured.good.toLocaleString()} — ${percent(measured.passed, measured.good)}%`}
          />
          <Cell
            value={measured.caught.toLocaleString()}
            label="bad photos caught"
            note={`of ${measured.defective.toLocaleString()} — ${percent(measured.caught, measured.defective)}%`}
          />
          <Cell
            value={String(measured.falseRejects)}
            label="good photos wrongly rejected"
            note="waste the press would have paid for"
          />
          <Cell
            value={String(measured.missed)}
            label="bad photos let through"
            note="the expensive kind of mistake"
          />
        </div>

        <p className="measure text-body text-steel mt-8">
          One caveat, because it changes what those numbers mean. The pass marks
          were set using{" "}
          <span className="text-signal">only the good photos</span>. So catching
          all {measured.defective.toLocaleString()} bad ones is a fair test: it
          had never seen them. Passing all {measured.good} good ones is less
          impressive than it looks, because those are the photos it learned
          from.
        </p>
      </section>

      <section aria-labelledby="gates-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">03</span> / the four checks
        </p>
        <h2 id="gates-title" className="font-display text-section mt-5">
          Finding the blocks is half of it. Four checks decide.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          Each check asks one simple question, and its pass mark was learned
          from good print, not picked by hand. All four have to pass.
        </p>

        {/* Focusable and named: on a narrow screen this scrolls sideways, and
            a region you can only reach with a pointer is a region a keyboard
            user cannot read. */}
        <div
          className="mt-10 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="The four checks, and how many photos passed each"
        >
          <table className="text-small w-full border-collapse text-left">
            <caption className="sr-only">
              The four checks, what each one asks, and how many of the{" "}
              {measured.frames.toLocaleString()} photos passed it.
            </caption>
            <thead>
              <tr className="rule-top rule-bottom">
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Check
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  What it asks
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Passed
                </th>
              </tr>
            </thead>
            <tbody>
              {measured.gates.map((gate) => (
                <tr key={gate.id} className="rule-bottom last:border-b-0">
                  <th scope="row" className="label-mono text-signal px-4 py-3">
                    {gate.label}
                  </th>
                  <td className="label-mono px-4 py-3">{gate.question}</td>
                  <td className="label-mono px-4 py-3" data-numeric>
                    {gate.passed.toLocaleString()} /{" "}
                    {gate.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="border-hairline mt-6 border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            The exact pass marks, for anyone who wants them
          </summary>
          <dl className="flex flex-col gap-3 px-4 pb-5">
            {measured.gates.map((gate, i) => (
              <div key={gate.id}>
                <dt className="label-mono text-signal">{gate.label}</dt>
                <dd className="label-mono mt-1">{ranges[i]}</dd>
              </div>
            ))}
          </dl>
        </details>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="border-hairline border p-5">
            <p className="label-mono text-signal">Where the time goes</p>
            <p className="text-body text-steel mt-3">
              Finding the blocks takes{" "}
              <span className="text-signal" data-numeric>
                {measured.detectMs} milliseconds
              </span>{" "}
              a photo. The four checks take{" "}
              <span className="text-signal" data-numeric>
                {measured.rulesMs}
              </span>
              . So the checks are almost free, and nearly all the effort goes
              into finding the blocks.
            </p>
          </div>
          <div className="border-hairline border p-5">
            <p className="label-mono text-signal">
              What went wrong, and how often
            </p>
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {measured.failures.map((failure) => (
                <li
                  key={failure.reason}
                  className="label-mono flex items-baseline justify-between gap-3"
                >
                  <span className="text-steel">
                    {FAILURE_LABELS[failure.reason] ?? failure.reason}
                  </span>
                  <span className="text-signal" data-numeric>
                    {failure.count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-small text-steel mt-3">
              The first two nearly always happen together. A block that has lost
              ink is both fainter and harder to be sure of, so two checks catch
              the same problem from two sides.
            </p>
          </div>
        </div>
      </section>

      <p className="label-mono mt-10">
        <Link href="/#work" className="tap text-signal inline-flex">
          ← Back to the work
        </Link>
      </p>
    </div>
  );
}

function Cell({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note: string;
}) {
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
