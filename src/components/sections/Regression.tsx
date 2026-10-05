import { SectionHeading } from "@/components/site/SectionHeading";
import { RegressionPanel } from "@/components/viz/RegressionPanel";
import { hasSnapshotData, waitSnapshot } from "@/lib/snapshot";

/**
 * §6.6 — rainfall against excess wait, from a snapshot committed to the repo.
 *
 * The snapshot is built by `scripts/build-wait-snapshot.py` from two published
 * sources: the MTA's own additional-platform-time metric and the Central Park
 * rainfall record. The answer it produces is a null — every interval contains
 * zero — and the section says so, because the alternative is to keep looking
 * until something crosses a threshold, which is the failure this whole page is
 * arguing against. If the export is ever removed the section falls back to an
 * honest pending state rather than drawing numbers nobody measured (§2.6).
 */
export function Regression() {
  return (
    <section
      id="regression"
      aria-labelledby="regression-title"
      className="section-gap"
    >
      <div className="shell">
        <SectionHeading
          id="regression"
          index="02"
          label="rain vs excess wait"
          meta={
            hasSnapshotData
              ? `snapshot ${waitSnapshot.generatedAt}`
              : "snapshot pending"
          }
          title="Does rain cost a rider time? Not measurably."
        >
          <p className="measure text-lead text-steel">
            I took eleven years of the MTA&rsquo;s own monthly figures for five
            lines and checked whether wetter months had longer waits, after
            allowing for the time of year and the pandemic. They didn&rsquo;t.
            Every result includes zero, which is the careful way of saying: no
            effect I can measure.
          </p>
          <p className="measure text-body text-steel mt-4">
            That&rsquo;s a real answer, so it&rsquo;s shown here and not buried.
            It&rsquo;s also the reason for the pipeline above. A monthly average
            is a blunt tool for a question about the twenty minutes it was
            raining.
          </p>
        </SectionHeading>

        <div className="mt-10">
          {hasSnapshotData ? (
            <RegressionPanel snapshot={waitSnapshot} />
          ) : (
            <PendingSnapshot />
          )}
        </div>
      </div>
    </section>
  );
}

function PendingSnapshot() {
  return (
    <div className="border-hairline border p-6 sm:p-8">
      <p className="label-mono text-signal">Awaiting the data snapshot</p>
      <p className="measure text-body text-steel mt-3">
        This chart draws from a snapshot committed to the repository and dated
        on the figure. Rebuild it with{" "}
        <code className="text-signal">
          python scripts/build-wait-snapshot.py
        </code>
        . Until one is there, inventing a scatter to fill the space would make
        the one instrumented claim on this site untrue.
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="label-mono text-signal">Expected at</dt>
          <dd className="label-mono mt-1">
            src/content/data/subway-wait-snapshot.json
          </dd>
        </div>
        <div>
          <dt className="label-mono text-signal">Shape</dt>
          <dd className="label-mono mt-1">
            routes[], points[route, year, month, wetHoursPct, precipMm,
            excessWaitMinutes, passengers], fits[route, interceptMinutes,
            minutesPerWetPoint, ciLow, ciHigh, n]
          </dd>
        </div>
      </dl>
    </div>
  );
}
