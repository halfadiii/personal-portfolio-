"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LivePayload } from "@/app/api/subway/live/route";
import {
  DIRECTIONS,
  GRACE_SECONDS,
  Inference,
  POLL_SECONDS,
  STATIONS,
  metricsFor,
  place,
  stationIndex,
  stationName,
  type Arrival,
  type Direction,
  type Metrics,
  type Placed,
} from "@/lib/subway-live";
import { cn } from "@/lib/utils";
import { LineStrip, type StripHandle } from "./LineStrip";

/**
 * The pipeline, running on the L, right now.
 *
 * Every thirty seconds this asks `/api/subway/live` for one poll of the MTA's
 * feed and applies the same arrival inference the warehouse applies: hold the
 * last prediction each trip-stop pair carried, and when a pair stops appearing,
 * decide whether a train arrived or a trip was pulled.
 *
 * It used to be a simulation, because the realtime feeds carry no CORS headers
 * and a browser cannot read them. The proxy fixed that. What went with the
 * simulation is the error column — it knew where its trains really were, so it
 * could grade its own inference — and losing it is the honest outcome, because
 * **no such column exists in production either.** That is the premise of the
 * whole project. The method is checked in the pipeline's own test suite, on
 * fixtures whose answer is known by construction, which is a better place for
 * it than a toy in a web page.
 *
 * Two clocks run here and they are deliberately not synchronised. Trains are
 * re-placed every animation frame, because they are physical objects moving
 * continuously. The predictions change only when a poll lands, because a belief
 * is not continuous. Watching the gap open between them is the demo.
 */

/** Bedford Av: the busiest platform on the line, so a headway appears soonest. */
const DEFAULT_FOCUS = "L08";
/** How many polls the table keeps. Seven rows is about three minutes. */
const HISTORY = 7;

type View = {
  payload: LivePayload | null;
  error: string | null;
  polls: number;
  discarded: number;
  watchingSince: number | null;
  arrivals: Arrival[];
  rows: { t: number; predictions: Map<string, number> | null }[];
};

const EMPTY: View = {
  payload: null,
  error: null,
  polls: 0,
  discarded: 0,
  watchingSince: null,
  arrivals: [],
  rows: [],
};

