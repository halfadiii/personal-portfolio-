"use client";

import { useEffect, useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  formatHalf,
  formatWeek,
  netflix,
  type Market,
  type MarketStatus,
  type TrailerViews,
} from "@/lib/netflix-data";
import { cn } from "@/lib/utils";

/**
 * The five questions the repository's README asks, answered over its own
 * model, one panel each.
 *
 * Colour is only ever an encoding: film against series is orange against blue,
 * English against non-English is solid against dashed, and in the premiere
 * panel each colour is a market's status that week. Everything a colour says
 * is also said in text.
 */

const AXIS = {
  fill: "var(--steel)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
} as const;

const FILM = "var(--line-orange-on-void)";
const TV = "var(--line-blue-on-void)";
const SERIES = [
  { key: "c0", colour: FILM, dash: undefined },
  { key: "c1", colour: FILM, dash: "5 4" },
  { key: "c2", colour: TV, dash: undefined },
  { key: "c3", colour: TV, dash: "5 4" },
] as const;

/*
 * `text` is chosen by measured contrast, not by taste: black on the blue is
 * 3.51:1 and fails, off-white on it is 5.72:1. Green (5.24) and red (5.18) pass
 * with black; off-white on either would fail.
 */
const STATUS: Record<MarketStatus, { label: string; colour: string; text: string }> = {
  climbed: { label: "climbed", colour: "var(--line-green-on-void)", text: "var(--void)" },
  reentered: { label: "came back in", colour: "var(--line-blue-on-void)", text: "var(--signal)" },
  held: { label: "held its place", colour: "var(--signal)", text: "var(--void)" },
  fell: { label: "slipped", colour: "var(--line-red-on-void)", text: "var(--void)" },
  dropped: { label: "dropped out", colour: "var(--line-red-on-void)", text: "var(--void)" },
  absent: { label: "not charting", colour: "transparent", text: "var(--steel)" },
};

const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

export function NetflixDashboard() {
  const { periods } = netflix;
  const [periodIndex, setPeriodIndex] = useState(periods.length - 1);
  const period = periods[periodIndex];
  const previous = periodIndex > 0 ? periods[periodIndex - 1] : null;

  return (
    <div className="flex flex-col gap-16">
      <section aria-labelledby="kpi-title" className="flex flex-col gap-6">
        <h2 id="kpi-title" className="sr-only">
          Headline figures for the selected half-year
        </h2>
        <fieldset className="m-0 border-0 p-0">
          <legend className="label-mono mb-2">Half-year</legend>
          <div className="flex flex-wrap gap-2">
            {periods.map((p, i) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={i === periodIndex}
                onClick={() => setPeriodIndex(i)}
                className={cn(
                  "label-mono ease-brief border px-3 py-1.5 transition-colors duration-[var(--dur-ui)]",
                  i === periodIndex
                    ? "border-signal text-signal"
                    : "border-hairline text-steel hover:border-steel",
                )}
              >
                {formatHalf(p.label)}
              </button>
            ))}
          </div>
        </fieldset>

        <dl
          aria-live="polite"
          className="border-hairline grid gap-6 border p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4"
        >
          <Kpi
            label="Hours viewed"
            value={`${period.hoursB.toFixed(2)}B`}
            note={previous ? `${signed(period.changePct ?? 0)} on ${formatHalf(previous.label)}` : "the first half in the data"}
          />
          <Kpi
            label="Titles tracked"
            value={period.titles.toLocaleString()}
            note={previous ? `${signed((100 * (period.titles - previous.titles)) / previous.titles)} on ${formatHalf(previous.label)}` : "every title Netflix reported"}
          />
          <Kpi
            label="Hours per title"
            value={`${period.avgM.toFixed(2)}M`}
            note={previous ? `${signed((100 * (period.avgM - previous.avgM)) / previous.avgM)} on ${formatHalf(previous.label)}` : "the mean, across the catalogue"}
          />
          <Kpi
            label="Series' share of hours"
            value={pct(period.byType.Show.pctHours)}
            note={`on ${pct(period.byType.Show.pctTitles)} of the titles`}
          />
        </dl>
      </section>

      <div className="grid gap-16 xl:grid-cols-2">
        <Growth />
        <Concentration periodIndex={periodIndex} />
        <ContentType periodIndex={periodIndex} />
        <Language />
      </div>

      <WeeklyTrend />
      <Markets />
      <Premiere />
      <Trailers />
    </div>
  );
}

