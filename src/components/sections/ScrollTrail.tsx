"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useCapability } from "@/components/motion/capability";
import { earthDisc } from "@/components/three/earth-frame";
import { moonPhase } from "@/lib/sky";
import { cn } from "@/lib/utils";
import { EMERGE, placeSky, type Disc } from "./sky-relay";

/**
 * The pinned scroll narrative.
 *
 * The section is `chapters × 100vh` tall with a sticky viewport inside it, so
 * scrolling moves through the story while the visual stays put. Progress is a
 * plain number derived from the section's own bounding box — no ScrollTrigger,
 * because nothing here needs pinning that the browser cannot do natively, and
 * `position: sticky` survives with JavaScript off.
 *
 * The WebGL layer is enhancement on top of that. Without it — a phone, reduced
 * motion, a machine with fewer than four cores — every chapter is still a
 * readable block of prose in the page, which is the whole point of building it
 * this way round.
 */
const EarthScene = dynamic(() => import("@/components/three/EarthScene"), {
  ssr: false,
});

const MoonScene = dynamic(() => import("@/components/three/MoonScene"), {
  ssr: false,
});

/**
 * The disc a moon box is actually drawing, from the box itself.
 *
 * `MoonScene` frames a unit sphere in an orthographic half-height of 1.12, so
 * whatever the box, the disc is 1/1.12 of it — and where the box is twice as
 * tall as it is wide, the scene stands the camera off to one side and draws
 * only the left half, which puts the centre on the box's right edge. Both
 * shapes are read here rather than assumed, because the about section uses one
 * on a phone and the other on a laptop.
 */
function discOf(box: DOMRect): Disc {
  const half = box.width < box.height * 0.75;
  return {
    x: half ? box.right : box.left + box.width / 2,
    y: box.top + box.height / 2,
    d: box.height / 1.12,
  };
}

/**
 * What a scene behind the trail has to accept. Scroll position and the pointer
 * arrive as refs rather than props for the same reason they always do here:
 * neither may cause a render, and both change every frame.
 */
export type TrailSceneComponent = React.ComponentType<{
  progressRef: React.RefObject<number>;
  pointerRef: React.RefObject<{ x: number; y: number; on: number }>;
  /** Optional: a scene that lets the section reframe it during a handover. */
  frameRef?: React.RefObject<{ scale: number; x: number; y: number }>;
  running: boolean;
}>;

export type Chapter = {
  id: string;
  index: string;
  kicker: string;
  title: string;
  body: string;
  /** The one figure worth pulling out of the body copy. */
  figure?: { value: string; label: string };
};