export function SubwayDemo() {
  const [direction, setDirection] = useState<Direction>("S");
  const [focus, setFocus] = useState(DEFAULT_FOCUS);
  const [running, setRunning] = useState(true);
  const [view, setView] = useState<View>(EMPTY);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const inference = useRef(new Inference());
  const rows = useRef<View["rows"]>([]);
  const watched = useRef<string | null>(null);
  const directionRef = useRef(direction);
  directionRef.current = direction;

  const handleRef = useRef<StripHandle>({
    trains: [],
    focus,
    watched: null,
    t: Math.floor(Date.now() / 1000),
    beam: [],
    direction,
    payload: null,
  });

  /* -- polling ---------------------------------------------------------- */

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/subway/live", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setView((previous) => ({
          ...previous,
          error: body?.error ?? "The live feed could not be read.",
        }));
        return;
      }
      const payload = (await response.json()) as LivePayload;

      // The inference sees every train on the line, both directions: an arrival
      // is an arrival whichever way it was going, and the panel filters after.
      inference.current.accept(payload);

      // Keep following the same train while it is still in service.
      const inDirection = payload.trains.filter(
        (train) => train.direction === directionRef.current,
      );
      if (
        !watched.current ||
        !inDirection.some((train) => train.id === watched.current)
      ) {
        watched.current =
          [...inDirection].sort(
            (a, b) => b.predictions.length - a.predictions.length,
          )[0]?.id ?? null;
        // A new train means the old train's rows describe somebody else.
        rows.current = [];
      }

      const followed = payload.trains.find(
        (train) => train.id === watched.current,
      );
      rows.current = [
        ...rows.current,
        {
          t: payload.generatedAt || payload.fetchedAt,
          predictions: followed
            ? new Map(followed.predictions.map((p) => [p.stop, p.at]))
            : null,
        },
      ].slice(-HISTORY);

      setView({
        payload,
        error: null,
        polls: inference.current.polls,
        discarded: inference.current.discarded,
        watchingSince: inference.current.watchingSince,
        arrivals: [...inference.current.arrivals],
        rows: [...rows.current],
      });
    } catch {
      setView((previous) => ({
        ...previous,
        error: "The live feed could not be reached.",
      }));
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [poll, running]);

  /* -- the wall clock, and the strip ------------------------------------ */

  useEffect(() => {
    let frame = 0;
    let lastSecond = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const seconds = Date.now() / 1000;
      handleRef.current.t = seconds;

      // Re-placed every frame rather than every poll: placement is a function
      // of the clock, so this is what makes a train creep toward a platform
      // between snapshots instead of jumping when one lands.
      const payload = handleRef.current.payload;
      if (payload) {
        handleRef.current.trains = payload.trains
          .filter((train) => train.direction === handleRef.current.direction)
          .map((train) => place(train, seconds))
          .filter((placed): placed is Placed => placed !== null);
      }

      // The countdowns are whole seconds; React only needs waking that often.
      const whole = Math.floor(seconds);
      if (whole !== lastSecond) {
        lastSecond = whole;
        setNow(whole);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Hand the frame loop what it needs without making it a React dependency.
  handleRef.current.payload = view.payload;
  handleRef.current.direction = direction;
  handleRef.current.focus = focus;
  handleRef.current.watched = watched.current;
  handleRef.current.beam =
    view.payload?.trains.find((train) => train.id === watched.current)
      ?.predictions ?? [];

  /* -- derived ---------------------------------------------------------- */

  const metrics: Metrics = useMemo(
    () => metricsFor(view.arrivals, focus, direction),
    [view.arrivals, focus, direction],
  );

  const recent = useMemo(
    () => [...view.arrivals].slice(-6).reverse(),
    [view.arrivals],
  );

  /** Stops the followed train is predicting, in line order, nearest six. */
  const columns = useMemo(() => {
    const seen = new Set<string>();
    for (const row of view.rows) {
      for (const stop of row.predictions?.keys() ?? []) seen.add(stop);
    }
    return [...seen]
      .sort((a, b) => (stationIndex(a) ?? 0) - (stationIndex(b) ?? 0))
      .slice(0, 6);
  }, [view.rows]);

  const feedAge = view.payload
    ? Math.max(0, now - view.payload.generatedAt)
    : null;

  const clock = (epoch: number) =>
    new Date(epoch * 1000).toLocaleTimeString("en-US", {
      hour12: false,
      timeZone: "America/New_York",
    });

  return (
    <div className="flex flex-col gap-8">
      {/* -- controls ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((on) => !on)}
            className="label-mono border-signal text-signal ease-brief hover:bg-signal hover:text-void border px-4 py-2 transition-colors duration-[var(--dur-ui)]"
          >
            {running ? "Pause" : "Resume"}
          </button>

          {(["S", "N"] as Direction[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setDirection(option);
                watched.current = null;
                rows.current = [];
              }}
              aria-pressed={direction === option}
              className={cn(
                "label-mono ease-brief border px-3 py-2 transition-colors duration-[var(--dur-ui)]",
                direction === option
                  ? "border-signal text-signal"
                  : "border-hairline text-steel hover:border-signal hover:text-signal",
              )}
            >
              to {DIRECTIONS[option].label}
            </button>
          ))}
        </div>

        <p className="label-mono" aria-live="polite">
          {view.error ? (
            <span className="text-signal">{view.error}</span>
          ) : view.payload ? (
            <>
              <span className="text-signal" data-numeric>
                {clock(view.payload.generatedAt)}
              </span>{" "}
              / MTA feed, {feedAge}s old /{" "}
              <span data-numeric>{view.payload.trains.length}</span> L trains
              running
            </>
          ) : (
            "asking the MTA…"
          )}
        </p>
      </div>

      {/* -- the diagram ------------------------------------------------- */}
      <div className="border-hairline w-full border p-4 sm:p-6">
        {view.payload ? (
          <LineStrip handleRef={handleRef} running={running && !view.error} />
        ) : (
          <p className="label-mono grid min-h-[12rem] place-items-center p-6 text-center">
            {view.error ??
              "Fetching one poll of the MTA's L feed. It is protobuf, and it is decoded on the server, because the feed sends no CORS headers and a browser is not allowed to read it."}
          </p>
        )}
      </div>

      <p className="label-mono">
        Live, from the MTA&rsquo;s <code className="text-signal">gtfs-l</code>{" "}
        endpoint, polled every {POLL_SECONDS} seconds. Between platforms a train
        is drawn where its own predicted arrival implies it is, so the mark is
        the feed&rsquo;s belief rather than a measured position. The feed never
        publishes one.
      </p>

      <div className="grid gap-10 xl:grid-cols-[1.35fr_1fr]">
        {/* -- the feed ------------------------------------------------- */}
        <section
          aria-labelledby="watch-title"
          className="flex min-w-0 flex-col gap-4"
        >
          <div>
            <p className="label-mono">
              <span className="text-signal">01</span> / the feed, every{" "}
              {POLL_SECONDS} seconds
            </p>
            <h3 id="watch-title" className="font-display text-sub mt-2">
              Watch a stop drop off the list.
            </h3>
            <p className="measure text-small text-steel mt-2">
              Each row is one poll for train{" "}
              <span className="text-signal">{watched.current ?? "—"}</span>.
              Columns are the stops it is predicting. The numbers revise as it
              gets closer, and when it passes a platform that column empties.
              That gap is the arrival, and it is the only signal the feed gives.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Predicted arrival times published for the followed train, one
                row per poll of the live MTA feed.
              </caption>
              <thead>
                <tr className="rule-top rule-bottom">
                  <th scope="col" className="label-mono text-signal py-2 pr-4">
                    poll
                  </th>
                  {columns.map((stop) => (
                    <th
                      key={stop}
                      scope="col"
                      className="label-mono text-signal max-w-[7rem] truncate py-2 pr-4"
                    >
                      {stationName(stop)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row, index) => {
                  const previous = view.rows[index - 1];
                  return (
                    <tr key={row.t} className="rule-bottom last:border-b-0">
                      <td
                        data-numeric
                        className="label-mono py-2 pr-4 whitespace-nowrap"
                      >
                        {clock(row.t)}
                      </td>
                      {columns.map((stop) => {
                        const at = row.predictions?.get(stop);
                        const wasThere = previous?.predictions?.has(stop);
                        // Present before, gone now: this is the moment.
                        const dropped = !at && wasThere;
                        return (
                          <td
                            key={stop}
                            data-numeric
                            className={cn(
                              "label-mono py-2 pr-4 whitespace-nowrap",
                              at ? "text-signal" : "text-steel",
                            )}
                          >
                            {at ? (
                              clock(at)
                            ) : dropped ? (
                              <span className="text-signal">↳ arrived</span>
                            ) : (
                              <span aria-hidden>·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {view.rows.length === 0 ? (
                  <tr>
                    <td
                      className="label-mono py-4"
                      colSpan={columns.length + 1}
                    >
                      waiting for the first poll…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* -- what it produces ------------------------------------------ */}
        <section
          aria-labelledby="metrics-title"
          className="flex flex-col gap-4"
        >
          <div>
            <p className="label-mono">
              <span className="text-signal">02</span> / what the inference
              produces
            </p>
            <h3 id="metrics-title" className="font-display text-sub mt-2">
              Headway, and excess wait.
            </h3>
            <p className="measure text-small text-steel mt-2">
              Built only from arrivals this page has inferred since you opened
              it — the same inputs the warehouse has, and nothing else. There is
              no error column, because nobody publishes when the train actually
              arrived. That absence is the whole reason the pipeline exists.
            </p>
          </div>

          <label className="label-mono flex flex-col gap-2">
            Station being measured
            <select
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              className="border-hairline bg-panel text-signal focus-visible:border-signal text-small border px-3 py-2 font-mono"
            >
              {STATIONS.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>

          <dl className="rule-top rule-bottom grid grid-cols-2 gap-5 py-5">
            <Metric
              label="Arrivals inferred"
              value={String(view.arrivals.length)}
              /* Line-wide, because that is the figure that shows the thing
                 working: it climbs every poll. The platform being measured
                 gets a handful an hour, which is a fact about the L rather
                 than about the pipeline. */
              note={`across the L · ${view.discarded} dropped as early`}
            />
            <Metric
              label="Mean headway"
              value={
                metrics.meanHeadway
                  ? `${metrics.meanHeadway.toFixed(1)} min`
                  : "—"
              }
              note={`${metrics.arrivals} here, ${metrics.headways} gap${
                metrics.headways === 1 ? "" : "s"
              }`}
            />
            <Metric
              label="Excess wait"
              value={
                metrics.excessWait !== null
                  ? `${metrics.excessWait.toFixed(2)} min`
                  : "—"
              }
              note="beyond an even service"
            />
            <Metric
              label="Watching since"
              value={view.watchingSince ? clock(view.watchingSince) : "—"}
              note={`${view.polls} poll${view.polls === 1 ? "" : "s"}`}
            />
          </dl>

          {metrics.headways === 0 ? (
            <p className="label-mono">
              A headway needs two trains to have arrived at{" "}
              {stationName(focus)} while this page was open. Leave it running,
              or pick a busier platform.
            </p>
          ) : null}

          <div>
            <p className="label-mono mb-2">Most recent inferred arrivals</p>
            <ul className="flex list-none flex-col p-0">
              {recent.map((arrival) => (
                <li
                  key={`${arrival.tripId}-${arrival.stop}-${arrival.at}`}
                  className="rule-bottom label-mono flex items-baseline justify-between gap-4 py-2 last:border-b-0"
                >
                  <span className="text-signal truncate">{arrival.tripId}</span>
                  <span className="text-steel min-w-0 flex-1 truncate">
                    {stationName(arrival.stop)}
                  </span>
                  <span data-numeric>{clock(arrival.at)}</span>
                </li>
              ))}
              {recent.length === 0 ? (
                <li className="label-mono py-2">
                  none yet — an arrival is a row disappearing, so it takes two
                  polls to see one
                </li>
              ) : null}
            </ul>
            <p className="label-mono mt-3">
              A prediction that vanishes while still more than {GRACE_SECONDS}s
              in the future is a cancellation or a re-route, not an arrival, and
              is dropped.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * One figure in the panel.
 *
 * The note is a second `<dd>` rather than a `<p>`, which looks like a detail
 * and is not: a definition list may only contain `dt`/`dd` groups, and a
 * paragraph inside one is a real accessibility failure that axe catches. A
 * `dt` is allowed as many `dd`s as it likes, so the caption is simply another
 * description of the same term.
 */
function Metric({
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
