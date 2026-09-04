"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useCapability } from "@/components/motion/capability";
import { useOnScreen } from "@/components/three/useOnScreen";
import { moonPhase, skyBody } from "@/lib/sky";
import { cn } from "@/lib/utils";

/**
 * Whatever is over New York while you are reading this.
 *
 * Which one is up is worked out from the sun's actual altitude rather than
 * from office hours, and the moon is drawn at the phase it is actually at — so
 * on a night when there is a crescent outside there is a crescent here, and it
 * is leaning the same way.
 *
 * Both scenes are their own chunks and neither is fetched until this is nearly
 * on screen, which for a section this far down the page means most visits
 * never fetch either. Reduced motion gets nothing: there is no still frame
 * worth the WebGL context, and the section reads perfectly well without it.
 */

const MoonScene = dynamic(() => import("@/components/three/MoonScene"), {
  ssr: false,
});

const SunScene = dynamic(() => import("@/components/three/SunScene"), {
  ssr: false,
});

export function SkyBody({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const { richMotion, pointerFine } = useCapability();
  const { ref, onScreen } = useOnScreen<HTMLDivElement>("400px");
  const [near, setNear] = useState(false);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // Five minutes. The phase moves by a fortieth of a per cent in that time,
    // and the only thing the clock actually decides here is which body is up.
    const id = window.setInterval(tick, 300_000);
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
  const body = now ? skyBody(now) : null;
  const moon = now ? moonPhase(now) : null;
  const show = near && richMotion && body !== null;

  const label =
    body === "sun"
      ? "The sun, up over New York City right now"
      : moon
        ? `${moon.name} over New York City, ${Math.round(moon.illumination * 100)} per cent lit`
        : undefined;

  return (
    <div
      ref={ref}
      role={show ? "img" : undefined}
      aria-label={show ? label : undefined}
      // Half as wide as it is tall: the scene draws the left half of a
      // disc centred on this box's right edge, so the box *is* the visible
      // half and nothing off the page is ever rasterised.
      className={cn("relative aspect-[1/2]", className)}
    >
      {show ? (
        body === "sun" ? (
          <SunScene drift={!pointerFine} />
        ) : (
          <MoonScene phase={moon!.phase} drift={!pointerFine} />
        )
      ) : null}
    </div>
  );
}
