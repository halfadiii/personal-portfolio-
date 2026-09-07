"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCapability } from "@/components/motion/capability";
import { L_LINE, LINE_LENGTH_KM, type Prediction, type Train } from "@/lib/subway-sim";

/**
 * The L, drawn flat, with the feed's belief laid over the trains' actual
 * positions.
 *
 * This replaced a 3D scene of the same data, and the reason is worth stating
 * because it was not a matter of taste. That view drew every train as a box in
 * perspective along a curved route, which meant the two things this section
 * exists to show were the two things it could not show: where a train is
 * relative to the *stations* — foreshortened away by the perspective — and what
 * the feed currently believes about it, which was not drawn at all. It looked
 * like a scene. This is an instrument.
 *
 * ## What is on it
 *
 * A rail, with every station at its true distance along the line, so the gaps
 * between the ticks are the gaps between the platforms. Trains sit on the rail
 * at their real position. One is the watched train, and above it hangs the
 * **beam**: a stem at each stop the feed is currently predicting for it,
 * carrying the countdown that prediction implies.
 *
 * ## The two clocks, which is the whole point
 *
 * The trains move every frame, because they are physical objects and that is
 * what physical objects do. The beam moves *only when the feed publishes*,
 * every thirty seconds, because a belief is not continuous — it is a snapshot
 * that is right at the instant it is taken and decays until the next one.
 *
 * Watching those two run at different rates is the pipeline's whole problem in
 * one picture. The train slides smoothly toward a platform; the stem above it
 * sits still, holding a number that is getting staler; then a poll lands and
 * every number jumps at once. And when the train actually reaches the
 * platform, that stem is simply *gone from the next snapshot* — which is the
 * only trace an arrival ever leaves, and the thing the whole warehouse is
 * built to catch.
 *
 * ## Why it is SVG and driven from a ref
 *
 * Positions are written straight to the DOM inside a `requestAnimationFrame`
 * loop, so React never re-renders while trains move — the same arrangement the
 * scene it replaced used, for the same reason. Being SVG rather than WebGL
 * takes three.js off this half of the route, works at any width, survives
 * being printed, and can carry real text that a screen reader reaches.
 */

export type StripHandle = {
  trains: Train[];
  /** Index of the station the metrics panel is measuring. */
  focus: number;
  /** Train the beam is drawn for. */
  watched: string | null;
  /** Simulated clock, in seconds. */
  t: number;
  /** The last poll's predictions for the watched train, nearest first. */
  beam: Prediction[];
};

/* Geometry, in viewBox units. The box is 1000 wide so every x is a permille of
   the line and the numbers below read as percentages. */
const W = 1000;
const H = 288;
const PAD = 26;
const RAIL_Y = 152;
/** Baseline of the countdowns the beam's stems hang from. */
const BEAM_Y = 66;
const SPAN = W - PAD * 2;

function xOf(km: number): number {
  return PAD + (km / LINE_LENGTH_KM) * SPAN;
}

