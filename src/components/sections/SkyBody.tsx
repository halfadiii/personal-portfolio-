"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useCapability } from "@/components/motion/capability";
import { useOnScreen } from "@/components/three/useOnScreen";
import { moonPhase } from "@/lib/sky";
import { cn } from "@/lib/utils";

/**
 * The moon over New York, at the phase it is actually at.
 *
 * Always the moon. This used to work out which body was above the horizon from
 * the sun's real altitude and draw whichever it was, which meant half of all
 * visitors — the daytime half — never saw this at all and got a sun instead.
 * Only one of the two was ever wanted here, so only one is built.
 *
 * The phase is still real. On a night when there is a crescent outside there is
 * a crescent here, and it is leaning the same way, because the terminator is
 * placed from the same arithmetic an almanac uses rather than from a shape that
 * looked about right.
 *
 * The scene is its own chunk and is not fetched until this is nearly on screen,
 * which for a section this far down the page means most visits never fetch it.
 * Reduced motion gets nothing: there is no still frame worth a WebGL context,
 * and the section reads perfectly well without one.
 */

const MoonScene = dynamic(() => import("@/components/three/MoonScene"), {
  ssr: false,
});

export function SkyBody({
  className,
  full = false,
}: {
  className?: string;
  /** The whole disc, centred — how it is used as a backdrop on a phone. */
  full?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const { richMotion, pointerFine } = useCapability();
  const { ref, onScreen } = useOnScreen<HTMLDivElement>("400px");
  const [near, setNear] = useState(false);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // Hourly, which is already far more often than it needs to be: the phase
    // moves about a seventh of a per cent in an hour, and nothing else on this
    // element depends on the clock any more. It used to run every five minutes
    // because the choice between two bodies turned over at a horizon crossing
    // and being ten minutes late to a sunrise would have been visible.
    const id = window.setInterval(tick, 3_600_000);
    return () => window.clearInterval(id);
  }, []);

  // Latched: once it has been near, the scene stays. Building and tearing down
  // a WebGL context on every pass would cost more than leaving it alone, and
  // Cadence already stops it drawing the moment it leaves the screen.
  useEffect(() => {
    if (onScreen) setNear(true);
  }, [onScreen]);

  // Null until mounted, because this depends on the visitor's clock and the
  // server does not have it — the same reason the local time renders empty.
  const moon = now ? moonPhase(now) : null;
  const show = near && richMotion && moon !== null;

  const label = moon
    ? `${moon.name} over New York City, ${Math.round(moon.illumination * 100)} per cent lit`
    : undefined;

  return (
    <div
      ref={ref}
      /* The relay that carries the globe across to this section finds its
         destination by this, and lands on the disc drawn inside. Both usages
         carry it; exactly one of them is ever displayed, and the relay picks
         whichever currently has a box. */
      data-sky-moon
      role={show ? "img" : undefined}
      aria-label={show ? label : undefined}
      /*
        Half as wide as it is tall: the scene draws the left half of a disc
        centred on this box's right edge, so the box *is* the visible half and
        nothing off the page is ever rasterised.

        Square when the whole disc is wanted, which is the shape that wastes
        the fewest pixels on the other reading of the same scene.
      */
      className={cn("relative", full ? "aspect-square" : "aspect-[1/2]", className)}
    >
      {show ? (
        <MoonScene phase={moon.phase} drift={!pointerFine} full={full} />
      ) : null}
    </div>
  );
}