export function ScrollTrail({
  id = "trail",
  chapters,
  label,
  scene: Scene = EarthScene,
  handoff,
}: {
  /** Not baked in: the shell is the mechanism, not the section. */
  id?: string;
  chapters: Chapter[];
  label: string;
  /** The canvas behind the copy. */
  scene?: TrailSceneComponent;
  /**
   * A selector for a moon this scene should hand over to further down the page.
   * Given one, the sky does not simply fade out at the end of the trail: a moon
   * comes out from behind the globe, takes the frame, and travels to that
   * element's disc, where the real one takes over. Left out, the section
   * behaves as it always did.
   */
  handoff?: string;
}) {
  const section = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  // Tracked on the section rather than the canvas: the chapter copy sits over
  // the left half of it, and the strand should still answer the cursor there.
  const pointerRef = useRef({ x: 0, y: 0, on: 0 });
  const sceneBox = useRef<HTMLDivElement>(null);
  /** Written every frame, read by the scene. Never causes a render. */
  const frameRef = useRef({ scale: 1, x: 0.71, y: 0.5 });
  const moonBox = useRef<HTMLDivElement>(null);
  /** The moon being held back, and whether it currently is. */
  const held = useRef<Element | null>(null);
  const heldOn = useRef(false);
  const railRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the scene is worth drawing.
   *
   * This used to be an IntersectionObserver on the canvas box. The box is
   * `fixed` now — always intersecting, by construction — so the observer would
   * answer "yes" for the entire length of the page and the globe would keep
   * rendering behind the footer. Scroll position is the honest source.
   */
  const [sceneLive, setSceneLive] = useState(false);
  const [moonLive, setMoonLive] = useState(false);
  /** Either body on screen — which is what the copy below has to survive. */
  const [skyLive, setSkyLive] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  // Latched, never unset: a canvas that has been built is cheap to keep and
  // expensive to rebuild.
  const [near, setNear] = useState(false);
  const { richMotion, reducedMotion, pointerFine } = useCapability();
  /* The same real phase the about section draws, so the two discs the handover
     crossfades between are the same moon and not merely both moons. */
  const [phase, setPhase] = useState(0.5);
  useEffect(() => setPhase(moonPhase(new Date()).phase), []);

  useEffect(() => {
    if (!richMotion) return;
    // Room rather than width, and the same floor the orbit uses. The strand is
    // 1.6 units across and 6.2 tall — a portrait shape, and one a phone frames
    // better than a laptop does.
    const query = window.matchMedia(
      "(min-width: 360px) and (min-height: 480px)",
    );
    const decide = () => setMounted(query.matches);
    decide();
    query.addEventListener("change", decide);
    return () => query.removeEventListener("change", decide);
  }, [richMotion]);

  /**
   * Wait until the section is nearly on screen before building the canvas.
   *
   * This one lives most of a page below the fold, and it used to create its
   * WebGL context, compile its shaders and bake its sky the instant the page
   * hydrated — all of it in the load window, for a picture that is a full
   * screen-height away. The observer is on the section rather than on the
   * canvas box, because the canvas box is the thing that does not exist yet.
   *
   * Only the canvas waits. The section keeps its full height from the first
   * render, so nothing below it moves when the scene arrives.
   */
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: "700px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measure = useCallback(() => {
    const node = section.current;
    if (!node) return;
    /*
     * Whether there is a relay at all.
     *
     * Not just "was a handoff given". Reduced motion, a viewport too small for
     * the scene, a machine that never got the rich-motion flag — in all of them
     * no canvas is mounted, and the code below would still hold the about
     * section's own moon back for a relay that is never coming. Which is the
     * worst outcome available: the section simply has no moon in it.
     */
    const relaying = handoff && mounted && reducedMotion === false ? handoff : null;
    const box = node.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    const value = travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 0;

    progressRef.current = value;
    if (railRef.current) {
      railRef.current.style.transform = `scaleY(${value})`;
    }

    /*
     * The sky, either side of the pinned stretch.
     *
     * The globe used to be clipped to this section, which meant the bottom edge
     * took a straight razor through the planet on the way out. It is a fixed
     * viewport layer now, so instead of being cut it hands over: given a
     * `handoff`, a moon comes out from behind it, takes the frame while the
     * globe goes out, and travels to the disc the about section draws.
     *
     * `enter` is the only ramp still computed here, because it is the only one
     * tied to this section's own box: `top` reaches 0 exactly as progress
     * starts, so the globe is solid by the time the first chapter is pinned.
     * Everything after the pin is `placeSky`, which is pure and checkable.
     */
    const layer = sceneBox.current;
    /* The document element's box, not the window's and not the layer's.
       `innerWidth` counts the 15px `scrollbar-gutter: stable` reservation that
       a fixed element does not get, and a globe placed against it is fifteen
       pixels from where the moon comes out of it. The layer would have been
       right until the Earth started receding — it is scaled now, so its own
       box shrinks with it, and reading the viewport off it made the moon
       collapse along with the planet. */
    const view = {
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    };
    const enter = Math.min(1, Math.max(0, (view.h - box.top) / view.h));
    // Pixels scrolled beyond the end of the pin. `travel` is the section height
    // less a viewport, so `bottom` crossing the fold and progress reaching 1 are
    // the same instant, and this counts from there.
    const past = view.h - box.bottom;

    let target: Disc | null = null;
    let rest: Disc | null = null;
    let span: number | null = null;
    let gone = 0;
    let waiting: Element | null = null;
    if (relaying) {
      // Both moons carry the hook and CSS displays one of them; the one with a
      // box is the one on this screen.
      const found = Array.from(document.querySelectorAll(relaying)).find(
        (node) => node.getBoundingClientRect().height > 1,
      );
      if (found) {
        const rect = found.getBoundingClientRect();
        target = discOf(rect);
        // The same disc as it will be at the handover: the lock position is
        // defined as the one that centres it, so its resting y is the middle of
        // the screen and its x does not depend on scroll at all.
        rest = { x: target.x, y: view.h / 2, d: target.d };
        const emerged = window.scrollY - past + EMERGE * view.h;
        const lock = window.scrollY + rect.top + rect.height / 2 - view.h / 2;
        span = lock - emerged;
        gone = window.scrollY - emerged;
        waiting = found;
      }
    }

    const place = placeSky({
      view,
      past,
      earthDisc: earthDisc(view.w, view.h),
      target,
      rest,
      travel: span,
      travelled: gone,
    });

    const globe = Math.min(enter, place.earth.opacity);
    const moon = relaying ? place.moon : null;
    const moonOn = moon ? moon.opacity : 0;
    const live = globe > 0.002;
    const anything = live || moonOn > 0.002;

    /*
     * The globe's size and position go to the camera, not to the layer.
     *
     * The first version of this scaled the canvas element. Two things were
     * wrong with that and both were visible. It scaled about the planet's
     * *moving* centre while also translating by the same delta, which is one
     * correction too many — the globe landed 254px from where the arithmetic
     * had put it, and was then hidden by a coverage test that believed the
     * arithmetic, so it blinked out with 50px of itself still outside the moon.
     * And the canvas image is clipped at its own edges, so shrinking it pulled
     * the straight cut through the atmosphere at the bottom and right of the
     * frame into the middle of the picture.
     */
    frameRef.current.scale = place.earth.scale;
    frameRef.current.x = place.earth.x / view.w;
    frameRef.current.y = place.earth.y / view.h;

    if (layer) {
      layer.style.opacity = String(globe);
      // Not opacity alone: a transparent full-screen canvas is still a
      // full-screen canvas for the compositor.
      layer.style.visibility = live ? "visible" : "hidden";
    }

    const disc = moonBox.current;
    if (disc) {
      if (moon && moonOn > 0.002) {
        disc.style.visibility = "visible";
        disc.style.opacity = String(moonOn);
        disc.style.width = `${moon.d}px`;
        disc.style.height = `${moon.d}px`;
        disc.style.transform = `translate3d(${moon.x - moon.d / 2}px, ${moon.y - moon.d / 2}px, 0)`;
        /* Brightness, not opacity: see sky-relay. A see-through moon in front
           of the Earth undoes the one thing the sequence is saying. */
        disc.style.filter = moon.brightness < 0.999 ? `brightness(${moon.brightness})` : "";
        /* Two canvases cannot share a depth buffer, so "behind the Earth" and
           "in front of it" is a z-index and nothing more. `placeSky` only
           flips it at the one point in the arc where the discs are apart. */
        disc.style.zIndex = moon.front ? "-4" : "-6";
      } else {
        disc.style.visibility = "hidden";
      }
    }

    /*
     * Hold the real moon back while this one is still on its way.
     *
     * The about section's moon fades itself in as soon as it is near, which
     * during the journey means two moons on screen at once in different places.
     * It is kept hidden until the relay is sitting exactly on top of it, so what
     * the visitor sees appear is a disc already in the right place at the right
     * size — and then the relay fades off the top of it.
     */
    const inbound = Boolean(
      relaying && moon && span !== null && span > 0 && gone < span,
    );
    if (waiting !== held.current || inbound !== heldOn.current) {
      held.current?.removeAttribute("data-relay-hold");
      if (inbound) waiting?.setAttribute("data-relay-hold", "");
      held.current = waiting;
      heldOn.current = inbound;
    }

    setSceneLive((current) => (current === live ? current : live));
    setMoonLive((current) =>
      current === moonOn > 0.002 ? current : moonOn > 0.002,
    );
    setSkyLive((current) => (current === anything ? current : anything));

    const next = Math.min(
      chapters.length - 1,
      Math.floor(value * chapters.length + 0.001),
    );
    setActive((current) => (current === next ? current : next));
  }, [chapters.length, handoff, mounted, reducedMotion]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
      }
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure]);

  // The layer mounts after the section does, so it starts hidden and would stay
  // that way until the next scroll event. Fine for someone scrolling into it,
  // wrong for someone who arrived on an anchor and is already standing here.
  useEffect(() => {
    measure();
  }, [measure, mounted, near, reducedMotion]);

  /*
   * Tell the page that there is something lit behind it.
   *
   * Measured before adding it: the last words of a body line reach far enough
   * right to land on lit cloud, and steel type there came out at 2.2:1. The
   * halo is the same one the chapter copy over this scene already wears, and it
   * costs nothing to look at — a black shadow on a black background is
   * invisible until there is something bright behind the letters.
   *
   * On the body rather than the next section, because with a handoff the sky no
   * longer stops at the next section: the moon crosses experience, capabilities
   * and into about. Marking each one in turn would mean this component knowing
   * how far its own sky reaches, and it does not — the destination does.
   */
  useEffect(() => {
    const body = document.body;
    body.toggleAttribute("data-scene-spill", skyLive);
    return () => body.removeAttribute("data-scene-spill");
  }, [skyLive]);

  /* Whatever happens to this component, the moon it was holding back is not
     its to keep. Unmounting mid-journey would otherwise leave the about
     section with an element that is permanently invisible. */
  useEffect(
    () => () => {
      held.current?.removeAttribute("data-relay-hold");
      held.current = null;
      heldOn.current = false;
    },
    [],
  );

  const showScene = mounted && reducedMotion === false;

  return (
    <section
      ref={section}
      id={id}
      aria-labelledby={`${id}-title`}
      className="relative"
      /*
        Only the pinned version needs the tall scroll runway. Without the scene
        the section is an ordinary stack of prose and takes the height it needs.
      */
      style={showScene ? { height: `${chapters.length * 100}vh` } : undefined}
    >
      <h2 id={`${id}-title`} className="sr-only">
        {label}
      </h2>

      {/*
        The scene is a viewport layer, not a child of the pinned box.

        Sticky ends where its section ends, so the globe was being sliced flat
        by the section boundary on the way out. Fixed, it outlives the section:
        it holds through the pinned chapters and then dims behind the top of
        whatever comes next, which is what the eye expects a planet to do.

        Behind the copy at `-z-[5]`, because a negative layer paints under the
        page's in-flow content — but above the star field at `-z-10`, so this
        still reads as being in the same sky. Opacity and visibility are set
        from the scroll handler; the initial hidden state matters, or it flashes
        at full strength for one frame before the first measurement lands.
      */}
      {showScene && near ? (
        <div
          ref={sceneBox}
          aria-hidden
          /* The canvas box is the whole scene; an outline of it is not a
             cursor. The visuals answer the pointer themselves. */
          data-cursor-shape="off"
          className="pointer-events-none fixed inset-0 -z-[5]"
          style={{ opacity: 0, visibility: "hidden" }}
        >
          <Scene
            progressRef={progressRef}
            frameRef={frameRef}
            pointerRef={pointerRef}
            running={sceneLive}
          />
        </div>
      ) : null}

      {/*
        The moon, on its own layer so it can pass behind the globe and then in
        front of it. Sized and moved from the scroll handler; `left`/`top` stay
        at zero and the journey is a transform, which is the difference between
        compositing it and laying the page out again on every frame.

        Mounted with the globe rather than when it is first needed. It bakes its
        surface into a cube map on the first frame it draws, and that bake in the
        middle of a scroll is a hitch exactly where the eye is.
      */}
      {showScene && near && handoff ? (
        <div
          ref={moonBox}
          aria-hidden
          data-cursor-shape="off"
          className="pointer-events-none fixed top-0 left-0"
          style={{ opacity: 0, visibility: "hidden", zIndex: -6 }}
        >
          <MoonScene phase={phase} full running={moonLive} drift={!pointerFine} />
        </div>
      ) : null}

      <div
        className={cn(
          showScene
            ? // `svh`, not `vh`: on a phone `vh` is the height with the address
              // bar hidden, so a pinned panel measured in it is taller than the
              // screen until you scroll. The padding is the sticky bar, which
              // this sits underneath.
              "sticky top-0 flex h-[100svh] items-center overflow-hidden pt-[var(--header-h)] sm:pt-0"
            : "section-gap",
        )}
        onPointerMove={
          showScene
            ? (event) => {
                if (event.pointerType === "touch") return;
                const box = event.currentTarget.getBoundingClientRect();
                pointerRef.current.x =
                  ((event.clientX - box.left) / box.width) * 2 - 1;
                pointerRef.current.y = -(
                  ((event.clientY - box.top) / box.height) * 2 -
                  1
                );
                pointerRef.current.on = 1;
              }
            : undefined
        }
        onPointerLeave={() => {
          pointerRef.current.on = 0;
        }}
      >
        {/*
          Every chapter is in the DOM at all times. Crossfading one over another
          is a treatment the pinned version can afford; everywhere else they are
          simply stacked down the page, which is what a phone, a reduced-motion
          visitor, and a page with no JavaScript all get.
        */}
        <div className="shell relative z-10 w-full">
          <div
            className={cn(
              "relative max-w-[38rem]",
              !showScene && "flex flex-col gap-[12vh]",
            )}
          >
            {chapters.map((chapter, i) => (
              <article
                key={chapter.id}
                aria-current={showScene && i === active ? "true" : undefined}
                /* Legibility over the scene, on the screens where the copy is
                   full-width and therefore sitting right on top of it. See
                   `[data-trail-copy]` in globals.css. */
                data-trail-copy={showScene ? "" : undefined}
                className={cn(
                  "ease-brief transition-opacity duration-[var(--dur-panel)]",
                  // Pinned: the first chapter holds the flow and the rest stack
                  // on top of it, so the block never changes height.
                  showScene && i !== 0 ? "absolute inset-0" : "relative",
                  showScene && i !== active
                    ? "pointer-events-none opacity-0"
                    : "opacity-100",
                )}
              >
                <p className="label-mono">
                  <span className="text-signal" data-numeric>
                    {chapter.index}
                  </span>{" "}
                  / {chapter.kicker}
                </p>

                <h3 className="font-display text-section mt-5 leading-[0.92]">
                  {chapter.title}
                </h3>

                <p className="measure text-lead text-steel mt-6">
                  {chapter.body}
                </p>

                {chapter.figure ? (
                  <p className="mt-7 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span
                      className="text-signal text-title font-mono leading-none"
                      data-numeric
                    >
                      {chapter.figure.value}
                    </span>
                    <span className="label-mono max-w-[26ch]">
                      {chapter.figure.label}
                    </span>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        {/* Where you are in the story. Decorative: the chapters themselves are
            the content, and they are all in the page either way. */}
        <div
          aria-hidden
          className={cn(
            "bg-hairline absolute top-1/2 right-6 z-10 h-[9rem] w-px -translate-y-1/2",
            showScene ? "hidden lg:block" : "hidden",
          )}
        >
          <div
            ref={railRef}
            className="bg-signal h-full w-px origin-top scale-y-0"
          />
        </div>

        <ol
          aria-hidden
          data-trail-marker={showScene ? "" : undefined}
          className={cn(
            "absolute top-1/2 right-12 z-10 -translate-y-1/2 list-none flex-col gap-3 p-0",
            showScene ? "hidden lg:flex" : "hidden",
          )}
        >
          {chapters.map((chapter, i) => (
            <li
              key={chapter.id}
              className={cn(
                // Inactive markers keep `label-mono`'s own steel. They were a
                // step dimmer than that, which put them at 1.3:1 on black —
                // legible only while a canvas happened to be behind them, and
                // a contrast failure the moment one was not.
                "label-mono ease-brief text-right transition-colors duration-[var(--dur-ui)]",
                i === active && "text-signal",
              )}
            >
              {chapter.index}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
