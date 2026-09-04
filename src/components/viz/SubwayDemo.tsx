"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SceneHandle } from "@/components/three/SubwayScene";
import { useCapability } from "@/components/motion/capability";
import { useRoom } from "@/components/motion/useRoom";
import {
  L_LINE,
  POLL_SECONDS,
  SubwaySim,
  clock,
  type InferredArrival,
} from "@/lib/subway-sim";
import { cn } from "@/lib/utils";

/**
 * The subway pipeline, running.
 *
 * Trains move on a simulated line; the feed they would publish is generated
 * every thirty seconds; and the same inference the warehouse runs is applied to
 * it live. The prediction table is the part worth watching — the numbers revise
 * poll by poll and then a stop drops off the list, which is the moment an
 * arrival happens and the only trace the real feed ever leaves.
 *
 * Because the simulation knows where the trains actually are, it can also show
 * how far the inference landed from the truth. Production never gets to check
 * its own work like this; that is exactly why the method has to be defensible.
 */
const SubwayScene = dynamic(() => import("@/components/three/SubwayScene"), {
  ssr: false,
});

const SPEEDS = [1, 4, 12] as const;
/** Simulated seconds per real second at 1×. Fast enough to see a poll land. */
const BASE_RATE = 6;

type Snapshot = {
  t: number;
  trains: { id: string; km: number; next: number; delay: number }[];
  watched: string | null;
  rows: { t: number; predictions: { station: number; at: number }[] | null }[];
  recent: InferredArrival[];
  metrics: ReturnType<SubwaySim["metricsAt"]>;
  discarded: number;
};

