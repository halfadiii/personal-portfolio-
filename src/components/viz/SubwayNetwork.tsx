"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapHandle, MapSelection } from "@/components/three/SubwayMap";
import { useCapability } from "@/components/motion/capability";
import { useRoom } from "@/components/motion/useRoom";
import { useOnScreen } from "@/components/three/useOnScreen";
import {
  loadSubwayMap,
  readableInk,
  type SubwayMapData,
} from "@/lib/subway-map";
import { LiveFleet } from "@/lib/subway-fleet-live";
import type { LivePayload } from "@/app/api/subway/live/route";
import { cn } from "@/lib/utils";

/**
 * The whole network, running.
 *
 * The scene owns nothing but drawing: the fleet lives here, is stepped on a
 * rAF loop, and is handed over through a ref so a moving train never triggers
 * a React render. Only hover, selection, and the counter cross back.
 */
const SubwayMap = dynamic(() => import("@/components/three/SubwayMap"), {
  ssr: false,
});

/** `212` → `3:32`, the way a countdown clock reads. */
function away(seconds: number): string {
  if (seconds < 30) return "arriving";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SubwayNetwork() {
  const { reducedMotion, richMotion, pointerFine } = useCapability();
  const [data, setData] = useState<SubwayMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState(true);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [hover, setHover] = useState<MapSelection>(null);
  const [tick, setTick] = useState(0);
  const room = useRoom();

  const { ref: viewport, onScreen } = useOnScreen<HTMLDivElement>();
  const fleetRef = useRef<LiveFleet | null>(null);
  const [feed, setFeed] = useState<{ at: number; placed: number; of: number } | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  /*
    The last snapshot, held separately from the fleet that consumes it.

    These two arrive independently: the network geometry is a 46 KB fetch and
    the snapshot is another, and either can win. Handing the payload straight
    to the fleet meant that whenever the snapshot got there first there was no
    fleet to give it to, it was dropped, and the map sat empty for a full
    thirty seconds until the next poll — intermittently, depending on which
    fetch happened to be quicker. Kept here instead, and applied by whichever
    of the two finishes last.
  */
  const latestRef = useRef<LivePayload | null>(null);
  const handleRef = useRef<MapHandle>({
    fleet: null,
    visible: new Set(),
    labels: true,
  });

  /** Give the fleet the newest snapshot, whenever both of them exist. */
  const applyLatest = useCallback(() => {
    const fleet = fleetRef.current;
    const payload = latestRef.current;
    if (!fleet || !payload) return;
    setFeed({
      at: payload.generatedAt,
      placed: fleet.accept(payload.trains),
      of: payload.trains.length,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSubwayMap()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);

        // Arc length per line, so trains run at a consistent ground speed.
        const lengths = loaded.lines.map((line) => {
          let total = 0;
          const count = line.points.length / 2;
          for (let i = 1; i < count; i += 1) {
            const dx = line.points[i * 2] - line.points[(i - 1) * 2];
            const dz = line.points[i * 2 + 1] - line.points[(i - 1) * 2 + 1];
            total += Math.hypot(dx, dz);
          }
          return total;
        });

        // No `populate`, and nothing to settle: the fleet is whatever the
        // MTA says is out there, and it arrives with the first poll.
        const fleet = new LiveFleet(loaded, lengths);
        fleetRef.current = fleet;
        handleRef.current.fleet = fleet;
        // A snapshot may already be waiting; see `latestRef`.
        applyLatest();
      })
      .catch((cause: Error) =>
        setError(
          `The network data did not load (${cause.message}). Reload the page.`,
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [applyLatest]);

  useEffect(() => {
    handleRef.current.visible = visible;
    handleRef.current.labels = labels;
  }, [visible, labels]);

  /*
    One poll of all eight feeds, every thirty seconds. Shared with the arrival
    demo further down the page: same route, same edge cache, so having both on
    screen costs the MTA nothing extra.
  */
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/subway/live");
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as LivePayload;
        if (cancelled) return;
        latestRef.current = payload;
        applyLatest();
        setFeedError(null);
      } catch {
        if (!cancelled) setFeedError("The live feeds could not be reached.");
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyLatest]);

  useEffect(() => {
    if (reducedMotion !== false) return;
    let frame = 0;
    let since = 0;
    let last = performance.now();

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Re-placed against the wall clock rather than stepped by a speed. The
      // trains move at the rate the feed's own predictions imply.
      fleetRef.current?.advance(Date.now() / 1000);

      since += dt;
      if (since > 1) {
        since = 0;
        setTick((value) => value + 1);
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const toggleRoute = useCallback((routeId: string) => {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }, []);

  const detail = useMemo(() => {
    const fleet = fleetRef.current;
    if (!data || !fleet) return null;
    const active = selection ?? hover;
    if (!active) return null;

    if (active.kind === "station") {
      const station = data.stations[active.index];
      if (!station) return null;
      const incoming = fleet
        .approaching(active.index)
        .map(({ vehicle, seconds }) => ({
          id: vehicle.id,
          route: data.lines[vehicle.line].short,
          color: data.lines[vehicle.line].color,
          seconds,
        }));
      const serving = station.routes
        .map((id) => data.routes.find((route) => route.id === id))
        .filter((route): route is NonNullable<typeof route> => Boolean(route));
      return { kind: "station" as const, station, incoming, serving };
    }

    const vehicle = fleet.vehicles.find((item) => item.id === active.id);
    if (!vehicle) return null;
    const line = data.lines[vehicle.line];
    const next =
      vehicle.nextStation !== null ? data.stations[vehicle.nextStation] : null;
    const at =
      vehicle.atStation !== null ? data.stations[vehicle.atStation] : null;
    const remaining = fleet
      .stationsOnLine(vehicle.line)
      .map((index) => data.stations[index])
      .filter(Boolean);

    return { kind: "train" as const, vehicle, line, next, at, remaining };
    // `tick` is intentional: the fleet mutates in place on the animation loop,
    // so this has to recompute on a pulse rather than on a changed reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selection, hover, tick]);

  if (error) {
    return (
      <p className="border-hairline text-steel text-body border p-6">{error}</p>
    );
  }

  if (!data) {
    return (
      <div
        className="border-hairline grid place-items-center border"
        style={{ aspectRatio: "16 / 9" }}
      >
        <p className="label-mono">Loading the network…</p>
      </div>
    );
  }

  const trains = fleetRef.current?.vehicles.length ?? 0;
  const moving = fleetRef.current?.moving ?? 0;
  const feedAge = feed ? Math.max(0, Math.floor(Date.now() / 1000) - feed.at) : null;
  const tooHeavy = !richMotion || reducedMotion !== false || !room;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <fieldset className="m-0 border-0 p-0">
          <legend className="label-mono mb-2">
            Lines{visible.size ? ` · ${visible.size} shown` : " · all"}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {data.routes.map((route) => {
              const on = visible.size === 0 || visible.has(route.id);
              return (
                <button
                  key={route.id}
                  type="button"
                  aria-pressed={visible.has(route.id)}
                  onClick={() => toggleRoute(route.id)}
                  title={route.long}
                  aria-label={route.long}
                  className={cn(
                    "label-mono ease-brief h-8 w-8 border transition-all duration-[var(--dur-ui)]",
                    on ? "border-transparent" : "border-hairline opacity-35",
                  )}
                  style={
                    on
                      ? {
                          background: route.color,
                          color: readableInk(route.color),
                        }
                      : undefined
                  }
                >
                  {route.short}
                </button>
              );
            })}
            {visible.size ? (
              <button
                type="button"
                onClick={() => setVisible(new Set())}
                className="label-mono border-hairline text-steel ease-brief hover:border-signal hover:text-signal h-8 border px-3 transition-colors duration-[var(--dur-ui)]"
              >
                All
              </button>
            ) : null}
          </div>
        </fieldset>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <button
            type="button"
            aria-pressed={labels}
            onClick={() => setLabels((value) => !value)}
            className={cn(
              "label-mono ease-brief border px-3 py-2 transition-colors duration-[var(--dur-ui)]",
              labels
                ? "border-signal text-signal"
                : "border-hairline text-steel hover:border-steel",
            )}
          >
            Station names {labels ? "on" : "off"}
          </button>
          <p className="label-mono" aria-live="polite">
            <span className="text-signal" data-numeric>
              {data.stations.length}
            </span>{" "}
            stations ·{" "}
            <span className="text-signal" data-numeric>
              {trains}
            </span>{" "}
            trains ·{" "}
            <span className="text-signal" data-numeric>
              {moving}
            </span>{" "}
            moving
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div
          ref={viewport}
          // Wheel events inside the map zoom the camera instead of scrolling
          // the page. `OrbitControls` already calls `preventDefault`, which
          // stops the native scroll; this attribute is what stops Lenis, which
          // listens on the window and would otherwise scroll past it anyway.
          // Only while the map is actually there — otherwise the placeholder
          // would swallow the wheel and the page could not be scrolled past it.
          data-lenis-prevent-wheel={tooHeavy ? undefined : ""}
          data-cursor-shape="off"
          className={cn(
            "border-hairline relative min-w-0 overflow-hidden border",
            // `touch-pan-y` is what keeps the page scrollable through the map:
            // a finger moving up and down belongs to the document, one moving
            // sideways belongs to the controls, and two fingers zoom. Without
            // it a map this tall is a trap you cannot scroll past.
            //
            // The ratio is the canvas's, and only the canvas needs it — held
            // on a phone it would reserve a 220px box for two lines of type.
            // Portrait on a narrow screen: 16:10 of 335px is 209px, and a
            // network of 496 stations cannot be read in 209px.
            !tooHeavy && "aspect-[4/5] touch-pan-y sm:aspect-[16/10]",
          )}
        >
          {tooHeavy ? (
            <p className="label-mono p-6 text-balance">
              The moving map needs a wider screen, a fine pointer, and motion
              you have not asked to reduce. The network itself — every route,
              every colour, every station — is all still here.
            </p>
          ) : (
            <SubwayMap
              running={onScreen}
              data={data}
              handleRef={handleRef}
              onSelect={setSelection}
              onHover={setHover}
              selection={selection}
            />
          )}

          {!tooHeavy ? (
            <p className="label-mono bg-void/80 absolute bottom-0 left-0 px-3 py-2">
              {pointerFine
                ? "Drag to orbit · scroll to zoom · click a train or a station"
                : "Swipe across to orbit · pinch to zoom · tap a train or a station"}
            </p>
          ) : null}
        </div>

        <aside
          className="border-hairline min-w-0 border p-5"
          aria-live="polite"
        >
          {!detail ? (
            <div className="flex flex-col gap-3">
              <p className="label-mono text-signal">
                {tooHeavy ? "Nothing to select" : "Nothing selected"}
              </p>
              {/* Without the map there is nothing to hover and nothing to
                  click, and telling somebody to do both is worse than saying
                  nothing. What is left on the page is the counts above and the
                  line list below, so this says so. */}
              <p className="text-small text-steel">
                {tooHeavy
                  ? "The trains are still running — the counts above are live — but picking one out needs the map, and the map needs a bigger screen. Every line, its colour, and its stations are listed below."
                  : pointerFine
                    ? "Hover a train to see its route and next stop. Click one to hold it and dim every other line. Click a station for what is heading toward it."
                    : "Tap a train to hold it and dim every other line. Tap a station for what is heading toward it."}
              </p>
            </div>
          ) : detail.kind === "train" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="label-mono grid h-8 w-8 place-items-center"
                  style={{
                    background: detail.line.color,
                    color: readableInk(detail.line.color),
                  }}
                >
                  {detail.line.short}
                </span>
                <span className="label-mono text-signal">
                  {detail.vehicle.id}
                </span>
              </div>

              <p className="text-small text-steel">{detail.line.long}</p>

              <dl className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-mono">Status</dt>
                  <dd className="label-mono text-signal text-right">
                    {detail.at ? `Stopped at ${detail.at.name}` : "In transit"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-mono">Next stop</dt>
                  <dd className="label-mono text-signal text-right">
                    {detail.next?.name ?? "Terminal"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-mono">Direction</dt>
                  <dd className="label-mono text-signal text-right">
                    {detail.vehicle.heading === 1 ? "Outbound" : "Inbound"}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="label-mono mb-2">
                  Stations on this route · {detail.remaining.length}
                </p>
                {/* `shrink-0` matters: `truncate` sets overflow:hidden, which
                    lets a flex column shrink a row below its own line box, and
                    38 stations in a 16rem list came out squashed to slivers. */}
                <ol className="border-hairline flex max-h-[16rem] list-none flex-col overflow-y-auto border p-0">
                  {detail.remaining.map((station) => {
                    const next = station.id === detail.next?.id;
                    return (
                      <li
                        key={station.id}
                        aria-current={next ? "step" : undefined}
                        className={cn(
                          "rule-bottom label-mono shrink-0 truncate px-3 py-2 leading-normal last:border-b-0",
                          next && "text-signal bg-signal/10",
                        )}
                      >
                        {station.name}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="label-mono text-signal">Station</p>
              <p className="font-display text-sub leading-tight">
                {detail.station.name}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {detail.serving.map((route) => (
                  <span
                    key={route.id}
                    title={route.long}
                    className="label-mono grid h-6 w-6 place-items-center"
                    style={{
                      background: route.color,
                      color: readableInk(route.color),
                    }}
                  >
                    {route.short}
                  </span>
                ))}
                {detail.serving.length === 0 ? (
                  <span className="label-mono">No drawn route calls here.</span>
                ) : null}
              </div>

              <div>
                <p className="label-mono mb-2">
                  Inbound · {detail.incoming.length}
                </p>
                <ul className="flex list-none flex-col p-0">
                  {detail.incoming.map((train) => (
                    <li
                      key={train.id}
                      className="rule-bottom flex items-center gap-3 py-2 last:border-b-0"
                    >
                      <span
                        className="label-mono grid h-6 w-6 shrink-0 place-items-center"
                        style={{
                          background: train.color,
                          color: readableInk(train.color),
                        }}
                      >
                        {train.route}
                      </span>
                      <span className="label-mono truncate">{train.id}</span>
                      <span
                        className="label-mono text-signal ml-auto"
                        data-numeric
                      >
                        {away(train.seconds)}
                      </span>
                    </li>
                  ))}
                  {detail.incoming.length === 0 ? (
                    <li className="label-mono py-2">
                      Nothing upstream of here on the simulated fleet.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>

      <p className="label-mono">
        Route shapes, station positions, and line colours are the MTA&rsquo;s
        own static GTFS feed — {data.routes.length} routes,{" "}
        {data.stations.length} stations. The trains are live: all eight
        realtime feeds, polled every thirty seconds.{" "}
        {feedError ? (
          <span className="text-signal">{feedError}</span>
        ) : feed ? (
          <>
            Last snapshot <span data-numeric>{feedAge}s</span> old;{" "}
            <span data-numeric>{feed.placed}</span> of{" "}
            <span data-numeric>{feed.of}</span> trips could be placed on the
            drawn shapes — the rest are on branches and shuttle patterns this
            map does not draw.
          </>
        ) : (
          "Waiting for the first snapshot…"
        )}{" "}
        Nothing here has a speed: a train sits where its own predicted arrival
        puts it between two platforms, so it crosses each gap in exactly the
        time the MTA says it will.
      </p>
    </div>
  );
}
