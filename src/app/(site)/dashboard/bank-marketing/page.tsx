import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { BankDashboardPanel } from "@/components/viz/BankDashboardPanel";
import { bankMeta } from "@/lib/bank-data";

export const metadata: Metadata = {
  title: "Bank marketing dashboard",
  description:
    "A live dashboard over 43,193 bank sales calls. Pick a group by job, education, month or balance and see how often they said yes.",
};

type Feature = { feature: string; importance: number };

/**
 * The live half of the bank marketing project.
 *
 * Every figure on this page was produced by `scripts/build-bank-dashboard.py`,
 * which replays the notebooks' own cleaning, normalisation, and models against
 * `bank-full.csv`. Nothing here was typed in by hand.
 *
 * The words were rewritten on 2026-10-04, at his request, for somebody who has
 * never trained a model. Each section now says its finding in a sentence, and
 * the table that proves it (model scores, test statistics, cleaning steps) is
 * folded under one line for whoever wants it. Nothing was removed: the same
 * tables, the same numbers, one click away.
 */
export default function BankMarketingDashboardPage() {
  const { overall, models, tests, cleaning, source } = bankMeta;

  const best = models.reduce((a, b) => (b.rocAuc > a.rocAuc ? b : a));
  const leans = (best as typeof best & { topFeatures?: Feature[] })
    .topFeatures?.[0];
  const saidNo = Math.round((1 - overall.subscriptionRate) * 100);
  const dropped = cleaning.sourceRows - overall.rows;

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
          A Portuguese bank phoned people to sell a fixed-term savings account
          and logged {cleaning.sourceRows.toLocaleString()} calls. Of the{" "}
          {overall.rows.toLocaleString()} with complete records, only{" "}
          {(overall.subscriptionRate * 100).toFixed(1)}% said yes. Filter by
          job, marital status, education, month or balance, and watch that
          number move.
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
          Can a model tell who&rsquo;ll say yes?
        </h2>
        <p className="measure text-lead text-steel mt-5">
          I trained three models on most of the calls and tested them on the
          rest, which they had never seen. The best was{" "}
          {best.name.toLowerCase()}: hand it one person who said yes and one
          who said no, and it picks the right one about{" "}
          {Math.round(best.rocAuc * 100)} times in 100.
        </p>
        <p className="measure text-body text-steel mt-4">
          Two things to know before trusting that. {saidNo}% of people said no,
          so a model that always guesses no is right {saidNo}% of the time,
          which is why plain accuracy is a bad score here.
          {leans?.feature === "duration"
            ? ` And it leans most on how long the call lasted, about ${Math.round(leans.importance * 100)}% of its decision. You only know that once the call is over, so it's better at explaining who said yes than at choosing who to phone.`
            : ""}
        </p>

        <details className="border-hairline mt-8 border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            The scores for all three models
          </summary>
          <div className="px-4 pb-5">
            {/* A container that scrolls must be keyboard reachable, or its
                overflow is unreadable without a mouse (axe
                scrollable-region-focusable). */}
            <div
              className="overflow-x-auto"
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
            <p className="label-mono mt-4">
              Trained on 80% of the cleaned rows and scored on the other 20%,
              split so both halves carry the same yes rate.
            </p>

            {models
              .filter((model) => "topFeatures" in model)
              .map((model) => (
                <div key={model.name} className="mt-8">
                  <p className="label-mono text-signal">
                    What {model.name.toLowerCase()} leaned on
                  </p>
                  <ol className="mt-4 flex list-none flex-col p-0">
                    {(
                      model as typeof model & { topFeatures: Feature[] }
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
          </div>
        </details>
      </section>

      <section aria-labelledby="tests-title" className="section-gap">
        <h2 id="tests-title" className="font-display text-section">
          Are those differences real, or luck?
        </h2>
        <p className="measure text-lead text-steel mt-5">
          Real. Job, education, having a home loan, and how the last campaign
          went each change how often people say yes, by far more than chance
          would explain. So the gaps in the charts above aren&rsquo;t noise.
        </p>

        <details className="border-hairline mt-8 border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            The {tests.length} tests behind that
          </summary>
          <div className="px-4 pb-5">
            {/* A container that scrolls must be keyboard reachable, or its
                overflow is unreadable without a mouse (axe
                scrollable-region-focusable). */}
            <div
              className="overflow-x-auto"
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
          </div>
        </details>
      </section>

      <section aria-labelledby="cleaning-title" className="section-gap">
        <h2 id="cleaning-title" className="font-display text-section">
          How the data was cleaned.
        </h2>
        <p className="measure text-lead text-steel mt-5">
          The charts don&rsquo;t read the raw file. {dropped.toLocaleString()}{" "}
          of the {cleaning.sourceRows.toLocaleString()} calls were dropped
          because the person&rsquo;s job or education wasn&rsquo;t recorded,
          which leaves {overall.rows.toLocaleString()}.
        </p>

        <details className="border-hairline mt-8 border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            Every step, with what it cost
          </summary>
          <ol className="flex list-none flex-col px-4 pb-5">
            {cleaning.steps.map((step, i) => (
              <li
                key={step.step}
                className="rule-bottom grid gap-x-6 gap-y-1 py-4 last:border-b-0 sm:grid-cols-[3rem_1fr_10rem]"
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
        </details>

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