/** Seconds as `m:ss`, or `now` once it is inside a poll interval of arriving. */
function countdown(seconds: number): string {
  if (seconds <= 4) return "now";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function LineStrip({
  handleRef,
  running,
}: {
  handleRef: React.RefObject<StripHandle>;
  running: boolean;
}) {
  const { reducedMotion } = useCapability();
  const root = useRef<HTMLElement>(null);
  // Read inside the frame loop, which is created once and must not be torn
  // down and rebuilt every time the demo is paused.
  const runningRef = useRef(running);
  runningRef.current = running;

  // The static half: ticks and names never move, so they are rendered once by
  // React and never touched again.
  const stations = useMemo(
    () => L_LINE.map((station, i) => ({ ...station, i, x: xOf(station.km) })),
    [],
  );

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;

    const trainLayer = svg.querySelector<SVGGElement>("[data-trains]");
    const beamLayer = svg.querySelector<SVGGElement>("[data-beam]");
    const readout = svg.querySelector<HTMLElement>("[data-readout]");
    if (!trainLayer || !beamLayer) return;

    const ticks = new Map<number, SVGGElement>();
    for (const node of svg.querySelectorAll<SVGGElement>("[data-station]")) {
      ticks.set(Number(node.dataset.station), node);
    }
    let lastFocus = -1;

    let frame = 0;
    let lastNext = -1;
    let lastWatched: string | null = null;
    /** One frame is still drawn after a pause, then nothing until it resumes. */
    let settled = false;

    /** Mark the platform a train has just reached. */
    const strike = (index: number) => {
      const tick = ticks.get(index);
      if (!tick || reducedMotion) return;
      tick.removeAttribute("data-struck");
      // Force the animation to restart even if it is already running.
      void tick.getBoundingClientRect();
      tick.setAttribute("data-struck", "");
      window.setTimeout(() => tick.removeAttribute("data-struck"), 1400);
    };

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const state = handleRef.current;
      if (!state) return;
      // Paused: the simulation is not advancing, so every value below would be
      // written unchanged sixty times a second.
      if (!runningRef.current && settled) return;
      settled = !runningRef.current;

      /* -- the trains ------------------------------------------------- */
      const live = state.trains.filter((train) => !train.retired);
      // Reuse nodes rather than rebuilding: the set changes only when a train
      // enters or leaves service, which is a few times a minute.
      while (trainLayer.childElementCount < live.length) {
        const mark = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        mark.setAttribute("y", String(RAIL_Y - 5));
        mark.setAttribute("width", "13");
        mark.setAttribute("height", "10");
        mark.setAttribute("rx", "2");
        mark.setAttribute("class", "strip-train");
        trainLayer.append(mark);
      }
      while (trainLayer.childElementCount > live.length) {
        trainLayer.lastElementChild?.remove();
      }

      live.forEach((train, index) => {
        const mark = trainLayer.children[index] as SVGRectElement;
        mark.setAttribute("x", String(xOf(train.km) - 6.5));
        const watched = train.id === state.watched;
        mark.setAttribute("data-watched", watched ? "" : "off");
        // A train more than a minute down is drawn hollow. Delay is the only
        // thing on this diagram encoded by appearance rather than position,
        // and it earns it: bunching is what excess wait measures.
        mark.setAttribute("data-late", train.delay > 60 ? "" : "off");
      });

      /* -- the station the metrics panel is measuring -------------------- */
      // Marked here as well as named in the panel, so the two halves of this
      // demo are visibly about the same platform.
      if (state.focus !== lastFocus) {
        ticks.get(lastFocus)?.removeAttribute("data-focus");
        ticks.get(state.focus)?.setAttribute("data-focus", "");
        lastFocus = state.focus;
      }

      /* -- the beam ---------------------------------------------------- */
      const watched = live.find((train) => train.id === state.watched);

      if (watched && watched.next !== lastNext && lastWatched === state.watched) {
        // `next` has advanced: the train has reached the platform it was
        // heading for, which is the instant an arrival happens.
        if (lastNext >= 0) strike(lastNext);
      }
      lastNext = watched?.next ?? -1;
      lastWatched = state.watched;

      const beam = watched ? state.beam : [];
      while (beamLayer.childElementCount < beam.length) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "strip-stem");
        const stem = document.createElementNS("http://www.w3.org/2000/svg", "line");
        stem.setAttribute("y1", String(BEAM_Y + 6));
        stem.setAttribute("y2", String(RAIL_Y - 9));
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("y", String(BEAM_Y));
        label.setAttribute("text-anchor", "middle");
        group.append(stem, label);
        beamLayer.append(group);
      }
      while (beamLayer.childElementCount > beam.length) {
        beamLayer.lastElementChild?.remove();
      }

      beam.forEach((prediction, index) => {
        const group = beamLayer.children[index] as SVGGElement;
        const station = L_LINE[prediction.station];
        if (!station) return;
        const x = xOf(station.km);
        const stem = group.firstElementChild as SVGLineElement;
        const label = group.lastElementChild as SVGTextElement;
        stem.setAttribute("x1", String(x));
        stem.setAttribute("x2", String(x));
        label.setAttribute("x", String(x));
        label.textContent = countdown(prediction.at - state.t);
        // The nearest prediction is the one about to resolve.
        group.setAttribute("data-next", index === 0 ? "" : "off");
      });

      /* -- the run of rail the beam covers ------------------------------ */
      const reach = svg.querySelector<SVGLineElement>("[data-reach]");
      if (reach) {
        const last = beam.at(-1);
        const lastStation = last ? L_LINE[last.station] : undefined;
        if (watched && lastStation) {
          reach.setAttribute("x1", String(xOf(watched.km)));
          reach.setAttribute("x2", String(xOf(lastStation.km)));
          reach.setAttribute("data-on", "");
        } else {
          reach.removeAttribute("data-on");
        }
      }

      if (readout) {
        readout.textContent = watched
          ? `${watched.id} · ${
              watched.delay > 30
                ? `${Math.round(watched.delay)}s down`
                : "on time"
            } · predicting ${beam.length} stop${beam.length === 1 ? "" : "s"}`
          : "waiting for a train to follow";
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [handleRef, reducedMotion]);

  return (
    <figure ref={root} className="m-0 flex flex-col gap-3">
      {/*
        Outside the scrolling box on purpose. It is a status line rather than a
        position, so on a narrow screen it has to stay readable without anyone
        scrolling sideways to find it.
      */}
      <p className="label-mono text-signal" aria-live="off">
        <span data-readout />
      </p>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="strip block h-auto w-full min-w-[760px]"
          role="img"
          aria-label={
            "A strip diagram of the L line. Stations are marked at their true " +
            "spacing along the route; trains sit on the rail at their current " +
            "position; and above the followed train, one stem per stop the feed " +
            "is predicting for it, each carrying a countdown. The numbers beside " +
            "the diagram carry the same information."
          }
        >
          {/* The run of line the current predictions cover. */}
          <line data-reach y1={RAIL_Y} y2={RAIL_Y} className="strip-reach" />

          <line
            x1={PAD}
            x2={W - PAD}
            y1={RAIL_Y}
            y2={RAIL_Y}
            className="strip-rail"
          />

          {stations.map((station) => (
            <g key={station.id} data-station={station.i}>
              <line
                x1={station.x}
                x2={station.x}
                y1={RAIL_Y - 7}
                y2={RAIL_Y + 7}
                className="strip-tick"
              />
              <circle cx={station.x} cy={RAIL_Y} r="3" className="strip-dot" />
              <text
                x={station.x}
                y={RAIL_Y + 16}
                className="strip-name"
                transform={`rotate(-90 ${station.x} ${RAIL_Y + 16})`}
                textAnchor="end"
              >
                {station.name}
              </text>
            </g>
          ))}

          <g data-beam />
          <g data-trains />

          <text x={PAD} y={24} className="strip-end">
            8 Av
          </text>
          <text x={W - PAD} y={24} textAnchor="end" className="strip-end">
            Canarsie
          </text>
        </svg>
      </div>

      <figcaption className="label-mono flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <span className="strip-key strip-key--train" aria-hidden /> train
        </span>
        <span>
          <span className="strip-key strip-key--watched" aria-hidden /> followed
        </span>
        <span>
          <span className="strip-key strip-key--late" aria-hidden /> over a
          minute down
        </span>
        <span>
          <span className="strip-key strip-key--stem" aria-hidden /> a stop the
          feed is predicting, and its countdown
        </span>
      </figcaption>
    </figure>
  );
}
