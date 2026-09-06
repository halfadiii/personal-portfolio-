"use client";

import { useEffect } from "react";

/**
 * §6.1 / §4.4 — the one orchestrated moment on the site.
 *
 * A launch countdown runs T-3, T-2, T-1 while fonts and the constellation
 * settle; at T-0 the craft leaves the pad, the fragments arrive at their slots,
 * and the name expands along the Archivo width axis. ~3.9s, skippable by any
 * key or click, once per session.
 *
 * Deliberately written with requestAnimationFrame and CSS transitions rather
 * than GSAP: this runs inside the load window, and pulling a 50 KB animation
 * library in to move four properties showed up directly as blocking time (§8).
 * GSAP still owns the scroll-linked work in `HomeMotion`, which starts later.
 *
 * The overlay is server-rendered so no content flashes beneath it. An inline
 * script in the layout decides before paint whether it runs at all, when the
 * visitor has already seen it this session, asked for reduced motion, or is
 * not on the home page.
 *
 * Note what taking it away does *not* do: detach the node. React rendered the
 * overlay, so React owns it, and pulling it out of the DOM from here leaves a
 * fiber pointing at a node that is no longer anybody's child — which stays
 * quiet until the next client-side navigation, when React tries to remove it
 * and the whole commit dies with "the node to be removed is not a child of
 * this node". Setting `data-preloader` off the "on" value is all that is
 * needed: `#preloader` is `display: none` unless that attribute says
 * otherwise, so the overlay leaves the layout and the accessibility tree
 * while React keeps the node it thinks it has.
 */
/**
 * The countdown, and it is three real seconds.
 *
 * The number on screen is a count of seconds, so it has to be told in them: at
 * 3400 the first two numbers would hold for a second and the last one for a
 * second and a bit, which is the kind of wrong nobody points at and everybody
 * feels. One second each, and T-0 is the release.
 *
 * It replaced a 000→100 progress count, which was never progress — nothing was
 * being measured, and by the time it read 40 the page underneath had been ready
 * for a while. A countdown says the same thing about time passing without
 * claiming to be a measurement of anything.
 */
const COUNT_MS = 3000;
/** Numbers in the count. T-3, T-2, T-1, and then it has gone. */
const COUNT_FROM = COUNT_MS / 1000;
const FADE_MS = 420;
const SETTLE_MS = 900;
const STAGGER_MS = 35;
/**
 * How long the craft is on screen climbing away before the overlay begins to
 * lift. Without it the launch and the fade start together and the rocket is
 * gone before it has visibly moved — this is the whole handover, so it gets
 * its own beat.
 */
const HOLD_MS = 440;
/** How long the engine takes to come up to launch power once the count lands. */
const SPOOL_MS = 260;

/**
 * Band-limited noise: three sines whose frequencies do not divide into each
 * other, so it never repeats on a period anybody notices.
 *
 * `Math.random()` per frame would be white noise, and white noise is what
 * makes a shaking object look broken rather than powered — every frame is
 * unrelated to the one before it, so nothing reads as a continuous vibration.
 * This is continuous, which is what combustion actually looks like.
 */
function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 41.3 + seed) * 0.5 +
    Math.sin(t * 67.7 + seed * 2.1) * 0.32 +
    Math.sin(t * 113.9 + seed * 3.7) * 0.18
  );
}

