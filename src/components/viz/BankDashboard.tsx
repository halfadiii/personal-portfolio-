"use client";

import { useEffect, useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  BALANCE_RANGE,
  ageHistogram,
  bankMeta,
  loadBankColumns,
  rateByCategory,
  scatterSample,
  selectRows,
  summarise,
  type BankColumns,
  type BankFilters,
} from "@/lib/bank-data";
import { cn } from "@/lib/utils";

/**
 * The Dash app from part-6 of the project, rebuilt to run in the browser.
 *
 * Same four questions it asked — who subscribes, how age is distributed, how
 * balance relates to call duration, and how the campaign varies by month — over
 * the same rows, with the same filters. The difference is that nothing here
 * needs a Python process running: the data is a buffer and the aggregation is
 * a loop, so a filter change redraws in about a millisecond.
 */
const AXIS = {
  fill: "var(--steel)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
} as const;

const YES = "var(--line-green-on-void)";
const NO = "var(--steel)";

export function BankDashboard() {
  const [columns, setColumns] = useState<BankColumns | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BankFilters>({
    job: [],
    marital: [],
    education: [],
    month: [],
    balance: BALANCE_RANGE,
  });

  useEffect(() => {
    let cancelled = false;
    loadBankColumns()
      .then((loaded) => !cancelled && setColumns(loaded))
      .catch((cause: Error) =>
        setError(
          `The dataset did not load (${cause.message}). Reload, or read the figures in the summary below.`,
        ),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    if (!columns) return null;
    const selection = selectRows(columns, filters);
    return {
      selection,
      summary: summarise(columns, selection),
      byJob: rateByCategory(columns, selection, "job", bankMeta.categories.job),
      byMonth: rateByCategory(
        columns,
        selection,
        "month",
        bankMeta.categories.month,
        { sort: false },
      ),
      byOutcome: rateByCategory(
        columns,
        selection,
        "poutcome",
        bankMeta.categories.poutcome,
      ),
      ages: ageHistogram(columns, selection),
      scatter: scatterSample(columns, selection),
    };
  }, [columns, filters]);

  const toggle = (
    key: "job" | "marital" | "education" | "month",
    code: number,
  ) =>
    setFilters((current) => {
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(code)
          ? values.filter((value) => value !== code)
          : [...values, code],
      };
    });

  const reset = () =>
    setFilters({
      job: [],
      marital: [],
      education: [],
      month: [],
      balance: BALANCE_RANGE,
    });

  if (error) {
    return (
      <p className="border-hairline text-steel text-body border p-6">{error}</p>
    );
  }

  if (!view) {
    return (
      <div className="flex flex-col gap-6">
        <div className="border-hairline h-[7rem] border" />
        <div className="border-hairline grid h-[26rem] place-items-center border">
          <p className="label-mono">
            Loading {bankMeta.binary.rows.toLocaleString()} rows…
          </p>
        </div>
      </div>
    );
  }

  const { summary } = view;
  const filtered = summary.rows !== bankMeta.binary.rows;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="filters-title" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="filters-title" className="label-mono text-signal">
            Filters
          </h2>
          <button
            type="button"
            onClick={reset}
            disabled={!filtered}
            className="label-mono border-hairline ease-brief hover:border-signal hover:text-signal border px-3 py-1.5 transition-colors duration-[var(--dur-ui)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset to all {bankMeta.binary.rows.toLocaleString()} rows
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChipGroup
            legend="Job"
            labels={bankMeta.categories.job}
            selected={filters.job}
            onToggle={(code) => toggle("job", code)}
          />
          <div className="flex flex-col gap-6">
            <ChipGroup
              legend="Marital"
              labels={bankMeta.categories.marital}
              selected={filters.marital}
              onToggle={(code) => toggle("marital", code)}
            />
            <ChipGroup
              legend="Education"
              labels={bankMeta.categories.education}
              selected={filters.education}
              onToggle={(code) => toggle("education", code)}
            />
          </div>
        </div>

        <ChipGroup
          legend="Month contacted"
          labels={bankMeta.categories.month}
          selected={filters.month}
          onToggle={(code) => toggle("month", code)}
        />

        <div className="max-w-[28rem]">
          <label className="label-mono mb-3 flex items-baseline justify-between gap-3">
            <span>Account balance, euros</span>
            <span className="text-signal" data-numeric>
              {filters.balance[0].toLocaleString()} –{" "}
              {filters.balance[1].toLocaleString()}
            </span>
          </label>
          <Slider.Root
            className="relative flex h-6 w-full touch-none items-center select-none"
            value={filters.balance}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                balance: [value[0], value[1]],
              }))
            }
            min={BALANCE_RANGE[0]}
            max={BALANCE_RANGE[1]}
            step={100}
            minStepsBetweenThumbs={1}
          >
            <Slider.Track className="bg-hairline relative h-px grow">
              <Slider.Range className="bg-signal absolute h-px" />
            </Slider.Track>
            {["Lowest balance", "Highest balance"].map((label) => (
              <Slider.Thumb
                key={label}
                aria-label={label}
                className="border-signal bg-void ease-brief hover:bg-signal focus-visible:bg-signal block h-4 w-4 border transition-colors duration-[var(--dur-ui)]"
              />
            ))}
          </Slider.Root>
        </div>
      </section>

      <section
        aria-labelledby="summary-title"
        aria-live="polite"
        className="rule-top rule-bottom py-6"
      >
        <h2 id="summary-title" className="sr-only">
          Summary of the current selection
        </h2>
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-5">
          <Kpi
            label="Contacts in view"
            value={summary.rows.toLocaleString()}
            note={
              filtered
                ? `of ${bankMeta.binary.rows.toLocaleString()}`
                : "all rows"
            }
          />
          <Kpi
            label="Subscribed"
            value={`${(summary.rate * 100).toFixed(2)}%`}
            note={`${summary.subscribed.toLocaleString()} contacts`}
          />
          <Kpi
            label="Mean balance"
            value={`€${Math.round(summary.meanBalance).toLocaleString()}`}
            note={`median €${Math.round(summary.medianBalance).toLocaleString()}`}
          />
          <Kpi
            label="Mean call"
            value={`${Math.round(summary.meanDuration)}s`}
            note="last contact duration"
          />
          <Kpi
            label="Mean age"
            value={`${summary.meanAge.toFixed(1)}`}
            note="years"
          />
        </dl>
      </section>

      {summary.rows === 0 ? (
        <p className="border-hairline text-steel text-body border p-6">
          No contacts match that combination. Widen the balance range, or reset
          the filters.
        </p>
      ) : (
        <div className="grid gap-12 xl:grid-cols-2">
          <Panel
            index="01"
            title="Who subscribes"
            caption={`Subscription rate by job, ${summary.rows.toLocaleString()} contacts in view. Ordered by rate, not by size; the exact counts are in the table below.`}
          >
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={view.byJob}
                layout="vertical"
                margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke="var(--hairline)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) =>
                    `${(value * 100).toFixed(0)}%`
                  }
                  tick={AXIS}
                  tickLine={false}
                  axisLine={{ stroke: "var(--hairline)" }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  tick={AXIS}
                  tickLine={false}
                  axisLine={{ stroke: "var(--hairline)" }}
                />
                <Bar dataKey="rate" fill={YES} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            index="02"
            title="Age distribution"
            caption="Contacts by age band, split by outcome. Subscribers are the lighter block; the two are stacked so the total height is the population of that band."
          >
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={view.ages}
                margin={{ top: 4, right: 8, bottom: 44, left: 4 }}
              >
                <CartesianGrid stroke="var(--hairline)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={{ stroke: "var(--hairline)" }}
                  label={{
                    value: "age",
                    position: "insideBottom",
                    offset: -14,
                    ...AXIS,
                  }}
                />
                <YAxis
                  tick={AXIS}
                  tickLine={false}
                  width={54}
                  axisLine={{ stroke: "var(--hairline)" }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={24}
                  wrapperStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--steel)",
                    paddingTop: 12,
                  }}
                />
                <Bar
                  stackId="age"
                  dataKey="declined"
                  name="Declined"
                  fill={NO}
                  isAnimationActive={false}
                />
                <Bar
                  stackId="age"
                  dataKey="subscribed"
                  name="Subscribed"
                  fill={YES}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            index="03"
            title="Balance against call duration"
            caption={`A ${view.scatter.length.toLocaleString()}-point sample of the selection. Subscribers are drawn in the lighter mark; call duration is the strongest single signal in the data, and it shows here.`}
          >
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 4, right: 12, bottom: 24, left: 4 }}>
                <CartesianGrid stroke="var(--hairline)" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="balance"
                  name="Balance"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={{ stroke: "var(--hairline)" }}
                  label={{
                    value: "balance (€)",
                    position: "insideBottom",
                    offset: -14,
                    ...AXIS,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="duration"
                  name="Duration"
                  tick={AXIS}
                  tickLine={false}
                  width={54}
                  axisLine={{ stroke: "var(--hairline)" }}
                  label={{
                    value: "call (s)",
                    angle: -90,
                    position: "insideLeft",
                    ...AXIS,
                  }}
                />
                <Scatter
                  data={view.scatter}
                  isAnimationActive={false}
                  shape="circle"
                >
                  {view.scatter.map((point, i) => (
                    <Cell
                      key={i}
                      fill={point.outcome ? YES : NO}
                      fillOpacity={point.outcome ? 0.75 : 0.28}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            index="04"
            title="Campaign by month"
            caption="Contacts made each month, with the subscription rate over the top. May carries the campaign; the months that convert are not the months that get called."
          >
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart
                data={view.byMonth}
                margin={{ top: 4, right: 48, bottom: 40, left: 4 }}
              >
                <CartesianGrid stroke="var(--hairline)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={{ stroke: "var(--hairline)" }}
                />
                <YAxis
                  yAxisId="left"
                  tick={AXIS}
                  tickLine={false}
                  width={54}
                  axisLine={{ stroke: "var(--hairline)" }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(value: number) =>
                    `${(value * 100).toFixed(0)}%`
                  }
                  tick={AXIS}
                  tickLine={false}
                  width={48}
                  axisLine={{ stroke: "var(--hairline)" }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={24}
                  wrapperStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--steel)",
                    paddingTop: 8,
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="total"
                  name="Contacts"
                  fill={NO}
                  fillOpacity={0.5}
                  isAnimationActive={false}
                />
                <Scatter
                  yAxisId="right"
                  dataKey="rate"
                  name="Subscription rate"
                  fill={YES}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {summary.rows > 0 ? (
        <details className="border-hairline border">
          <summary className="label-mono text-signal cursor-pointer px-4 py-3">
            The figures behind these charts, as a table
          </summary>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Subscription rate table, scrollable"
          >
            <table className="text-small w-full border-collapse text-left">
              <caption className="sr-only">
                Subscription rate by job and by previous campaign outcome for
                the current selection.
              </caption>
              <thead>
                <tr className="rule-top rule-bottom">
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Group
                  </th>
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Contacts
                  </th>
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Subscribed
                  </th>
                  <th scope="col" className="label-mono text-signal px-4 py-2">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...view.byJob, ...view.byOutcome].map((bucket, i) => (
                  <tr
                    key={`${bucket.label}-${i}`}
                    className="rule-bottom last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="label-mono text-signal px-4 py-2"
                    >
                      {bucket.label}
                    </th>
                    <td className="label-mono px-4 py-2" data-numeric>
                      {bucket.total.toLocaleString()}
                    </td>
                    <td className="label-mono px-4 py-2" data-numeric>
                      {bucket.subscribed.toLocaleString()}
                    </td>
                    <td className="label-mono px-4 py-2" data-numeric>
                      {(bucket.rate * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-mono">{label}</dt>
      <dd className="text-signal text-sub font-mono leading-none" data-numeric>
        {value}
      </dd>
      <dd className="label-mono">{note}</dd>
    </div>
  );
}

function ChipGroup({
  legend,
  labels,
  selected,
  onToggle,
}: {
  legend: string;
  labels: readonly string[];
  selected: number[];
  onToggle: (code: number) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="label-mono mb-2">
        {legend}
        {selected.length ? ` · ${selected.length} selected` : " · all"}
      </legend>
      <div className="flex flex-wrap gap-2">
        {labels.map((label, code) => {
          const on = selected.includes(code);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(code)}
              className={cn(
                "label-mono ease-brief border px-3 py-1.5 transition-colors duration-[var(--dur-ui)]",
                on
                  ? "border-signal text-signal"
                  : "border-hairline text-steel hover:border-steel",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Panel({
  index,
  title,
  caption,
  children,
}: {
  index: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="m-0 flex flex-col gap-4">
      <figcaption className="flex flex-col gap-2">
        <p className="label-mono">
          <span className="text-signal">{index}</span> / {title.toLowerCase()}
        </p>
        <h3 className="font-display text-sub leading-tight">{title}</h3>
        <p className="measure text-small text-steel">{caption}</p>
      </figcaption>
      <div className="w-full">{children}</div>
    </figure>
  );
}
