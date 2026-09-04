"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { projectMetrics, type Project } from "@/content";
import { useCapability } from "@/components/motion/capability";
import { onHandover } from "@/components/motion/handover";
import { StarFocus, warmStar } from "@/components/sections/StarFocus";
import { cn } from "@/lib/utils";

/**
 * Decides whether the hero runs as a WebGL scene at all, and carries the HTML
 * half of it: the controls and the panel describing whichever project is at the
 * front of the ring.
 *
 * Clicking a planet flies the camera in to it and opens the full record —
 * what the project is, what it does, what it was built with, and a way
 * straight into the live version where one exists. Escape, the back button, or
 * dragging the orbit gives the system back. The panel is HTML throughout, so
 * everything in it is selectable, linkable, and reachable from the keyboard.
 *
 * three, fiber, and drei are the heaviest thing in the repository by a wide
 * margin, so they are behind `next/dynamic` *and* behind this gate — a
 * reduced-motion visitor, or a machine with fewer than four cores, never
 * downloads them and gets the static field instead (§7).
 *
 * Phones used to be on that list, on the assumption that a 390px screen could
 * not afford it. Measured, that was simply wrong: the canvas caps its own
 * pixel ratio at 1.5, so a phone renders 0.44 megapixels against a desktop's
 * 1.2 to 3.4, and it held its frame rate with the main thread slowed six
 * times over. What a phone genuinely cannot take is the *composition* — a ring
 * three and a half units wide seen through a portrait frame — and that is the
 * camera's problem, not this gate's. See `HeroScene`.
 */
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

/**
 * Pull the module down without rendering it.
 *
 * Splitting the fetch from the mount is the whole trick. The download and the
 * parse are cheap and can happen under the loading screen; creating a WebGL
 * context and compiling a dozen shaders is neither, and that part waits for
 * the handover. Warming the module first means the wait costs nothing — by the
 * time the craft leaves the pad the code is already here.
 */
function warmScene() {
  void import("./HeroScene");
}

