import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { PrintInspectionDemo } from "@/components/viz/PrintInspectionDemo";
import { printInspection } from "@/lib/print-inspection";

export const metadata: Metadata = {
  title: "Print inspection demo",
  description:
    "EagleEyes running: a ticket press, an overhead camera, and the four gates that decide whether a printed frame is good — replaying 2,315 real verdicts from the production engine.",
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
 */
export default function PrintInspectionPage() {
  const percent = (n: number, of: number) =>
    of === 0 ? "0" : ((n / of) * 100).toFixed(1);

  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live demo"
          meta={`${measured.frames.toLocaleString()} frames / 21 tickets each / 4 gates`}
        />
        <h1 className="font-display text-hero leading-[0.88]">
          Twenty-one tickets a photograph, three photographs a second.
        </h1>
        <p className="measure text-lead text-steel">
          Tickets come off this press in a bunch — seven across the width of the
          web, three rows deep — and each one carries a single small printed
          mark, a Q-block. If the print is failing, those marks are the first
          thing to go faint, go missing, or drift out of place. {source.system}{" "}
          photographs the whole bunch at once, finds all twenty-one blocks, and
          puts them through four gates. All four have to pass, or the frame is
          turned down.
        </p>
        <p className="label-mono">
          {source.client} · {source.line} · replaying the production engine’s
          own output
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
          {measured.frames.toLocaleString()} frames, nothing missed and nothing
          wrongly rejected.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          Ground truth comes free here: the camera writes the verdict into every
          filename, so the engine&rsquo;s decision can be scored against what
          the frame actually was. Over the whole labelled run it agreed every
          time.
        </p>

        <div className="mt-10 grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          <Cell
            value={measured.passed.toLocaleString()}
            label="good frames passed"
            note={`of ${measured.good.toLocaleString()} — ${percent(measured.passed, measured.good)}%`}
          />
          <Cell
            value={measured.caught.toLocaleString()}
            label="defective frames caught"
            note={`of ${measured.defective.toLocaleString()} — ${percent(measured.caught, measured.defective)}%`}
          />
          <Cell
            value={String(measured.falseRejects)}
            label="good frames wrongly rejected"
            note="scrap the line would have eaten"
          />
          <Cell
            value={String(measured.missed)}
            label="defective frames let through"
            note="the expensive kind of mistake"
          />
        </div>

        <p className="measure text-body text-steel mt-8">
          One distinction worth making, because it changes what the numbers
          mean. The thresholds were{" "}
          <span className="text-signal">derived from good images only</span> —
          so the {measured.defective.toLocaleString()} defective frames were
          never used to fit anything, and catching all of them is an
          out-of-sample result. The {measured.good} good frames are the
          population the thresholds were built from, so their pass rate is an
          in-sample figure and should be read as one.
        </p>
      </section>

      <section aria-labelledby="gates-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">03</span> / the four gates
        </p>
        <h2 id="gates-title" className="font-display text-section mt-5">
          Detection finds the blocks. The rules decide.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          A detector alone would only ever say{" "}
          <em>how many marks it thinks it sees</em>, at some confidence. Turning
          that into a verdict a factory can act on is the rules layer, and it is
          where the project actually lives: four independent checks, each with a
          range learned from good print rather than a number somebody picked.
        </p>

        {/* Focusable and named: on a narrow screen this scrolls sideways, and
            a region you can only reach with a pointer is a region a keyboard
            user cannot read. */}
        <div
          className="mt-10 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="The four gates, and how many frames passed each"
        >
          <table className="text-small w-full border-collapse text-left">
            <caption className="sr-only">
              The four gates, what each one asks, and how many of the{" "}
              {measured.frames.toLocaleString()} frames passed it.
            </caption>
            <thead>
              <tr className="rule-top rule-bottom">
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Gate
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  What it asks
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  The range it holds to
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Passed
                </th>
              </tr>
            </thead>
            <tbody>
              {measured.gates.map((gate, i) => (
                <tr key={gate.id} className="rule-bottom last:border-b-0">
                  <th scope="row" className="label-mono text-signal px-4 py-3">
                    {gate.label}
                  </th>
                  <td className="label-mono px-4 py-3">{gate.question}</td>
                  <td className="label-mono px-4 py-3">
                    {
                      [
                        `exactly ${rules.allowedBigCounts.join(" or ")} big blocks`,
                        `confidence ${rules.conf.min.toFixed(3)}–${rules.conf.max.toFixed(3)}`,
                        `mean grey ${rules.meanGray.min}–${rules.meanGray.max}, dark ratio ${rules.darkRatio.min}–${rules.darkRatio.max}`,
                        `within ${rules.zThreshold}σ of the learned spacing`,
                      ][i]
                    }
                  </td>
                  <td className="label-mono px-4 py-3" data-numeric>
                    {gate.passed.toLocaleString()} /{" "}
                    {gate.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="border-hairline border p-5">
            <p className="label-mono text-signal">Where the time goes</p>
            <p className="text-body text-steel mt-3">
              <span className="text-signal" data-numeric>
                {measured.detectMs} ms
              </span>{" "}
              of detection and{" "}
              <span className="text-signal" data-numeric>
                {measured.rulesMs} ms
              </span>{" "}
              of rules per frame. The model is nineteen times the cost of every
              decision made on top of it, which is the argument for keeping the
              rules cheap and the detector doing one job.
            </p>
          </div>
          <div className="border-hairline border p-5">
            <p className="label-mono text-signal">What failed, and how</p>
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {measured.failures.map((failure) => (
                <li
                  key={failure.reason}
                  className="label-mono flex items-baseline justify-between gap-3"
                >
                  <code className="text-steel">{failure.reason}</code>
                  <span className="text-signal" data-numeric>
                    {failure.count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-small text-steel mt-3">
              Visibility and density almost always fail together: a block that
              has lost ink is both fainter and less certain, so the two gates
              are catching the same physical failure from two directions.
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