export function PreloaderRunner() {
  useEffect(() => {
    const root = document.documentElement;
    const overlay = document.getElementById("preloader");
    if (!overlay) return;

    // The inline script already decided this visit does not get the sequence.
    if (root.dataset.preloader !== "on") {
      // Said before "done", because both are what everything waiting on the
      // handover is watching for and the craft below has to know it was never
      // up here in the first place.
      root.dataset.rocket = "away";
      root.dataset.preloader = "done";
      return;
    }

    const counter = overlay.querySelector<HTMLElement>(
      "[data-preloader-count]",
    );
    const craft = overlay.querySelector<HTMLElement>("[data-preloader-craft]");
    const name = document.querySelector<HTMLElement>("[data-hero-name]");
    const fragments = Array.from(
      document.querySelectorAll<HTMLElement>("[data-fragment]"),
    );

    // The resting state only uses the expanded width axis at sm and up. Below
    // that the name wraps freely, so widening it would re-wrap the line and
    // register a layout shift (§2.4).
    const widthAxis =
      name && window.matchMedia("(min-width: 640px)").matches ? name : null;

    let frame = 0;
    let finished = false;
    const timers: number[] = [];

    document.body.style.overflow = "hidden";

    // Scattered start. Set before the overlay lifts, so it is never seen.
    for (const [i, fragment] of fragments.entries()) {
      fragment.style.opacity = "0";
      fragment.style.transform = `translate(${i % 2 === 0 ? -18 : 18}%, ${
        i % 3 === 0 ? 22 : -14
      }%)`;
    }
    if (widthAxis) {
      widthAxis.style.fontVariationSettings = '"wdth" 62';
    }

    const clearInline = () => {
      for (const fragment of fragments) {
        fragment.style.removeProperty("opacity");
        fragment.style.removeProperty("transform");
        fragment.style.removeProperty("transition");
      }
      if (widthAxis) {
        widthAxis.style.removeProperty("font-variation-settings");
        widthAxis.style.removeProperty("transition");
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      if (frame) cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      // Whatever happened above, the craft has left: released here as well as
      // in `launch` so that skipping the sequence still hands over rather than
      // leaving the one in the orbit hanging above its pad forever.
      root.dataset.rocket = "away";
      // Takes the overlay out of the layout and the accessibility tree without
      // taking it out of React's hands. HomeMotion also waits on this before
      // it starts the drift.
      root.dataset.preloader = "done";
      clearInline();
      document.body.style.removeProperty("overflow");
      try {
        sessionStorage.setItem("preloader-seen", "1");
      } catch {
        // Private browsing: the sequence simply runs again next time.
      }
    };

    /**
     * The count has finished. Light the engine, let go of the pad, and only
     * then start lifting the overlay — the craft in the orbit below is told to
     * begin its descent at the same instant, so what a visitor sees is one
     * rocket leaving and the same rocket coming down onto a planet.
     */
    const launch = () => {
      // Only the release. Thrust and shake stay with the loop, which keeps
      // running through the climb — freezing them here left the craft holding
      // whatever offset the last frame happened to write.
      if (craft) craft.dataset.away = "";
      root.dataset.rocket = "away";
      timers.push(window.setTimeout(settle, HOLD_MS));
    };

    const settle = () => {
      overlay.style.transition = `opacity ${FADE_MS}ms var(--ease)`;
      overlay.style.opacity = "0";

      for (const [i, fragment] of fragments.entries()) {
        const delay = i * STAGGER_MS;
        fragment.style.transition =
          `opacity ${SETTLE_MS}ms var(--ease) ${delay}ms,` +
          `transform ${SETTLE_MS}ms var(--ease) ${delay}ms`;
      }
      if (widthAxis) {
        widthAxis.style.transition = `font-variation-settings ${SETTLE_MS}ms var(--ease)`;
      }

      // Two frames: the first commits the start state, the second the end.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const fragment of fragments) {
            fragment.style.opacity = "1";
            fragment.style.transform = "translate(0, 0)";
          }
          if (widthAxis) {
            widthAxis.style.fontVariationSettings = '"wdth" 125';
          }
        });
      });

      timers.push(
        window.setTimeout(
          finish,
          SETTLE_MS + fragments.length * STAGGER_MS + 60,
        ),
      );
    };

    const started = performance.now();
    /** Set the moment the count lands, so the climb keeps its own clock. */
    let awayAt = 0;
    /** How hard the engine is working, 0 on the pad to ~1.4 on the climb. */
    let level = 0;
    /** Last number actually written, so the same one is not written twice. */
    let shown = -1;

    const tick = (now: number) => {
      const seconds = (now - started) / 1000;

      if (awayAt === 0) {
        const t = Math.min(1, (now - started) / COUNT_MS);

        /*
         * Seconds left, counted the way a countdown is: `ceil`, so each number
         * owns the whole second it is naming rather than the instant it starts
         * at. T-3 is up for the first second, T-1 for the last, and the frame
         * that reaches zero is the release.
         *
         * Not eased. The engine ramp below is, because thrust builds; a clock
         * does not, and a countdown that slowed down in the middle would be a
         * countdown of something other than time.
         */
        const left = Math.max(0, COUNT_MS - (now - started));
        const count = Math.min(COUNT_FROM, Math.ceil(left / 1000));
        // Three numbers over three seconds is one change a second, against 180
        // frames. Writing it anyway relaid out a display-sized run of mono
        // glyphs on all 179 of the others, for a string that had not changed.
        if (counter && count !== shown) {
          shown = count;
          counter.textContent = `T-${count}`;
        }

        // power1.inOut, the same curve GSAP would have used.
        level = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        if (t >= 1) {
          awayAt = now;
          launch();
        }
      } else {
        // Off the pad: the engine comes up to full over its own short ramp
        // rather than stepping there, which is the join that read as a jolt.
        level = 1 + Math.min(1, (now - awayAt) / SPOOL_MS) * 0.42;
      }

      if (craft) {
        // The plume flickers around its level, and the craft shakes with it —
        // both continuous, both scaled by how hard the engine is working.
        craft.style.setProperty(
          "--thrust",
          (level * (1 + wobble(seconds, 0) * 0.09)).toFixed(3),
        );
        craft.style.setProperty(
          "--shake",
          `${(wobble(seconds, 1.7) * level * 1.5).toFixed(2)}px`,
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    const skip = () => {
      if (counter) counter.textContent = "T-0";
      finish();
    };

    overlay.addEventListener("click", skip);
    window.addEventListener("keydown", skip, { once: true });

    return () => {
      overlay.removeEventListener("click", skip);
      window.removeEventListener("keydown", skip);
      finish();
    };
  }, []);

  return null;
}

