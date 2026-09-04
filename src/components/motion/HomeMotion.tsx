"use client";

import { useEffect } from "react";
import { useCapability } from "./capability";
import { onSettled } from "./handover";
import { onIdle } from "./idle";
import { useLenis } from "./SmoothScroll";

/**
 * The home page's scroll-linked motion: the constellation drift and the work
 * rail. Both live inside a `gsap.context()` that reverts on unmount, GSAP is
 * imported lazily so it never lands in the initial bundle, and neither is
 * created at all unless the device and the visitor's preferences allow it (§7).
 */
export function HomeMotion() {
  const { richMotion } = useCapability();
  const lenis = useLenis();

  useEffect(() => {
    if (!richMotion) return;

    let disposed = false;
    let context: gsap.Context | undefined;

    const start = async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);

      context = gsap.context(() => {
        const cleanups = [
          driftConstellation(gsap),
          followCursor(gsap),
          pinWorkRail(gsap),
        ];
        ScrollTrigger.refresh();
        return () => {
          for (const cleanup of cleanups) cleanup?.();
        };
      });
    };

    // Nothing drifts until the preloader has handed the page over: the settle
    // owns the fragments until then, and two things easing the same transform
    // is how a handover turns into a fight.
    let cancelIdle = () => {};
    const cancelWait = onSettled(() => {
      cancelIdle = onIdle(() => void start());
    });

    return () => {
      disposed = true;
      cancelWait();
      cancelIdle();
      context?.revert();
    };
  }, [richMotion]);

  // Lenis arriving after the triggers are built changes the scroll proxy.
  useEffect(() => {
    if (!lenis) return;
    void import("gsap/ScrollTrigger").then(({ ScrollTrigger }) =>
      ScrollTrigger.refresh(),
    );
  }, [lenis]);

  return null;
}

type Gsap = typeof import("gsap").default;

/** Slow vertical drift, each fragment at its own rate. Never parallax on scroll. */
function driftConstellation(gsap: Gsap) {
  // The field is `hidden sm:block`; below that these nodes are not rendered.
  if (!window.matchMedia("(min-width: 640px)").matches) return;
  const fragments = gsap.utils.toArray<HTMLElement>("[data-fragment]");
  fragments.forEach((fragment, i) => {
    const rate = Number(fragment.dataset.rate ?? 1);
    gsap.to(fragment, {
      yPercent: i % 2 === 0 ? 9 : -9,
      xPercent: i % 3 === 0 ? -4 : 3,
      duration: 11 / rate,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: i * 0.12,
    });
  });
}

/**
 * The hero answers the pointer.
 *
 * Each fragment leans toward the cursor by an amount set by its own drift rate,
 * so the field reads as depth rather than as one sheet sliding around. Written
 * to `x`/`y` while `driftConstellation` owns `xPercent`/`yPercent`, so the two
 * compose in one transform instead of fighting over it.
 *
 * Pointer position is read on the event and applied once per frame — a fast
 * mouse never queues more work than the display can show.
 */
function followCursor(gsap: Gsap) {
  const hero = document.getElementById("hero");
  const fragments = gsap.utils.toArray<HTMLElement>("[data-fragment]");
  if (!hero || fragments.length === 0) return;

  // A coarse pointer has no hover state to answer.
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const movers = fragments.map((fragment) => ({
    depth: Number(fragment.dataset.rate ?? 1),
    toX: gsap.quickTo(fragment, "x", { duration: 0.9, ease: "power3.out" }),
    toY: gsap.quickTo(fragment, "y", { duration: 0.9, ease: "power3.out" }),
  }));

  // The name leans the other way, and less far — the two opposing rates are
  // what make the field read as depth rather than as a single sliding plane.
  const name = document.querySelector<HTMLElement>("[data-hero-name]");
  const nameX = name
    ? gsap.quickTo(name, "x", { duration: 1.1, ease: "power3.out" })
    : null;
  const nameY = name
    ? gsap.quickTo(name, "y", { duration: 1.1, ease: "power3.out" })
    : null;

  let frame = 0;
  let offsetX = 0;
  let offsetY = 0;
  let inView = true;

  const apply = () => {
    frame = 0;
    for (const mover of movers) {
      mover.toX(offsetX * 34 * mover.depth);
      mover.toY(offsetY * 22 * mover.depth);
    }
    // Small enough to stay inside the hero's own clip, so nothing overflows.
    nameX?.(offsetX * -8);
    nameY?.(offsetY * -5);
  };

  // Measured when the box can actually have changed, not on every pointer
  // event. A `getBoundingClientRect` forces the browser to flush layout, and
  // doing that from a pointer handler put a synchronous reflow in front of
  // every frame the cursor was anywhere over the hero — which is most of them.
  //
  // Held in document coordinates, so scrolling does not invalidate it either:
  // where the hero sits in the page only changes when the page reflows, and
  // where it sits on the screen is that minus the scroll offset.
  let top = 0;
  let width = 1;
  let height = 1;
  const remeasure = () => {
    const box = hero.getBoundingClientRect();
    top = box.top + window.scrollY;
    width = box.width || 1;
    height = box.height || 1;
  };
  remeasure();

  const onMove = (event: PointerEvent) => {
    if (!inView) return;
    offsetX = (event.clientX - width / 2) / (width / 2);
    offsetY =
      (event.clientY - (top - window.scrollY) - height / 2) / (height / 2);
    if (frame === 0) frame = requestAnimationFrame(apply);
  };

  const settle = () => {
    offsetX = 0;
    offsetY = 0;
    if (frame === 0) frame = requestAnimationFrame(apply);
  };

  // Stop listening once the hero is off screen; nothing there can be seen.
  const watcher = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) settle();
    },
    { threshold: 0 },
  );
  watcher.observe(hero);

  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", settle);
  // The only two things that can move it: a window resize, and the hero's own
  // box changing when the real face lands.
  window.addEventListener("resize", remeasure);
  const sizes = new ResizeObserver(remeasure);
  sizes.observe(hero);

  return () => {
    watcher.disconnect();
    sizes.disconnect();
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", settle);
    window.removeEventListener("resize", remeasure);
    if (frame) cancelAnimationFrame(frame);
  };
}

/**
 * §6.4 — the rail scrolls sideways while the section is pinned, at lg and up
 * only. Below that the same element is a plain stack or a two-up grid, which is
 * also the fallback whenever this never runs.
 */
function pinWorkRail(gsap: Gsap) {
  const media = gsap.matchMedia();

  media.add("(min-width: 1024px)", () => {
    const rail = document.querySelector<HTMLElement>("[data-work-rail]");
    // The wrapper, never the section. Pinning wraps the element in a spacer
    // div, which reparents it, and the section is a node React removes by
    // hand on a client-side navigation — moving it makes that removal throw.
    const pin = rail?.closest<HTMLElement>("[data-work-pin]");
    if (!rail || !pin) return;

    const distance = () => rail.scrollWidth - rail.clientWidth;
    if (distance() <= 0) return;

    // Hand horizontal movement to the transform; the native scrollbar would
    // otherwise fight it.
    rail.style.overflowX = "visible";
    rail.dataset.pinned = "true";

    const tween = gsap.to(rail, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: pin,
        start: "top top",
        end: () => `+=${distance()}`,
        pin,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      rail.style.removeProperty("overflow-x");
      delete rail.dataset.pinned;
      gsap.set(rail, { clearProps: "transform" });
    };
  });

  return () => media.revert();
}
