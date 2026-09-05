"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useCapability } from "@/components/motion/capability";
import { cn } from "@/lib/utils";

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

/**
 * What a scene behind the trail has to accept. Scroll position and the pointer
 * arrive as refs rather than props for the same reason they always do here:
 * neither may cause a render, and both change every frame.
 */
export type TrailSceneComponent = React.ComponentType<{
  progressRef: React.RefObject<number>;
  pointerRef: React.RefObject<{ x: number; y: number; on: number }>;
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
}: {
  /** Not baked in: the shell is the mechanism, not the section. */
  id?: string;
  chapters: Chapter[];
  label: string;
  /** The canvas behind the copy. */
  scene?: TrailSceneComponent;
}) {
  const section = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  // Tracked on the section rather than the canvas: the chapter copy sits over
  // the left half of it, and the strand should still answer the cursor there.
  const pointerRef = useRef({ x: 0, y: 0, on: 0 });
  const sceneBox = useRef<HTMLDivElement>(null);
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
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  // Latched, never unset: a canvas that has been built is cheap to keep and
  // expensive to rebuild.
  const [near, setNear] = useState(false);
  const { richMotion, reducedMotion } = useCapability();

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
    const box = node.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    const value = travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 0;

    progressRef.current = value;
    if (railRef.current) {
      railRef.current.style.transform = `scaleY(${value})`;
    }

    /*
     * How solid the globe is, either side of the pinned stretch.
     *
     * It used to be clipped to this section, which meant the bottom edge of the
     * section took a straight razor through the planet on the way out — a
     * photographic Earth cut off by a horizontal line, which reads as a broken
     * image rather than a transition. The canvas is viewport-sized and fixed
     * now, so instead of being cut it dims: still there behind the top of the
     * section that follows, gone a screen later.
     *
     * The two ramps meet the pinned stretch exactly. `top` reaches 0 as
     * progress starts, and `bottom` passes the fold as progress reaches 1 —
     * `travel` is the section height less one viewport, so those are the same
     * instant. No constant to keep in step with the layout.
     */
    const view = window.innerHeight;
    const enter = Math.min(1, Math.max(0, (view - box.top) / view));
    const leave = Math.min(1, Math.max(0, box.bottom / view));
    const solid = Math.min(enter, leave);
    const live = solid > 0.002;

    const layer = sceneBox.current;
    if (layer) {
      layer.style.opacity = String(solid);
      // Not opacity alone: a transparent full-screen canvas is still a
      // full-screen canvas for the compositor.
      layer.style.visibility = live ? "visible" : "hidden";
    }
    setSceneLive((current) => (current === live ? current : live));

    const next = Math.min(
      chapters.length - 1,
      Math.floor(value * chapters.length + 0.001),
    );
    setActive((current) => (current === next ? current : next));
  }, [chapters.length]);

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
   * Tell whatever section is next that it is standing in front of the globe.
   *
   * Measured before adding it: the last words of a body line reach far enough
   * right to land on lit cloud, and steel type there came out at 2.2:1. The
   * halo is the same one the chapter copy over this scene already wears, and it
   * costs nothing to look at — a black shadow on a black background is
   * invisible until there is something bright behind the letters.
   *
   * The next sibling rather than a name: this component does not know, and
   * should not know, which section it was placed above.
   */
  useEffect(() => {
    const after = section.current?.nextElementSibling;
    if (!after) return;
    after.toggleAttribute("data-scene-spill", sceneLive);
    return () => after.removeAttribute("data-scene-spill");
  }, [sceneLive]);

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
            pointerRef={pointerRef}
            running={sceneLive}
          />
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
