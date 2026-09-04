"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type LenisType from "lenis";
import { useCapability } from "./capability";
import { onSettled } from "./handover";
import { onIdle } from "./idle";

/**
 * One Lenis instance for the whole app, driving ScrollTrigger's update — the
 * arrangement §3 specifies.
 *
 * GSAP and Lenis are imported inside the effect rather than at module scope, so
 * neither reaches the initial bundle and a visitor who asked for reduced motion
 * never downloads them at all (§2.7, §8).
 */
const LenisContext = createContext<LenisType | null>(null);

export const useLenis = () => useContext(LenisContext);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const { richMotion, reducedMotion } = useCapability();
  const [lenis, setLenis] = useState<LenisType | null>(null);

  useEffect(() => {
    // `null` means the media query has not resolved yet — do nothing.
    if (reducedMotion === null || !richMotion) return;
    // Touch platforms already have momentum scrolling that is better than
    // anything a library can synthesise, and hijacking it costs main-thread
    // time on exactly the devices that can least afford it.
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let disposed = false;
    let teardown: (() => void) | undefined;

    const begin = async () => {
      const [{ default: gsap }, { ScrollTrigger }, { default: Lenis }] =
        await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("lenis"),
        ]);
      if (disposed) return;

      gsap.registerPlugin(ScrollTrigger);

      const instance = new Lenis({
        duration: 1.05,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
        // Native scrolling on touch: momentum there is the platform's job.
        syncTouch: false,
      });

      const onScroll = () => ScrollTrigger.update();
      instance.on("scroll", onScroll);

      const raf = (time: number) => instance.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);

      setLenis(instance);

      teardown = () => {
        instance.off("scroll", onScroll);
        gsap.ticker.remove(raf);
        instance.destroy();
        setLenis(null);
      };
    };

    // Smooth scrolling is enhancement; starting it during hydration only adds
    // blocking time to the load window — and while the loading screen is up
    // the page cannot be scrolled at all, so a hundred kilobytes of scroll
    // library parsing over the top of the count buys nothing and costs frames.
    let cancelIdle = () => {};
    const cancelWait = onSettled(() => {
      cancelIdle = onIdle(() => void begin());
    });

    return () => {
      disposed = true;
      cancelWait();
      cancelIdle();
      teardown?.();
    };
  }, [richMotion, reducedMotion]);

  return (
    <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
  );
}