export function SceneMount({
  projects,
  caseStudies,
  fallback,
}: {
  projects: Project[];
  caseStudies: string[];
  /** Resolved on the server: is there a photo to build the likeness from? */
  fallback: React.ReactNode;
}) {
  const { richMotion, reducedMotion } = useCapability();
  const [mounted, setMounted] = useState(false);
  const [front, setFront] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  // The star, which is not one of the projects and does not belong on the same
  // axis as them: a planet is a record to read, and this is the whole screen.
  const [starred, setStarred] = useState(false);
  const [starDark, setStarDark] = useState(false);
  const stepRef = useRef(0);
  const backRef = useRef<HTMLButtonElement>(null);
  const recordRef = useRef<HTMLDivElement>(null);

  /*
   * Big enough for an orbit to be worth drawing, and capable enough to run it.
   *
   * Both dimensions, because it is room the ring needs rather than width. The
   * width floor is a small phone in portrait — below it there is no focal
   * length that frames the ring and still leaves a planet big enough to aim a
   * thumb at. The height floor is what rules out a phone on its side: 390
   * points tall, less the bar, is 330 for a name, a record and the system they
   * belong to, and the name alone wants a third of it. The field is the better
   * answer there, and it is the answer that screen already had.
   */
  useEffect(() => {
    if (!richMotion) return;
    const query = window.matchMedia(
      "(min-width: 360px) and (min-height: 480px)",
    );
    if (!query.matches) {
      const decide = () => setMounted(query.matches);
      query.addEventListener("change", decide);
      return () => query.removeEventListener("change", decide);
    }

    // Big enough, so the code is worth having. Whether it is worth *running*
    // yet is the loading screen's call.
    warmScene();
    // The star's surface is its own chunk and its own shader. Fetching it now
    // costs nothing anyone will feel and takes the download off the click,
    // which is the one moment there is nothing on screen to cover it.
    warmStar();
    let cancelled = false;
    const stop = onHandover(() => {
      if (!cancelled) setMounted(true);
    });
    const decide = () => setMounted(query.matches);
    query.addEventListener("change", decide);
    return () => {
      cancelled = true;
      stop();
      query.removeEventListener("change", decide);
    };
  }, [richMotion]);

  /*
   * Tell the page the orbit is here.
   *
   * The hero reserves a screen's height for it and hides the written index
   * that stands in for it, and neither of those decisions can be made in
   * React from up there: this component owns the answer and the section is its
   * parent. An attribute on the root is how the rest of the site already
   * passes this kind of thing around — see `data-preloader`.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!mounted) return;
    root.dataset.orbit = "on";
    return () => {
      delete root.dataset.orbit;
    };
  }, [mounted]);

  const turn = useCallback((direction: number) => {
    stepRef.current += direction;
    setFocused(null);
  }, []);

  const select = useCallback((index: number) => {
    setFront(index);
    setFocused(index);
    setStarred(false);
  }, []);

  const dismiss = useCallback(() => setFocused(null), []);

  const selectStar = useCallback(() => {
    setFocused(null);
    setStarred(true);
  }, []);

  const closeStar = useCallback(() => setStarred(false), []);

  /*
   * Stop the orbit once it is behind an opaque screen.
   *
   * Not on the click: the dive into the star is the first half-second of this
   * and it happens in that canvas. So the scene keeps drawing until the
   * blackout has finished covering it, and only then goes quiet — which is
   * also the point after which there is a full-screen sun to draw instead, and
   * two scenes at once is the one thing this page never asks for.
   */
  useEffect(() => {
    if (!starred) {
      setStarDark(false);
      return;
    }
    const id = window.setTimeout(() => setStarDark(true), 620);
    return () => window.clearTimeout(id);
  }, [starred]);

  // Escape is the way out of anything that has taken over the view.
  useEffect(() => {
    if (focused === null || starred) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(null);
    };
    window.addEventListener("keydown", onKey);
    // The record is what the click was for, so put the keyboard in it — at the
    // top of it. This used to focus the button at the bottom, which on a phone
    // scrolls the sheet down to reach it and hides the title of the very thing
    // that was just tapped.
    recordRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, starred]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        turn(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        turn(1);
      }
    },
    [turn],
  );

  if (reducedMotion === null) return <>{fallback}</>;
  if (!mounted) return <>{fallback}</>;

  const project = projects[front] ?? projects[0];
  const metric = projectMetrics[project.slug];
  const hasStudy = caseStudies.includes(project.slug);
  const href = hasStudy
    ? `/work/${project.slug}`
    : (project.live?.href ?? "/#work");

  return (
    <>
      <HeroScene
        projects={projects}
        focused={focused}
        onFrontChange={setFront}
        onSelect={select}
        starred={starred}
        onSelectStar={selectStar}
        paused={starDark}
        onDismiss={dismiss}
        stepRef={stepRef}
      />

      <StarFocus open={starred} onClose={closeStar} />

      {/* The keyboard and screen-reader path to the same six projects. Inert
          behind the star, which is a dialog: it covers all of this, so none of
          it should still be tabbable or readable underneath. */}
      <div
        inert={starred}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
      >
        <div className="shell flex flex-col gap-3 pb-4 sm:gap-5 sm:pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div
            ref={recordRef}
            tabIndex={focused !== null ? -1 : undefined}
            className={cn(
              "pointer-events-auto max-w-[34rem]",
              // Flown in on a phone, this becomes a bottom sheet: short, edge
              // to edge, and opaque, with only the detail lines inside it
              // scrolling. Short because it is sitting on the scene it is
              // describing and covering all of it defeats the point; edge to
              // edge because the hero's own type is set a few pixels wider
              // than this column and was showing past its left border.
              focused !== null &&
                "border-hairline bg-void mx-[calc(var(--shell-pad)*-1)] flex max-h-[46svh] flex-col overflow-hidden border-t px-[var(--shell-pad)] py-4 sm:mx-0 sm:block sm:max-h-none sm:overflow-visible sm:border-0 sm:bg-transparent sm:p-0",
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="flex shrink-0 items-start justify-between gap-3">
              <p className="label-mono">
                <span className="text-signal" data-numeric>
                  {String(front + 1).padStart(2, "0")}
                </span>{" "}
                / {projects.length} in orbit / {project.period.toLowerCase()}
              </p>

              {/* The way out, on a phone, lives up here where it is always
                  visible. Down in the row with the other two it was a third
                  full-width button in a sheet with no room for one, and it
                  squeezed the detail lines it was sitting under to nothing. */}
              {focused !== null ? (
                <button
                  type="button"
                  onClick={dismiss}
                  className="tap label-mono border-hairline text-steel ease-brief hover:border-steel hover:text-signal -mt-1 inline-flex shrink-0 border px-3 transition-colors duration-[var(--dur-ui)] sm:hidden"
                >
                  Close
                </button>
              ) : null}
            </div>
            <h2 className="font-display text-title mt-2 shrink-0 leading-[0.95]">
              <Link
                href={href}
                className="ease-brief hover:text-steel transition-colors duration-[var(--dur-ui)]"
              >
                {project.title}
              </Link>
            </h2>
            {/* Both of these are said again in full a screen further down,
                and on a phone the panel they are in is standing on the ring.
                The title and the way in are what this has to carry. */}
            <p className="text-body text-steel mt-2 hidden sm:block">
              {project.hook}
            </p>
            <p className="label-mono mt-2 hidden sm:block">
              {project.stack.join(" · ")}
              {metric ? ` · ${short(metric)}` : ""}
            </p>
            {focused === null ? (
              <p className="label-mono text-signal mt-2">
                {project.live
                  ? `${project.live.label} →`
                  : "Click the planet for the full record"}
              </p>
            ) : null}

            {/* Flown in: the rest of the record, and the way into the live
                version. Rendered rather than toggled with CSS so nothing here
                is in the accessibility tree while the camera is wide. */}
            {focused !== null ? (
              // On a phone the sheet above is already the border and the
              // background; here that would be a box inside a box.
              <div className="sm:border-hairline sm:bg-void/80 mt-4 flex min-h-0 flex-1 flex-col sm:block sm:border sm:p-5">
                {project.detail?.length ? (
                  // The one part that scrolls. Everything either side of it —
                  // the title above, the ways in below — stays put, so a short
                  // sheet never hides the buttons at the bottom of itself.
                  <ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0 sm:flex-none sm:overflow-visible">
                    {project.detail.map((line) => (
                      <li
                        key={line}
                        className="text-small text-steel before:text-signal flex gap-2 before:content-['—']"
                      >
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
                  {project.live ? (
                    <Link
                      href={project.live.href}
                      className="label-mono border-signal bg-signal text-void ease-brief hover:bg-void hover:text-signal border px-4 py-2.5 transition-colors duration-[var(--dur-ui)]"
                    >
                      {project.live.label} →
                    </Link>
                  ) : null}
                  {caseStudies.includes(project.slug) ? (
                    <Link
                      href={`/work/${project.slug}`}
                      className="label-mono border-hairline text-signal ease-brief hover:border-signal border px-4 py-2.5 transition-colors duration-[var(--dur-ui)]"
                    >
                      Read the case study →
                    </Link>
                  ) : null}
                  <button
                    ref={backRef}
                    type="button"
                    onClick={dismiss}
                    className="label-mono border-hairline text-steel ease-brief hover:border-steel hover:text-signal hidden border px-4 py-2.5 transition-colors duration-[var(--dur-ui)] sm:block"
                  >
                    Back to the system
                  </button>
                </div>
                <p className="label-mono mt-3 hidden shrink-0 sm:block">
                  Escape, or drag the orbit, to pull back out.
                </p>
              </div>
            ) : null}
          </div>

          <div
            className="pointer-events-auto flex flex-col gap-3"
            onKeyDown={onKeyDown}
          >
            <p className="label-mono hidden sm:block">
              Drag to turn the orbit, or step through it
            </p>
            <div className="flex items-center gap-2">
              <TurnButton label="Previous project" onClick={() => turn(-1)}>
                <Arrow direction="left" />
              </TurnButton>
              <TurnButton label="Next project" onClick={() => turn(1)}>
                <Arrow direction="right" />
              </TurnButton>

              <ol className="ml-2 flex list-none items-center gap-1.5 p-0">
                {projects.map((item, i) => (
                  <li key={item.slug}>
                    <button
                      type="button"
                      onClick={() => {
                        turn(i - front);
                      }}
                      aria-current={i === front ? "true" : undefined}
                      className={cn(
                        "ease-brief block h-2 w-2 border transition-colors duration-[var(--dur-ui)]",
                        i === front
                          ? "border-signal bg-signal"
                          : "border-steel hover:border-signal",
                      )}
                    >
                      <span className="sr-only">
                        Bring {item.title} to the front
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TurnButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-hairline text-signal ease-brief hover:border-signal hover:bg-signal hover:text-void border p-2.5 transition-colors duration-[var(--dur-ui)]"
    >
      {children}
    </button>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 10"
      width="16"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className={direction === "left" ? "rotate-180" : undefined}
    >
      <path d="M0 5h14M10 1l4 4-4 4" />
    </svg>
  );
}

function short(metric: (typeof projectMetrics)[string]): string {
  switch (metric.kind) {
    case "delta":
      return `${metric.from} → ${metric.to} ${metric.unit}`;
    case "level":
      return `${metric.value}${metric.unit}`;
    case "shortfall":
      return `${metric.value}${metric.unit} below target ROI`;
    case "count":
      return `${metric.value} ${metric.unit}, ${metric.note}`;
  }
}
