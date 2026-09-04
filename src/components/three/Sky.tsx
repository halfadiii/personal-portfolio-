"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useCapability } from "@/components/motion/capability";
import { onHandover } from "@/components/motion/handover";

/**
 * Whether the site gets a sky.
 *
 * Same gate as everything else that draws: not under reduced motion, not on a
 * machine with fewer than four cores, and not until the loading screen has let
 * go — a WebGL context created underneath the count is a WebGL context
 * competing with the one thing anybody is watching.
 *
 * No width test. The backdrop has no composition to get wrong: it is a sky, it
 * is the same sky at any shape, and a phone renders it at a third of the
 * pixels a desktop does.
 */
const GalaxyBackdrop = dynamic(() => import("./GalaxyBackdrop"), {
  ssr: false,
});

export function Sky() {
  const { richMotion, reducedMotion } = useCapability();
  const [lit, setLit] = useState(false);

  useEffect(() => {
    if (!richMotion || reducedMotion !== false) return;
    let cancelled = false;
    const stop = onHandover(() => {
      if (!cancelled) setLit(true);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [richMotion, reducedMotion]);

  if (!lit) return null;
  return <GalaxyBackdrop />;
}
