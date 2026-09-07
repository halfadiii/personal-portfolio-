"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCapability } from "@/components/motion/capability";
import type { LivePayload } from "@/app/api/subway/live/route";
import {
  LATE_SECONDS,
  LINE_LENGTH,
  STATIONS,
  stationIndex,
  type Direction,
  type Placed,
} from "@/lib/subway-live";

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
  /** Trains in the shown direction, already placed along the line. */
  trains: Placed[];
  /** Stop id the metrics panel is measuring. */
  focus: string;
  /** Trip id the beam is drawn for. */
  watched: string | null;
  /** Wall clock, epoch seconds. Live, not simulated. */
  t: number;
  /** The last poll's predictions for the watched train, nearest first. */
  beam: { stop: string; at: number }[];
  /** Which way the shown trains are running. */
  direction: Direction;
  /**
   * The last poll, kept here so the frame loop can re-place trains against the
   * live clock without the parent re-rendering sixty times a second.
   */
  payload: LivePayload | null;
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

function xOf(at: number): number {
  return PAD + (at / LINE_LENGTH) * SPAN;
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
    () => STATIONS.map((station) => ({ ...station, x: xOf(station.at) })),
    [],
  );

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;

    const trainLayer = svg.querySelector<SVGGElement>("[data-trains]");
    const beamLayer = svg.querySelector<SVGGElement>("[data-beam]");
    const readout = svg.querySelector<HTMLElement>("[data-readout]");
    if (!trainLayer || !beamLayer) return;

    const ticks = new Map<string, SVGGElement>();
    for (const node of svg.querySelectorAll<SVGGElement>("[data-station]")) {
      if (node.dataset.station) ticks.set(node.dataset.station, node);
    }
    let lastFocus = "";

    let frame = 0;
    /** The head of the beam last frame: the stop the train was heading for. */
    let lastHead: string | null = null;
    let lastWatched: string | null = null;
    /** One frame is still drawn after a pause, then nothing until it resumes. */
    let settled = false;

    /** Mark the platform a train has just reached. */
    const strike = (stop: string) => {
      const tick = ticks.get(stop);
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
      const live = state.trains;
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

      live.forEach((placed, index) => {
        const mark = trainLayer.children[index] as SVGRectElement;
        mark.setAttribute("x", String(xOf(placed.at) - 6.5));
        const watched = placed.train.id === state.watched;
        mark.setAttribute("data-watched", watched ? "" : "off");
        // A train more than a minute down is drawn hollow. That figure is the
        // MTA's own, against its own timetable, and it is the only thing on
        // this diagram encoded by appearance rather than position: bunching is
        // what excess wait measures.
        mark.setAttribute(
          "data-late",
          (placed.train.delay ?? 0) > LATE_SECONDS ? "" : "off",
        );
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
      const watched = live.find((placed) => placed.train.id === state.watched);

      const head = state.beam[0]?.stop ?? null;
      if (head !== lastHead && lastWatched === state.watched && lastHead) {
        // The stop at the head of the beam is gone from the newest snapshot.
        // That is the arrival: not an event the feed sent, but a row it
        // stopped sending.
        strike(lastHead);
      }
      lastHead = head;
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
        const at = stationIndex(prediction.stop);
        const station = at === undefined ? undefined : STATIONS[at];
        if (!station) return;
        const x = xOf(station.at);
        const stem = group.firstElementChild as SVGLineElement;
        const label = group.lastElementChild as SVGTextElement;
        // Alternate rows. Stations on this line get as close as 25 units and a
        // countdown is wider than that, so every other one is lifted clear
        // rather than shrinking all of them to fit the tightest pair.
        const lift = index % 2 === 0 ? 0 : -13;
        stem.setAttribute("x1", String(x));
        stem.setAttribute("x2", String(x));
        stem.setAttribute("y1", String(BEAM_Y + 6 + lift));
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(BEAM_Y + lift));
        label.textContent = countdown(prediction.at - state.t);
        // The nearest prediction is the one about to resolve.
        group.setAttribute("data-next", index === 0 ? "" : "off");
      });

      /* -- the run of rail the beam covers ------------------------------ */
      const reach = svg.querySelector<SVGLineElement>("[data-reach]");
      if (reach) {
        const last = beam.at(-1);
        const lastIndex = last ? stationIndex(last.stop) : undefined;
        const lastStation = lastIndex === undefined ? undefined : STATIONS[lastIndex];
        if (watched && lastStation) {
          reach.setAttribute("x1", String(xOf(watched.at)));
          reach.setAttribute("x2", String(xOf(lastStation.at)));
          reach.setAttribute("data-on", "");
        } else {
          reach.removeAttribute("data-on");
        }
      }

      if (readout) {
        const delay = Math.round(watched?.train.delay ?? 0);
        readout.textContent = watched
          ? `${watched.train.id} · ${
              delay > 30
                ? `${delay}s down`
                : delay < -30
                  ? `${-delay}s early`
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
            <g key={station.id} data-station={station.id}>
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
          <span className="strip-key strip-key--late" aria-hidden /> over three
          minutes down
        </span>
        <span>
          <span className="strip-key strip-key--stem" aria-hidden /> a stop the
          feed is predicting, and its countdown
        </span>
      </figcaption>
    </figure>
  );
}