/**
 * Trailer views against hours viewed, for 20 hand-matched titles.
 *
 * The counts come from /api/netflix/trailers, fetched from YouTube at most once
 * a day and never stored, because YouTube's policies cap keeping them at 30
 * days. No correlation figure is drawn: twenty points, cumulative counts and an
 * arrow that can point either way do not support one, and the same policies
 * rule out building new metrics from YouTube's data. The chart shows the raw
 * pairs and lets them speak.
 */
function Trailers() {
  const { trailers } = netflix;
  const [data, setData] = useState<TrailerViews | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/netflix/trailers")
      .then((response) => response.json() as Promise<TrailerViews>)
      .then((result) => alive && setData(result))
      .catch(() => alive && setData({ available: false, reason: "YouTube could not be reached" }));
    return () => {
      alive = false;
    };
  }, []);

  const rows = trailers.map((t) => ({ ...t, views: data?.views?.[t.videoId] ?? null }));
  const plotted = rows.filter((row) => row.views !== null && row.views > 0);
  /*
   * Plotted as log10 on linear axes, not with Recharts' log scale. That scale
   * ignored the domain set on it and clamped the largest point, Bridgerton at
   * 890M hours, onto the plot's top edge. Measured in the browser, not
   * guessed: the topmost dot's y was the plot's top y exactly. Taking the
   * logarithm here keeps the range under our control.
   */
  const points = (type: "Show" | "Movie") =>
    plotted
      .filter((row) => row.type === type)
      .map((row) => ({ x: Math.log10(row.views as number), y: Math.log10(row.hoursM), title: row.title }));
  const logDomain = (values: number[]): [number, number] =>
    values.length
      ? [Math.floor(Math.log10(Math.min(...values))), Math.ceil(Math.log10(Math.max(...values)))]
      : [0, 1];
  const xDomain = logDomain(plotted.map((row) => row.views as number));
  const yDomain = logDomain(plotted.map((row) => row.hoursM));
  const powers = ([lo, hi]: [number, number]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const compact = (n: number) =>
    n >= 1e9 ? `${n / 1e9}B` : n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n);
  const fetched = data?.fetchedAt ? formatWeek(data.fetchedAt.slice(0, 10)) : null;

  return (
    <Panel
      index="08"
      title="Trailer views against hours watched"
      caption={`${trailers.length} titles from ${formatHalf("2026H1")}, ${trailers.filter((t) => t.type === "Show").length} series and ${trailers.filter((t) => t.type === "Movie").length} films, released and first charting in the same half-year so their trailers have had a similar time to gather views, and spread from the biggest hit to titles that spent one week at the bottom of the Top 10. Each trailer was matched by hand to the official Netflix channel for the title's home market. Films and series are kept apart, because film trailers draw far more views at similar viewing levels. Both axes are logarithmic.`}
    >
      {data === null ? (
        <p className="label-mono">Fetching current view counts from YouTube…</p>
      ) : !data.available ? (
        <p className="label-mono">
          Trailer view counts are unavailable right now ({data.reason}). The titles and their Netflix hours are in the
          table below.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
              <CartesianGrid stroke="var(--hairline)" />
              <XAxis
                type="number"
                dataKey="x"
                domain={xDomain}
                ticks={powers(xDomain)}
                tickFormatter={(v: number) => compact(10 ** v)}
                tick={AXIS}
                tickLine={false}
                axisLine={{ stroke: "var(--hairline)" }}
                label={{ value: "trailer views on YouTube", position: "insideBottom", offset: -12, ...AXIS }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={yDomain}
                ticks={powers(yDomain)}
                tickFormatter={(v: number) => compact(10 ** v * 1e6)}
                tick={AXIS}
                tickLine={false}
                axisLine={{ stroke: "var(--hairline)" }}
                width={52}
                label={{ value: "hours viewed", angle: -90, position: "insideLeft", ...AXIS }}
              />
              <ZAxis range={[48, 48]} />
              <Scatter data={points("Show")} fill={TV} isAnimationActive={false} name="Series" />
              <Scatter data={points("Movie")} fill={FILM} isAnimationActive={false} name="Films" />
            </ScatterChart>
          </ResponsiveContainer>
          <Key
            items={[
              { label: "series", colour: TV },
              { label: "films", colour: FILM },
            ]}
          />
        </>
      )}

      <p className="label-mono">
        Trailer view counts from{" "}
        <a href="https://www.youtube.com" rel="noreferrer" className="text-signal underline underline-offset-4">
          YouTube
        </a>
        {fetched ? `, fetched ${fetched}` : ""}, refreshed at most daily and never stored. They run to today, not to
        release day, and a hit sends people back to its trailer, so read this as two things that move together or
        don&rsquo;t, not as one causing the other.
      </p>

      <details className="border-hairline border px-4 py-3">
        <summary className="label-mono cursor-pointer">All {trailers.length} titles and their trailers</summary>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Trailer views and Netflix hours for each title, scrollable">
          <table className="text-small w-full min-w-[34rem] border-collapse text-left">
            <caption className="sr-only">Each title&rsquo;s trailer views on YouTube beside its Netflix hours and chart run</caption>
            <thead>
              <tr className="rule-bottom">
                <th scope="col" className="label-mono text-signal py-2 pr-3">Title</th>
                <th scope="col" className="label-mono text-signal py-2 pr-3">Trailer views</th>
                <th scope="col" className="label-mono text-signal py-2 pr-3">Hours viewed</th>
                <th scope="col" className="label-mono text-signal py-2 pr-3">Best global rank</th>
                <th scope="col" className="label-mono text-signal py-2">Weeks in Top 10</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (a.type === b.type ? b.hoursM - a.hoursM : a.type === "Show" ? -1 : 1))
                .map((row) => (
                  <tr key={row.videoId} className="rule-bottom">
                    <th scope="row" className="label-mono py-1.5 pr-3 font-normal">
                      <a
                        href={`https://www.youtube.com/watch?v=${row.videoId}`}
                        rel="noreferrer"
                        className="hover:text-signal underline-offset-4 hover:underline"
                      >
                        {row.title}
                        <span className="sr-only">, watch the trailer on YouTube</span>
                      </a>
                      <span className="text-steel"> · {row.type === "Show" ? "series" : "film"} · {row.channel}</span>
                    </th>
                    <td className="label-mono py-1.5 pr-3" data-numeric>
                      {row.views === null ? "—" : row.views.toLocaleString()}
                    </td>
                    <td className="label-mono py-1.5 pr-3" data-numeric>{row.hoursM.toLocaleString()}M</td>
                    <td className="label-mono py-1.5 pr-3" data-numeric>#{row.peak}</td>
                    <td className="label-mono py-1.5" data-numeric>{row.weeks}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

/* ------------------------------------------------------------------ panels */

function Growth() {
  const { periods } = netflix;
  const base = periods[0];
  const rows = periods.map((p) => ({
    label: formatHalf(p.label),
    hours: (100 * p.hoursB) / base.hoursB,
    titles: (100 * p.titles) / base.titles,
    perTitle: (100 * p.avgM) / base.avgM,
  }));
  const last = rows[rows.length - 1];

  return (
    <Panel
      index="01"
      title="More titles, less each"
      caption={`Indexed to ${formatHalf(base.label)} = 100. By ${last.label} the catalogue is ${(last.titles - 100).toFixed(1)}% larger and total hours ${(last.hours - 100).toFixed(1)}% higher, so hours per title fell ${(100 - last.perTitle).toFixed(1)}%. The growth is breadth, not bigger hits.`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} />
          <YAxis domain={[94, 108]} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} width={36} />
          <Line dataKey="titles" stroke="var(--signal)" strokeWidth={1.5} dot isAnimationActive={false} name="Titles" />
          <Line dataKey="hours" stroke="var(--steel)" strokeWidth={1.5} dot isAnimationActive={false} name="Total hours" />
          <Line dataKey="perTitle" stroke="var(--line-red-on-void)" strokeWidth={1.5} dot isAnimationActive={false} name="Hours per title" />
        </LineChart>
      </ResponsiveContainer>
      <Key
        items={[
          { label: `Titles ${last.titles.toFixed(1)}`, colour: "var(--signal)" },
          { label: `Total hours ${last.hours.toFixed(1)}`, colour: "var(--steel)" },
          { label: `Hours per title ${last.perTitle.toFixed(1)}`, colour: "var(--line-red-on-void)" },
        ]}
      />
    </Panel>
  );
}

function Concentration({ periodIndex }: { periodIndex: number }) {
  const period = netflix.periods[periodIndex];
  const { concentration } = period;
  const [stop, setStop] = useState(2);
  const at = concentration.stops[Math.min(stop, concentration.stops.length - 1)];
  const half = concentration.halfOfHoursTitles;

  return (
    <Panel
      index="02"
      title="How much a few titles carry"
      caption={`Share of ${formatHalf(period.label)}'s hours earned by the most-watched titles, rank on a log scale. Half of all hours came from ${half.toLocaleString()} titles, ${pct((100 * half) / concentration.titles)} of the catalogue.${period.bucketPct ? ` Netflix's "Other" rollups (${pct(period.bucketPct, 2)} of hours) are not titles and are left out.` : ""}`}
    >
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={concentration.curve.map(([n, share]) => ({ n, share }))}
          margin={{ top: 8, right: 16, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis
            dataKey="n"
            type="number"
            scale="log"
            domain={[1, concentration.titles]}
            ticks={[1, 10, 100, 1000, 10000]}
            tickFormatter={(n: number) => n.toLocaleString()}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
            allowDataOverflow
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
            width={44}
          />
          <Area dataKey="share" stroke="var(--signal)" fill="var(--signal)" fillOpacity={0.08} isAnimationActive={false} />
          <ReferenceDot x={at.n} y={at.pct} r={5} fill="var(--signal)" stroke="var(--void)" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex flex-col gap-3">
        <label id="concentration-label" className="label-mono">
          The top <span className="text-signal">{at.n.toLocaleString()}</span>{" "}
          {at.n === 1 ? "title" : "titles"} earned{" "}
          <span className="text-signal">{pct(at.pct)}</span> of the hours
        </label>
        <Slider.Root
          className="relative flex h-6 w-full touch-none items-center select-none"
          min={0}
          max={concentration.stops.length - 1}
          step={1}
          value={[Math.min(stop, concentration.stops.length - 1)]}
          onValueChange={([v]) => setStop(v)}
          aria-labelledby="concentration-label"
        >
          <Slider.Track className="bg-hairline relative h-px grow">
            <Slider.Range className="bg-signal absolute h-full" />
          </Slider.Track>
          <Slider.Thumb
            aria-label="How many of the top titles to count"
            aria-valuetext={`Top ${at.n} titles, ${pct(at.pct)} of hours`}
            className="border-signal bg-void block size-4 border focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </Slider.Root>
      </div>

      <details className="border-hairline border px-4 py-3">
        <summary className="label-mono cursor-pointer">
          The ten most-watched titles, {formatHalf(period.label)}
        </summary>
        <ol className="mt-3 flex list-none flex-col gap-1 p-0">
          {period.top.map((t, i) => (
            <li key={t.title} className="label-mono flex justify-between gap-4">
              <span>
                <span className="text-signal">{String(i + 1).padStart(2, "0")}</span> {t.title}
                <span className="text-steel"> · {t.type === "Show" ? "series" : "film"}</span>
              </span>
              <span data-numeric>{t.hoursM.toLocaleString()}M h</span>
            </li>
          ))}
        </ol>
      </details>
    </Panel>
  );
}

function ContentType({ periodIndex }: { periodIndex: number }) {
  const period = netflix.periods[periodIndex];
  const { Show, Movie } = period.byType;
  const rows = [
    { label: "Series", titles: Show.pctTitles, hours: Show.pctHours },
    { label: "Films", titles: Movie.pctTitles, hours: Movie.pctHours },
  ];
  const ratio = Show.avgM / Movie.avgM;

  return (
    <Panel
      index="03"
      title="Series earn more per title"
      caption={`${formatHalf(period.label)}: series are ${pct(Show.pctTitles)} of titles and ${pct(Show.pctHours)} of hours. A series averages ${Show.avgM.toFixed(2)}M hours against a film's ${Movie.avgM.toFixed(2)}M, ${ratio.toFixed(1)} times as much. Films went from ${netflix.periods[0].byType.Movie.titles.toLocaleString()} titles to ${netflix.periods[netflix.periods.length - 1].byType.Movie.titles.toLocaleString()} across the three halves while their hours went from ${netflix.periods[0].byType.Movie.hoursB}B to ${netflix.periods[netflix.periods.length - 1].byType.Movie.hoursB}B.`}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--hairline)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} />
          <YAxis type="category" dataKey="label" width={64} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} />
          <Bar dataKey="titles" fill="var(--steel)" isAnimationActive={false} name="Share of titles" />
          <Bar dataKey="hours" isAnimationActive={false} name="Share of hours">
            {rows.map((row) => (
              <Cell key={row.label} fill={row.label === "Series" ? TV : FILM} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Key
        items={[
          { label: "share of titles", colour: "var(--steel)" },
          { label: "share of hours, series", colour: TV },
          { label: "share of hours, films", colour: FILM },
        ]}
      />
    </Panel>
  );
}

function Language() {
  const { language, source } = netflix;
  const maxHours = Math.max(...language.map((l) => l.hoursB));
  const maxTitles = Math.max(...language.map((l) => l.titles));

  return (
    <Panel
      index="04"
      title="Charting is not the same as watching"
      caption={`Every global Top 10 week since ${formatWeek(source.firstWeek)}. Non-English films put more distinct titles on the chart than English films and earned less than half the hours.`}
    >
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Hours and titles by category, scrollable">
        <table className="text-small w-full min-w-[26rem] border-collapse text-left">
          <caption className="sr-only">
            Global Top 10 hours and distinct titles by category, {source.firstWeek} to {source.lastWeek}
          </caption>
          <thead>
            <tr className="rule-bottom">
              <th scope="col" className="label-mono text-signal py-2 pr-3">Category</th>
              <th scope="col" className="label-mono text-signal py-2 pr-3">Hours</th>
              <th scope="col" className="label-mono text-signal py-2">Titles that charted</th>
            </tr>
          </thead>
          <tbody>
            {language.map((l, i) => (
              <tr key={l.label} className="rule-bottom">
                <th scope="row" className="label-mono py-3 pr-3 font-normal">{l.label}</th>
                <td className="py-3 pr-3">
                  <Bar1 value={l.hoursB} max={maxHours} colour={SERIES[i].colour} dashed={Boolean(SERIES[i].dash)} label={`${l.hoursB.toFixed(1)}B`} />
                </td>
                <td className="py-3">
                  <Bar1 value={l.titles} max={maxTitles} colour="var(--steel)" label={l.titles.toLocaleString()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function WeeklyTrend() {
  const { trend, categories, source } = netflix;
  const [on, setOn] = useState<boolean[]>([true, true, true, true]);
  const [smooth, setSmooth] = useState(true);

  const rows = useMemo(() => {
    if (!smooth) return trend;
    return trend.map((row, i) => {
      const window = trend.slice(Math.max(0, i - 3), i + 1);
      const out: Record<string, number | string> = { week: row.week };
      for (const s of SERIES) {
        out[s.key] = window.reduce((sum, w) => sum + (w[s.key as `c${number}`] ?? 0), 0) / window.length;
      }
      return out;
    });
  }, [trend, smooth]);

  const years = useMemo(
    () => trend.filter((row, i) => i === 0 || row.week.slice(0, 4) !== trend[i - 1].week.slice(0, 4)).map((r) => r.week),
    [trend],
  );

  return (
    <Panel
      index="05"
      title="Week by week"
      caption={`Hours earned by the global Top 10 in each category, every week from ${formatWeek(source.firstWeek)} to ${formatWeek(source.lastWeek)}. Only the top ten titles carry weekly hours, so this is the shape of the hits, not of all viewing.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={on[i]}
            onClick={() => setOn((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            className={cn(
              "label-mono ease-brief inline-flex items-center gap-2 border px-3 py-1.5 transition-colors duration-[var(--dur-ui)]",
              on[i] ? "border-signal text-signal" : "border-hairline text-steel hover:border-steel",
            )}
          >
            <Swatch colour={SERIES[i].colour} dashed={Boolean(SERIES[i].dash)} />
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={smooth}
          onClick={() => setSmooth((v) => !v)}
          className={cn(
            "label-mono ease-brief border px-3 py-1.5 transition-colors duration-[var(--dur-ui)]",
            smooth ? "border-signal text-signal" : "border-hairline text-steel hover:border-steel",
          )}
        >
          4-week average
        </button>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis dataKey="week" ticks={years} tickFormatter={(w: string) => w.slice(0, 4)} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} />
          <YAxis tickFormatter={(v: number) => `${v}M`} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} width={52} />
          {SERIES.map((s, i) =>
            on[i] ? (
              <Line key={s.key} dataKey={s.key} stroke={s.colour} strokeDasharray={s.dash} strokeWidth={1.25} dot={false} isAnimationActive={false} name={categories[i]} />
            ) : null,
          )}
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function Markets() {
  const { countries } = netflix;
  const [kind, setKind] = useState<"alignMovie" | "alignShow">("alignMovie");
  const [picked, setPicked] = useState("Canada");
  const points = countries
    .filter((c) => c[kind] !== null)
    .map((c) => ({ name: c.name, x: c[kind] as number, y: c.stickWeeks }));
  const chosen = countries.find((c) => c.name === picked);
  const byStick = [...countries].sort((a, b) => b.stickWeeks - a.stickWeeks);
  const rankOf = (name: string) => byStick.findIndex((c) => c.name === name) + 1;
  const noun = kind === "alignMovie" ? "film" : "series";

  return (
    <Panel
      index="06"
      title="How long a hit holds a market"
      caption={`Netflix publishes no hours by country, only rank, so both axes are stated proxies. Up: how many weeks a title stays in that country's Top 10 on average. Right: how often, over the last 52 weeks, its number one ${noun} was the global English-language number one. ${countries.length} markets.`}
    >
      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="m-0 border-0 p-0">
          <legend className="label-mono mb-2">Compare number ones for</legend>
          <div className="flex gap-2">
            {(["alignMovie", "alignShow"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "label-mono ease-brief border px-3 py-1.5 transition-colors duration-[var(--dur-ui)]",
                  kind === k ? "border-signal text-signal" : "border-hairline text-steel hover:border-steel",
                )}
              >
                {k === "alignMovie" ? "Films" : "Series"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="label-mono flex flex-col gap-2">
          Find a market
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="text-small border-hairline bg-void focus:border-signal border px-3 py-1.5 outline-none"
          >
            {[...countries]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
          <CartesianGrid stroke="var(--hairline)" />
          <XAxis type="number" dataKey="x" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} label={{ value: "matches the global #1", position: "insideBottom", offset: -12, ...AXIS }} />
          <YAxis type="number" dataKey="y" domain={[1, 6.5]} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--hairline)" }} width={36} label={{ value: "weeks", angle: -90, position: "insideLeft", ...AXIS }} />
          <ZAxis range={[36, 36]} />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.name} fill={p.name === picked ? "var(--signal)" : "var(--steel)"} fillOpacity={p.name === picked ? 1 : 0.45} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {chosen ? (
        <p className="label-mono" aria-live="polite">
          <span className="text-signal">{chosen.name}</span>: a title stays {chosen.stickWeeks} weeks on average ({rankOf(chosen.name)} of {countries.length} for staying power) · its number one {noun} matched the global number one in{" "}
          {chosen[kind] === null ? "no comparable week" : pct(chosen[kind] as number)} of weeks · {chosen.titles.toLocaleString()} titles charted there since 2021
        </p>
      ) : null}

      <details className="border-hairline border px-4 py-3">
        <summary className="label-mono cursor-pointer">All {countries.length} markets as a table</summary>
        <div className="mt-3 max-h-80 overflow-auto" tabIndex={0} role="region" aria-label="Every market, scrollable">
          <table className="text-small w-full min-w-[30rem] border-collapse text-left">
            <caption className="sr-only">Staying power and global alignment for every market</caption>
            <thead>
              <tr className="rule-bottom">
                <th scope="col" className="label-mono text-signal py-2 pr-3">Market</th>
                <th scope="col" className="label-mono text-signal py-2 pr-3">Weeks a title stays</th>
                <th scope="col" className="label-mono text-signal py-2 pr-3">Films match global #1</th>
                <th scope="col" className="label-mono text-signal py-2">Series match global #1</th>
              </tr>
            </thead>
            <tbody>
              {byStick.map((c) => (
                <tr key={c.name} className="rule-bottom">
                  <th scope="row" className="label-mono py-1.5 pr-3 font-normal">{c.name}</th>
                  <td className="label-mono py-1.5 pr-3" data-numeric>{c.stickWeeks.toFixed(2)}</td>
                  <td className="label-mono py-1.5 pr-3" data-numeric>{c.alignMovie === null ? "—" : pct(c.alignMovie)}</td>
                  <td className="label-mono py-1.5" data-numeric>{c.alignShow === null ? "—" : pct(c.alignShow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

function Premiere() {
  const { premiere } = netflix;
  const { season1, season2, markets } = premiere;
  const count = (status: MarketStatus) => markets.filter((m) => m.status === status).length;
  const climbs = markets.filter((m) => m.status === "climbed").map((m) => (m.was ?? 0) - (m.now ?? 0));
  const [focus, setFocus] = useState<Market | null>(null);
  const order: MarketStatus[] = ["climbed", "reentered", "held", "fell", "dropped", "absent"];

  return (
    <Panel
      index="07"
      title="A premiere wakes up the season before it"
      caption={`${premiere.title}: Season 1 had been off the global chart since ${formatWeek(season1.lastOnGlobalChart)}, and in 2025 and 2026 it charted in at most ${season1.maxMarketsBeforePremiere2025On} market${season1.maxMarketsBeforePremiere2025On === 1 ? "" : "s"} in any week. Season 2 arrived the week of ${formatWeek(premiere.season2FirstWeek)} at number ${season2.firstWeek.rank} globally with ${season2.firstWeek.hoursM}M hours, then went to number ${season2.latestWeek.rank} with ${season2.latestWeek.hoursM}M hours in ${season2.latestWeek.markets} markets. Season 1 came back with it: ${season1.marketsFirstWeek} markets in the premiere week, ${season1.marketsLatestWeek} of ${markets.length} a week later${season1.globalRankLatestWeek ? `, and number ${season1.globalRankLatestWeek} on the global chart` : ""}.`}
    >
      <ul className="flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
        {order
          .filter((s) => count(s))
          .map((s) => (
            <li key={s} className="label-mono inline-flex items-center gap-2">
              <span aria-hidden className="inline-block size-3 border" style={{ background: STATUS[s].colour, borderColor: s === "absent" ? "var(--hairline)" : STATUS[s].colour }} />
              <span className="text-signal" data-numeric>{count(s)}</span> {STATUS[s].label}
              {s === "climbed" && climbs.length ? ` (up to ${Math.max(...climbs)} places)` : ""}
            </li>
          ))}
      </ul>

      <p className="label-mono">
        Season 1 in each market, week of {formatWeek(premiere.week)} against the week before. Hover or focus a market for its ranks.
      </p>
      <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 p-0" aria-label={`Season 1 in each of ${markets.length} markets`}>
        {markets.map((m) => (
          <li key={m.name}>
            <button
              type="button"
              onMouseEnter={() => setFocus(m)}
              onFocus={() => setFocus(m)}
              onClick={() => setFocus(m)}
              aria-label={describeMarket(m)}
              className={cn(
                "label-mono flex h-9 w-full items-center justify-center border text-[0.65rem]",
                m.status === "absent" ? "border-hairline" : "border-transparent",
              )}
              style={{
                color: STATUS[m.status].text,
                ...(m.status === "absent" ? {} : { background: STATUS[m.status].colour }),
              }}
            >
              {netflix.countries.find((c) => c.name === m.name)?.iso2 ?? m.name.slice(0, 2)}
            </button>
          </li>
        ))}
      </ul>
      <p className="label-mono min-h-[1.5em]" aria-live="polite">
        {focus ? describeMarket(focus) : " "}
      </p>
    </Panel>
  );
}

function describeMarket(m: Market): string {
  switch (m.status) {
    case "climbed":
      return `${m.name}: up from #${m.was} to #${m.now}`;
    case "reentered":
      return `${m.name}: back in at #${m.now}, not charting the week before`;
    case "held":
      return `${m.name}: held at #${m.now}`;
    case "fell":
      return `${m.name}: down from #${m.was} to #${m.now}`;
    case "dropped":
      return `${m.name}: dropped out from #${m.was}`;
    case "absent":
      return `${m.name}: not in the Top 10 either week`;
  }
}

/* ------------------------------------------------------------------ parts */

function Panel({ index, title, caption, children }: { index: string; title: string; caption: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-4">
      <figcaption className="flex flex-col gap-2">
        <p className="label-mono">
          <span className="text-signal">{index}</span> / {title.toLowerCase()}
        </p>
        <h3 className="font-display text-sub leading-tight">{title}</h3>
        <p className="measure text-small text-steel">{caption}</p>
      </figcaption>
      <div className="flex w-full flex-col gap-4">{children}</div>
    </figure>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
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

function Key({ items }: { items: { label: string; colour: string }[] }) {
  return (
    <ul className="flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
      {items.map((item) => (
        <li key={item.label} className="label-mono inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: item.colour }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Swatch({ colour, dashed }: { colour: string; dashed?: boolean }) {
  return (
    <svg aria-hidden width="18" height="6" viewBox="0 0 18 6">
      <line x1="0" y1="3" x2="18" y2="3" stroke={colour} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

function Bar1({ value, max, colour, dashed, label }: { value: number; max: number; colour: string; dashed?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className="inline-block h-2.5"
        style={{
          width: `${Math.max(2, (100 * value) / max) * 0.6}%`,
          background: dashed ? `repeating-linear-gradient(90deg, ${colour} 0 6px, transparent 6px 9px)` : colour,
        }}
      />
      <span className="label-mono" data-numeric>
        {label}
      </span>
    </span>
  );
}
