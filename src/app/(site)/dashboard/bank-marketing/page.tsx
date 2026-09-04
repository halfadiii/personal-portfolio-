import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { BankDashboardPanel } from "@/components/viz/BankDashboardPanel";
import { bankMeta } from "@/lib/bank-data";

export const metadata: Metadata = {
  title: "Bank marketing dashboard",
  description:
    "A live dashboard over 43,193 bank telemarketing contacts: filter by job, marital status, education, month, and balance, and watch subscription rate move. Three classifiers, scored on a held-out split.",
};

/**
 * The live half of the bank marketing project.
 *
 * Every figure on this page was produced by `scripts/build-bank-dashboard.py`,
 * which replays the notebooks' own cleaning, normalisation, and models against
 * `bank-full.csv`. Nothing here was typed in by hand.
 */
export default function BankMarketingDashboardPage() {
  const { overall, models, tests, cleaning, source } = bankMeta;

  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live dashboard"
          meta={`${overall.rows.toLocaleString()} contacts / in your browser`}
        />
        <h1 className="font-display text-hero leading-[0.88]">
          Who actually says yes.
        </h1>
        <p className="measure text-lead text-steel">
          A Portuguese bank ran a telemarketing campaign for term deposits and
          logged {cleaning.sourceRows.toLocaleString()} calls. Only{" "}
          {(overall.subscriptionRate * 100).toFixed(1)}% of them ended in a
          subscription. This is the dashboard from that analysis, rebuilt to run
          in the page: every filter re-aggregates all{" "}
          {overall.rows.toLocaleString()} rows on the spot, with no server and
          no pre-baked combinations.
        </p>
        <p className="label-mono">
          Python · scikit-learn · SQLite · originally Dash and Plotly
        </p>
      </header>

      <div className="mt-14">
        <BankDashboardPanel />
      </div>

      <section aria-labelledby="models-title" className="section-gap">
        <h2 id="models-title" className="font-display text-section">
          Three models, one held-out split.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          Trained on 80% of the cleaned rows and scored on the remaining 20%,
          stratified so both splits carry the same subscription rate. Accuracy
          alone flatters every one of them — 88% of these contacts said no, so a
          model that always says no scores 88. F1 and ROC AUC are the honest
          columns.
        </p>

        {/* A container that scrolls must be keyboard reachable, or its
            overflow is unreadable without a mouse (axe
            scrollable-region-focusable). */}
        <div
          className="mt-10 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Classifier performance table, scrollable"
        >
          <table className="text-small w-full border-collapse text-left">
            <caption className="sr-only">
              Classifier performance on the held-out test split.
            </caption>
            <thead>
              <tr className="rule-top rule-bottom">
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Model
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Accuracy
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Precision
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Recall
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  F1
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  ROC AUC
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.name} className="rule-bottom last:border-b-0">
                  <th scope="row" className="px-4 py-3 align-top">
                    <span className="text-signal text-body">{model.name}</span>
                    <span className="label-mono mt-1 block">{model.note}</span>
                  </th>
                  {[
                    model.accuracy,
                    model.precision,
                    model.recall,
                    model.f1,
                    model.rocAuc,
                  ].map((value, i) => (
                    <td
                      key={i}
                      className="label-mono px-4 py-3 align-top"
                      data-numeric
                    >
                      {value.toFixed(4)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {models
          .filter((model) => "topFeatures" in model)
          .map((model) => (
            <div key={model.name} className="mt-10">
              <p className="label-mono text-signal">
                What {model.name.toLowerCase()} leaned on
              </p>
              <ol className="mt-4 flex list-none flex-col p-0">
                {(
                  model as typeof model & {
                    topFeatures: { feature: string; importance: number }[];
                  }
                ).topFeatures.map((feature) => (
                  <li
                    key={feature.feature}
                    /* Stacked below 640px: a fixed label column plus a bar plus
                       a value does not fit on a 320px screen. */
                    className="rule-bottom grid gap-x-4 gap-y-1 py-2 last:border-b-0 sm:grid-cols-[13rem_1fr_4rem] sm:items-center"
                  >
                    <span className="label-mono text-signal truncate">
                      {feature.feature}
                    </span>
                    <span
                      aria-hidden
                      className="bg-signal h-1.5 max-w-full"
                      style={{
                        width: `${Math.min(100, feature.importance * 100 * 1.6)}%`,
                      }}
                    />
                    <span className="label-mono sm:text-right" data-numeric>
                      {(feature.importance * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
      </section>

      <section aria-labelledby="tests-title" className="section-gap">
        <h2 id="tests-title" className="font-display text-section">
          What the statistics say.
        </h2>
        {/* A container that scrolls must be keyboard reachable, or its
            overflow is unreadable without a mouse (axe
            scrollable-region-focusable). */}
        <div
          className="mt-10 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Hypothesis test results table, scrollable"
        >
          <table className="text-small w-full border-collapse text-left">
            <caption className="sr-only">
              Hypothesis tests run against the cleaned dataset.
            </caption>
            <thead>
              <tr className="rule-top rule-bottom">
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Question
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Test
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  Statistic
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  p
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-3">
                  n
                </th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.name} className="rule-bottom last:border-b-0">
                  <th scope="row" className="px-4 py-3 align-top">
                    <span className="text-signal text-body">{test.name}</span>
                    <span className="label-mono measure mt-1 block">
                      {test.detail}
                    </span>
                  </th>
                  <td className="label-mono px-4 py-3 align-top">
                    {test.test}
                  </td>
                  <td className="label-mono px-4 py-3 align-top" data-numeric>
                    {test.statistic.toFixed(2)}
                  </td>
                  <td className="label-mono px-4 py-3 align-top" data-numeric>
                    {test.pValue === 0
                      ? "< 1e-300"
                      : test.pValue.toExponential(2)}
                  </td>
                  <td className="label-mono px-4 py-3 align-top" data-numeric>
                    {test.n.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cleaning-title" className="section-gap">
        <h2 id="cleaning-title" className="font-display text-section">
          How the rows got here.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          The dashboard above is not reading the raw file. These are the steps
          between it and the chart, in order, with what each one cost.
        </p>
        <ol className="mt-10 flex list-none flex-col p-0">
          {cleaning.steps.map((step, i) => (
            <li
              key={step.step}
              className="rule-top last:rule-bottom grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[3rem_1fr_10rem]"
            >
              <span className="label-mono text-signal" data-numeric>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-body text-steel">{step.step}</span>
              <span className="label-mono sm:text-right" data-numeric>
                {step.rows.toLocaleString()} rows
                {"removed" in step && step.removed
                  ? ` · −${step.removed.toLocaleString()}`
                  : ""}
                {"reassigned" in step && step.reassigned
                  ? ` · ${step.reassigned.toLocaleString()} moved`
                  : ""}
              </span>
            </li>
          ))}
        </ol>

        <p className="label-mono mt-8">
          Source: {source.name}.{" "}
          <a
            href={source.url}
            rel="noreferrer"
            target="_blank"
            className="decoration-hairline hover:decoration-signal text-signal underline underline-offset-4"
          >
            UCI Machine Learning Repository
          </a>
          . {source.citation}
        </p>
      </section>

      <p className="mt-8">
        <Link href="/#work" className="tap label-mono hover:text-signal inline-flex">
          Back to selected work
        </Link>
      </p>
    </div>
  );
}
