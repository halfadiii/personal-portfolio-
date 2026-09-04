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
            Excess wait is the time a rider spends on a platform beyond what the
            timetable promises. Regressed on how much of each month was wet, per
            line, controlling for season and for the 2020&ndash;21 collapse. On
            five lines and eleven years of the MTA&rsquo;s own measurements,
            every interval contains zero.
          </p>
          <p className="measure text-body text-steel mt-4">
            That is the honest result, and it is reported rather than buried: a
            coefficient without a confidence interval is a claim, not a
            measurement, and an interval that spans zero is an answer. It is
            also the argument for the pipeline. A monthly average over every
            trip on a line is the wrong instrument for a question about the
            twenty minutes it was raining — which is exactly the resolution the
            ingest above is built to reach.
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
