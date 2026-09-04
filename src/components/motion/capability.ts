"use client";

import { useEffect, useState } from "react";

/**
 * §7 — branch on capability, not just width.
 *
 * Motion is skipped when the visitor asked for less of it, when the device has
 * fewer than four logical cores, or when the connection reports data saving.
 */
export type Capability = {
  /** Resolved after mount; `null` while unknown, so nothing animates early. */
  reducedMotion: boolean | null;
  richMotion: boolean;
  pointerFine: boolean;
};

type NetworkInformation = { saveData?: boolean };

export function useCapability(): Capability {
  const [capability, setCapability] = useState<Capability>({
    reducedMotion: null,
    richMotion: false,
    pointerFine: false,
  });

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerQuery = window.matchMedia("(pointer: fine)");

    const resolve = () => {
      const cores = navigator.hardwareConcurrency ?? 4;
      const connection = (
        navigator as Navigator & { connection?: NetworkInformation }
      ).connection;
      const saveData = connection?.saveData === true;

      setCapability({
        reducedMotion: motionQuery.matches,
        richMotion: !motionQuery.matches && cores >= 4 && !saveData,
        pointerFine: pointerQuery.matches,
      });
    };

    resolve();
    motionQuery.addEventListener("change", resolve);
    pointerQuery.addEventListener("change", resolve);
    return () => {
      motionQuery.removeEventListener("change", resolve);
      pointerQuery.removeEventListener("change", resolve);
    };
  }, []);

  return capability;
}

/** The same check, for code that runs before React state settles. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