/** Server-rendered overlay. Static markup; `PreloaderRunner` drives it. */
export function PreloaderOverlay({ loading }: { loading: string }) {
  return (
    <div
      id="preloader"
      aria-hidden
      className="bg-void fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3"
    >
      <PreloaderCraft />
      {/* Server-rendered at the number the count starts on, so the first paint
          is already the first beat of the sequence rather than a value that is
          corrected a frame later. Three glyphs here and at every step after,
          in a mono face, so the line never changes width. */}
      <p
        data-preloader-count
        data-numeric
        className="text-section text-signal font-mono leading-none"
      >
        T-{COUNT_FROM}
      </p>
      <p className="label-mono text-center">{loading}</p>
    </div>
  );
}

/**
 * The craft on the pad, and the same one that lands in the orbit below.
 *
 * Drawn flat rather than pulled out of the WebGL scene: this has to be on
 * screen in the load window, before any of that has parsed, so it is a handful
 * of paths in the server-rendered markup and costs nothing. The proportions and
 * the two colours are `buildCraft`'s — white hull, orange nose, band and fins —
 * so the craft that leaves here reads as the craft that arrives there.
 *
 * The gradients are doing more work than they look like they are. A cylinder
 * lit from one side is the difference between a rocket and a rectangle, and
 * flat fills at this size read as clip art however good the silhouette is.
 *
 * Two nested wrappers because two transforms have to compose: the engine shake
 * on the inside, the launch itself on the outside.
 */
function PreloaderCraft() {
  return (
    <div data-preloader-craft className="mb-1">
      <div data-preloader-shake>
        <svg
          viewBox="0 0 120 306"
          width="76"
          height="194"
          fill="none"
          aria-hidden
        >
          <defs>
            {/* Left edge in shadow, a hot line off centre, right edge falling
                away: the shading a lit cylinder actually has. */}
            <linearGradient id="pl-hull" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7f878f" />
              <stop offset="24%" stopColor="#f6f8fb" />
              <stop offset="52%" stopColor="#dfe4ea" />
              <stop offset="100%" stopColor="#6f767e" />
            </linearGradient>
            <linearGradient id="pl-warm" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a8481a" />
              <stop offset="26%" stopColor="#ffab6b" />
              <stop offset="52%" stopColor="#ff8a3d" />
              <stop offset="100%" stopColor="#96421a" />
            </linearGradient>
            <linearGradient id="pl-steel" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3d444b" />
              <stop offset="30%" stopColor="#98a1aa" />
              <stop offset="100%" stopColor="#394046" />
            </linearGradient>
            {/* The wash the engine throws on everything around it. */}
            <radialGradient id="pl-wash" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#ffb066" stopOpacity="0.5" />
              <stop offset="55%" stopColor="#ff7a2a" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#ff7a2a" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Plume, anchored at the throat and grown downward, so thrust reads
              as length the way it does on the craft in the orbit. Three
              nested cones: a real flame is not one colour. */}
          <g data-preloader-flame>
            <ellipse cx="60" cy="212" rx="52" ry="60" fill="url(#pl-wash)" />
            <path
              d="M42 196 C42 232 51 272 60 302 C69 272 78 232 78 196 Z"
              fill="#ff7a2a"
              opacity="0.9"
            />
            <path
              d="M48 196 C48 226 55 258 60 282 C65 258 72 226 72 196 Z"
              fill="#ffb15e"
            />
            <path
              d="M53 196 C53 218 58 244 60 262 C62 244 67 218 67 196 Z"
              fill="#fff0d4"
            />
          </g>

          {/* Fins. */}
          <path d="M37 138 L37 184 L18 199 L25 146 Z" fill="url(#pl-warm)" />
          <path d="M83 138 L83 184 L102 199 L95 146 Z" fill="url(#pl-warm)" />
          {/* Nozzle. */}
          <path d="M39 160 L81 160 L92 196 L28 196 Z" fill="url(#pl-steel)" />
          {/* Hull. */}
          <path d="M37 64 L83 64 L83 170 L37 170 Z" fill="url(#pl-hull)" />
          {/* Band. */}
          <path d="M34 92 L86 92 L86 110 L34 110 Z" fill="url(#pl-warm)" />
          {/* Nose: an ogive rather than a triangle, which is both the shape a
              nose cone is and the difference between drawn and diagrammed. */}
          <path
            d="M60 8 C69 26 79 46 83 65 L37 65 C41 46 51 26 60 8 Z"
            fill="url(#pl-warm)"
          />
        </svg>
      </div>
    </div>
  );
}
