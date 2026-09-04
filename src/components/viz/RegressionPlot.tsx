"use client";

import { useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import {
  ROUTE_STROKE,
  fitSeries,
  straddlesZero,
  type WaitSnapshot,
} from "@/lib/snapshot";
import { cn } from "@/lib/utils";

const CHART_HEIGHT = 420;

/**
 * §6.6 — rainfall against excess wait, filtered by line and by year.
 *
 * Each dot is one month on one line. The vertical axis is additional platform
 * time with month-of-year and the pandemic period already partialled out, so
 * the cloud and the fitted line are the same estimate rather than two
 * different ones drawn on top of each other.
 *
 * Colour comes from NYC transit line signage and is always paired with a dash
 * pattern and a direct label, so nothing is encoded in colour alone (§8).
 */
export function RegressionPlot({ snapshot }: { snapshot: WaitSnapshot }) {
  const routeIds = snapshot.routes.map((route) => route.id);
  const [activeRoutes, setActiveRoutes] = useState<string[]>(routeIds);

  const years = useMemo(() => {
    const all = snapshot.points.map((point) => point.year);
    return [Math.min(...all), Math.max(...all)] as [number, number];
  }, [snapshot.points]);

  const [yearRange, setYearRange] = useState<[number, number]>(years);

  const visible = useMemo(
    () =>
      snapshot.points.filter(
        (point) =>
          activeRoutes.includes(point.route) &&
          point.year >= yearRange[0] &&
          point.year <= yearRange[1],
      ),
    [snapshot.points, activeRoutes, yearRange],
  );

  // The band is only drawn across the range the data actually covers: a fit
  // extrapolated back to a month with no rain at all is not an observation.
  const wetRange = useMemo(() => {
    const all = snapshot.points.map((point) => point.wetHoursPct);
    return [Math.min(...all), Math.max(...all)] as [number, number];
  }, [snapshot.points]);

  const toggleRoute = (id: string) =>
    setActiveRoutes((current) =>
      current.includes(id)
        ? current.length === 1
          ? current
          : current.filter((route) => route !== id)
        : [...current, id],
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <fieldset className="m-0 border-0 p-0">
          <legend className="label-mono mb-2">Lines</legend>
          <div className="flex flex-wrap gap-2">
            {snapshot.routes.map((route) => {
              const on = activeRoutes.includes(route.id);
              return (
                <button
                  key={route.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleRoute(route.id)}
                  className={cn(
                    "label-mono ease-brief flex items-center gap-2 border px-3 py-1.5 transition-colors duration-[var(--dur-ui)]",
                    on
                      ? "border-signal text-signal"
                      : "border-hairline text-steel hover:border-steel",
                  )}
                >
                  <svg width="22" height="8" aria-hidden className="shrink-0">
                    <line
                      x1="0"
                      x2="22"
                      y1="4"
                      y2="4"
                      stroke={on ? ROUTE_STROKE[route.color] : "var(--steel)"}
                      strokeWidth="2"
                      strokeDasharray={
                        route.dash === "0" ? undefined : route.dash
                      }
                    />
                  </svg>
                  {route.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="lg:w-[22rem]">
          <label className="label-mono mb-3 flex items-baseline justify-between gap-3">
            <span>Years included</span>
            <span className="text-signal" data-numeric>
              {yearRange[0]} – {yearRange[1]}
            </span>
          </label>
          <Slider.Root
            className="relative flex h-6 w-full touch-none items-center select-none"
            value={yearRange}
            onValueChange={(value) => setYearRange([value[0], value[1]])}
            min={years[0]}
            max={years[1]}
            step={1}
            minStepsBetweenThumbs={1}
            aria-label="Year range"
          >
            <Slider.Track className="bg-hairline relative h-px grow">
              <Slider.Range className="bg-signal absolute h-px" />
            </Slider.Track>
            {["Earliest year", "Latest year"].map((label) => (
              <Slider.Thumb
                key={label}
                aria-label={label}
                className="border-signal bg-void ease-brief hover:bg-signal focus-visible:bg-signal block h-4 w-4 border transition-colors duration-[var(--dur-ui)]"
              />
            ))}
          </Slider.Root>
          {/* Excluding 2020-21 is the first thing anyone sensible tries. */}
          <p className="label-mono mt-2">
            Drag past 2021 to drop the pandemic months.
          </p>
        </div>
      </div>

      <figure className="m-0">
        <div
          className="w-full"
          style={{ height: CHART_HEIGHT }}
          role="img"
          aria-label={`Scatter of wet-hour share against adjusted excess wait time for ${activeRoutes.join(", ")}, ${yearRange[0]} to ${yearRange[1]}, with fitted lines and confidence bands. The fitted coefficients are in the table below.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 8, right: 16, bottom: 36, left: 8 }}>
              <CartesianGrid
                stroke="var(--hairline)"
                strokeDasharray="0"
                vertical={false}
              />
              <XAxis
                type="number"
                dataKey="wetHoursPct"
                domain={[Math.floor(wetRange[0]), Math.ceil(wetRange[1])]}
                tick={{
                  fill: "var(--steel)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
                tickLine={false}
                axisLine={{ stroke: "var(--hairline)" }}
                label={{
                  value: "share of the month's hours with rain (%)",
                  position: "insideBottom",
                  offset: -18,
                  fill: "var(--steel)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
              />
              <YAxis
                type="number"
                dataKey="excessWaitMinutes"
                tick={{
                  fill: "var(--steel)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
                tickLine={false}
                axisLine={{ stroke: "var(--hairline)" }}
                width={64}
                label={{
                  value: "excess wait (min, adj.)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--steel)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                }}
              />

              {snapshot.routes
                .filter((route) => activeRoutes.includes(route.id))
                .map((route) => {
                  const fit = snapshot.fits.find((f) => f.route === route.id);
                  const stroke = ROUTE_STROKE[route.color];
                  return [
                    fit ? (
                      <Area
                        key={`${route.id}-band`}
                        data={fitSeries(fit, wetRange[0], wetRange[1])}
                        /* A range area: the band is between the two bounds,
                           not between the upper bound and the axis. */
                        dataKey="band"
                        type="linear"
                        stroke="none"
                        fill={stroke}
                        fillOpacity={0.16}
                        isAnimationActive={false}
                        activeDot={false}
                      />
                    ) : null,
                    <Scatter
                      key={`${route.id}-points`}
                      data={visible.filter((point) => point.route === route.id)}
                      fill={stroke}
                      fillOpacity={0.55}
                      shape="circle"
                      isAnimationActive={false}
                    />,
                    fit ? (
                      <Line
                        key={`${route.id}-fit`}
                        data={fitSeries(fit, wetRange[0], wetRange[1])}
                        dataKey="fit"
                        type="linear"
                        stroke={stroke}
                        strokeWidth={2}
                        strokeDasharray={
                          route.dash === "0" ? undefined : route.dash
                        }
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    ) : null,
                  ];
                })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <figcaption className="label-mono mt-4">
          One dot is one month on one line, {snapshot.windowStart} to{" "}
          {snapshot.windowEnd}; {visible.length} of {snapshot.points.length}{" "}
          shown. The vertical axis has month-of-year and the 2020&ndash;21
          period partialled out, so the cloud and the line are the same
          estimate. Bands are 95% confidence intervals on the slope. Snapshot
          generated {snapshot.generatedAt}.
        </figcaption>
      </figure>

      <details className="border-hairline border">
        <summary className="label-mono text-signal cursor-pointer px-4 py-3">
          Fitted coefficients as a table
        </summary>
        <div className="overflow-x-auto">
          <table className="text-small w-full border-collapse text-left">
            <caption className="sr-only">
              Fitted effect of rainfall on excess wait time, by subway line.
            </caption>
            <thead>
              <tr className="rule-top rule-bottom">
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Line
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Baseline wait
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Min per wet point
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  95% CI
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  n
                </th>
                <th scope="col" className="label-mono text-signal px-4 py-2">
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.fits.map((fit) => (
                <tr key={fit.route} className="rule-bottom last:border-b-0">
                  <th scope="row" className="label-mono text-signal px-4 py-2">
                    {fit.route}
                  </th>
                  <td className="label-mono px-4 py-2" data-numeric>
                    {fit.interceptMinutes.toFixed(2)} min
                  </td>
                  <td className="label-mono px-4 py-2" data-numeric>
                    {fit.minutesPerWetPoint.toFixed(4)}
                  </td>
                  <td className="label-mono px-4 py-2" data-numeric>
                    {fit.ciLow.toFixed(4)} – {fit.ciHigh.toFixed(4)}
                  </td>
                  <td className="label-mono px-4 py-2" data-numeric>
                    {fit.n}
                  </td>
                  <td className="label-mono px-4 py-2">
                    {straddlesZero(fit)
                      ? "interval contains zero"
                      : "distinguishable from zero"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
