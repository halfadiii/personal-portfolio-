"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * How often a canvas is allowed to draw, and whether it draws at all.
 *
 * Every scene on this site is decorative motion — a drifting orbit, a strand,
 * a print web. None of it carries anything a 60Hz sample misses. Left alone a
 * renderer draws once per display refresh, so on a 120 or 180Hz panel it does
 * two to three times the work for a picture nobody can tell apart, and a
 * laptop pays for that in heat and then in clock speed. Which is the version
 * of "it gets slow after a while" that never shows up in a profile, because by
 * the time it happens the profile is of a machine that has already throttled.
 *
 * So the canvas runs `frameloop="never"` — React Three Fiber draws nothing on
 * its own — and this is the only thing that advances it. Three gates, in
 * order of how much they save: a hidden tab draws nothing, a canvas scrolled
 * out of view draws nothing, and what is left draws at `fps` rather than at
 * whatever the panel happens to run at.
 *
 * The delta handed to the scene is clamped. A frame that took 300ms is not a
 * 300ms step, it is a stall, and integrating it moves everything a third of a
 * second in one jump — which is how a hitch turns into a visible skip rather
 * than a dropped frame.
 */

/** Longest step any scene is told about, in seconds. */
const MAX_STEP = 1 / 15;

/** How far outside the viewport a canvas keeps drawing. */
const MARGIN = "200px";

export function Cadence({
  fps = 60,
  running = true,
}: {
  fps?: number;
  /** An extra gate for sections that know they are done with their scene. */
  running?: boolean;
}) {
  const advance = useThree((state) => state.advance);
  const gl = useThree((state) => state.gl);
  const clock = useThree((state) => state.clock);

  useEffect(() => {
    if (!running) return;
    const canvas = gl.domElement;

    let frame = 0;
    let previous = 0;
    // Picked up where the clock was left, so a scene that stops and starts
    // does not hand itself a delta measured from zero.
    let elapsed = clock.elapsedTime;
    let onScreen = true;

    // A little under the interval: rAF ticks jitter by a fraction of a
    // millisecond, and a gate set exactly at 1/fps drops every other frame on
    // a display that is already running at the target rate.
    const interval = 1000 / fps - 2;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || !onScreen) {
        // Nothing drew, so nothing should have moved either.
        previous = 0;
        return;
      }
      if (previous !== 0 && now - previous < interval) return;
      const step = previous === 0 ? 0 : Math.min((now - previous) / 1000, MAX_STEP);
      previous = now;
      elapsed += step;
      advance(elapsed);
    };

    frame = requestAnimationFrame(tick);

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting;
            },
            { rootMargin: MARGIN },
          );
    observer?.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [advance, clock, fps, gl, running]);

  return null;
}