export function SubwayDemo() {
  const { reducedMotion } = useCapability();
  const [focus, setFocus] = useState(11);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [running, setRunning] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const room = useRoom();

  const simRef = useRef<SubwaySim | null>(null);
  const handleRef = useRef<SceneHandle>({ trains: [], focus, watched: null });
  const watchedRef = useRef<string | null>(null);

  // Kept out of state so the loop never restarts when they change.
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const focusRef = useRef(focus);
  speedRef.current = speed;
  runningRef.current = running;
  focusRef.current = focus;

  useEffect(() => {
    const sim = new SubwaySim({ headwaySeconds: 240, seed: 7 });
    simRef.current = sim;

    // Start mid-service rather than with an empty line.
    for (let i = 0; i < 2200; i += 1) sim.step(1);

    let frame = 0;
    let last = performance.now();
    let sincePublish = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (runningRef.current) {
        const simSeconds = real * BASE_RATE * speedRef.current;
        // Fixed steps keep arrivals from being missed at high speed.
        let remaining = simSeconds;
        while (remaining > 0) {
          const dt = Math.min(1, remaining);
          sim.step(dt);
          remaining -= dt;
        }
      }

      if (
        !watchedRef.current ||
        !sim.trains.some((train) => train.id === watchedRef.current)
      ) {
        watchedRef.current = sim.pickWatchTarget();
      }

      handleRef.current.trains = sim.trains;
      handleRef.current.focus = focusRef.current;
      handleRef.current.watched = watchedRef.current;

      // React only needs the panels, and only a few times a second.
      sincePublish += real;
      if (sincePublish > 0.25) {
        sincePublish = 0;
        setSnapshot({
          t: sim.t,
          trains: sim.trains.map((train) => ({
            id: train.id,
            km: train.km,
            next: train.next,
            delay: train.delay,
          })),
          watched: watchedRef.current,
          rows: watchedRef.current ? sim.watch(watchedRef.current, 7) : [],
          recent: sim.inferred.slice(-6).reverse(),
          metrics: sim.metricsAt(focusRef.current),
          discarded: sim.discarded,
        });
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const injectDelay = useCallback(() => {
    const id = simRef.current?.injectDelay();
    if (id) {
      setFlash(`Held ${id} at its platform for 150 seconds.`);
      window.setTimeout(() => setFlash(null), 4000);
    }
  }, []);

  const watchedTrain = snapshot?.trains.find((t) => t.id === snapshot.watched);

  // Stops still being predicted for the watched train, nearest first.
  const columns = useMemo(() => {
    if (!snapshot?.rows.length) return [] as number[];
    const seen = new Set<number>();
    for (const row of snapshot.rows) {
      for (const p of row.predictions ?? []) seen.add(p.station);
    }
    return [...seen].sort((a, b) => a - b).slice(0, 6);
  }, [snapshot]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            className="label-mono border-signal text-signal ease-brief hover:bg-signal hover:text-void border px-4 py-2 transition-colors duration-[var(--dur-ui)]"
          >
            {running ? "Pause" : "Run"}
          </button>

          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              onClick={() => setSpeed(value)}
              className={cn(
                "label-mono ease-brief border px-3 py-2 transition-colors duration-[var(--dur-ui)]",
                speed === value
                  ? "border-signal text-signal"
                  : "border-hairline text-steel hover:border-steel",
              )}
            >
              {value}×
            </button>
          ))}

          <button
            type="button"
            onClick={injectDelay}
            className="label-mono border-hairline text-steel ease-brief hover:border-signal hover:text-signal border px-3 py-2 transition-colors duration-[var(--dur-ui)]"
          >
            Delay a train
          </button>
        </div>

        <p className="label-mono" aria-live="polite">
          <span className="text-signal" data-numeric>
            {clock(snapshot?.t ?? 0)}
          </span>{" "}
          / simulated clock / {snapshot?.trains.length ?? 0} in service
        </p>
      </div>

      {flash ? (
        <p className="label-mono border-signal text-signal border px-4 py-3">
          {flash}
        </p>
      ) : null}

      <div className="border-hairline relative aspect-[16/10] w-full overflow-hidden border sm:aspect-[16/8]">
        {reducedMotion === false && room ? (
          <div aria-hidden className="absolute inset-0">
            <SubwayScene handleRef={handleRef} />
          </div>
        ) : (
          <p className="label-mono absolute inset-0 grid place-items-center p-6 text-center">
            The moving view needs a screen with some room on it and motion you
            have not asked to reduce. Every number below is still live.
          </p>
        )}
      </div>

      <p className="label-mono">
        Simulated trains on the L, not measured service. Station names and the
        eight-feed registry are real; the trains are generated so the mechanism
        can be watched end to end.
      </p>

      <div className="grid gap-10 xl:grid-cols-[1.35fr_1fr]">
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
              Each row is one poll of the feed for train{" "}
              <span className="text-signal">{snapshot?.watched ?? "—"}</span>.
              Columns are the stops it is predicting. The numbers revise as it
              gets closer, and when it passes a platform that column empties —
              that gap is the arrival, and it is the only signal the feed gives.
            </p>
          </div>

          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Feed predictions per poll, scrollable"
          >
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Predicted arrival times per poll for the train being followed.
              </caption>
              <thead>
                <tr className="rule-top rule-bottom">
                  <th scope="col" className="label-mono text-signal py-2 pr-4">
                    poll
                  </th>
                  {columns.map((station) => (
                    <th
                      key={station}
                      scope="col"
                      className="label-mono text-signal max-w-[7rem] truncate py-2 pr-4"
                    >
                      {L_LINE[station].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot?.rows.map((row, i) => {
                  const previous = snapshot.rows[i - 1];
                  return (
                    <tr key={row.t} className="rule-bottom last:border-b-0">
                      <th
                        scope="row"
                        className="label-mono py-2 pr-4 whitespace-nowrap"
                        data-numeric
                      >
                        {clock(row.t)}
                      </th>
                      {columns.map((station) => {
                        const now = row.predictions?.find(
                          (p) => p.station === station,
                        );
                        const before = previous?.predictions?.find(
                          (p) => p.station === station,
                        );
                        const vanished = !now && Boolean(before);
                        return (
                          <td
                            key={station}
                            className={cn(
                              "label-mono py-2 pr-4 whitespace-nowrap",
                              now ? "text-signal" : "text-hairline",
                              vanished && "text-signal",
                            )}
                            data-numeric
                          >
                            {now ? (
                              clock(now.at)
                            ) : vanished ? (
                              <span title="Prediction vanished: this is an arrival">
                                ↳ arrived
                              </span>
                            ) : (
                              "·"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {watchedTrain ? (
            <p className="label-mono">
              Next stop{" "}
              {L_LINE[Math.min(watchedTrain.next, L_LINE.length - 1)].name}
              {watchedTrain.delay > 20
                ? ` · running ${Math.round(watchedTrain.delay)}s late`
                : " · on time"}
            </p>
          ) : null}
        </section>

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
              Headway, excess wait, and the error.
            </h3>
            <p className="measure text-small text-steel mt-2">
              Built only from inferred arrivals — the same inputs the warehouse
              has. The error column is the part production never sees: how far
              each inferred time landed from where the train actually was.
            </p>
          </div>

          <label className="label-mono flex flex-col gap-2">
            Station being measured
            <select
              value={focus}
              onChange={(event) => setFocus(Number(event.target.value))}
              className="border-hairline bg-panel text-signal focus-visible:border-signal text-small border px-3 py-2 font-mono"
            >
              {L_LINE.map((station, i) => (
                <option key={station.id} value={i}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>

          <dl className="rule-top rule-bottom grid grid-cols-2 gap-5 py-5">
            <Metric
              label="Arrivals inferred"
              value={String(snapshot?.metrics.arrivals ?? 0)}
              note={`${snapshot?.discarded ?? 0} vanished early, dropped`}
            />
            <Metric
              label="Mean headway"
              value={`${(snapshot?.metrics.meanHeadway ?? 0).toFixed(1)} min`}
              note="between consecutive trains"
            />
            <Metric
              label="Excess wait"
              value={`${(snapshot?.metrics.excessWait ?? 0).toFixed(2)} min`}
              note="beyond the timetable"
            />
            <Metric
              label="Inference error"
              value={`${Math.round(snapshot?.metrics.meanError ?? 0)}s`}
              note={`worst ${Math.round(snapshot?.metrics.worstError ?? 0)}s`}
            />
          </dl>

          <div>
            <p className="label-mono mb-2">Most recent inferred arrivals</p>
            <ul className="flex list-none flex-col p-0">
              {(snapshot?.recent ?? []).map((arrival, i) => (
                <li
                  key={`${arrival.trainId}-${arrival.station}-${i}`}
                  className="rule-bottom label-mono flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 last:border-b-0"
                >
                  <span className="text-signal">{arrival.trainId}</span>
                  <span className="max-w-[12rem] flex-1 truncate">
                    {L_LINE[arrival.station].name}
                  </span>
                  <span data-numeric>{clock(arrival.inferredAt)}</span>
                  <span data-numeric className="text-steel">
                    {arrival.errorSeconds >= 0 ? "+" : ""}
                    {Math.round(arrival.errorSeconds)}s
                  </span>
                </li>
              ))}
              {snapshot && snapshot.recent.length === 0 ? (
                <li className="label-mono py-2">
                  Waiting for the first arrival to vanish from the feed…
                </li>
              ) : null}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

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
