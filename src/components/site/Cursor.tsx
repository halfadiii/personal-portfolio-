"use client";

import { useEffect, useRef } from "react";
import { useCapability } from "@/components/motion/capability";

/**
 * §6 — the cursor.
 *
 * At rest it is a small mono dot. Over something that is drawn as a box — a
 * button, a card, a field, anything with a border or a fill — it dissolves
 * into an outline of that box and returns to a dot the moment the pointer
 * leaves. Elements that carry `data-cursor-label` get the label instead.
 *
 * Text does not get an outline. It used to trace the run of glyphs under the
 * pointer, which was accurate and unwanted: a rectangle drawn round a sentence
 * reads as a selection or an error, not as a cursor. Prose now just gets the
 * plain dot.
 *
 * Desktop pointer-fine only, and never under reduced motion.
 *
 * Nothing here passes through React state. The hovered element's box is read
 * once a frame while — and only while — something is held.
 *
 * It used to be measured once on arrival and cached in document coordinates, on
 * the reasoning that a scroll cannot invalidate a document-space box. That is
 * true of a page whose content only scrolls, and this page has two places where
 * it does more than that. The work rail is pinned: while it is on screen the
 * cards keep the same viewport position and the document scrolls past them, so
 * a box cached as `top + scrollY` drifts upward by exactly the distance
 * scrolled. And a card in the bento moves under its own hover transform the
 * moment it is pointed at, so the box cached on arrival is the box it was
 * leaving. Both showed up as the outline sitting somewhere the card is not.
 *
 * So the box is read live. What is still cached is the corner radius, which
 * needs `getComputedStyle` and does not change while the pointer sits on
 * something. One rect read a frame for one element is a fraction of what the
 * old version was avoiding — that was measuring every rendered line of every
 * paragraph, on every frame, whether or not anything had moved.
 */

/**
 * What can be outlined. `closest` walks up from the pointer target and returns
 * the innermost match, so a button inside a card outlines the button. Put
 * `data-cursor-shape="off"` on anything that should be skipped — a WebGL
 * canvas, for instance, whose box is the whole scene.
 *
 * Candidates still have to survive `isDrawnAsBox`: a text link in the middle
 * of a paragraph is interactive but is not a box, and boxing it would be the
 * same mistake as boxing the paragraph.
 */
const SHAPES = [
  "[data-cursor-shape]",
  "a",
  "button",
  "[role='button']",
  "summary",
  "input",
  "textarea",
  "select",
].join(",");

/** Past this share of the viewport an outline stops being a cursor. */
const TOO_BIG = 0.5;
const DOT = 8;
/** How fast the outline closes on its target. Lower is heavier. */
const EASE = 0.155;

/**
 * And how fast once it has arrived.
 *
 * The soft ease is what gives the morph from dot to box its weight, and it is
 * right for that. It is wrong the moment the box itself starts moving — under
 * a hover lift, or on a rail sliding sideways — because then the lag is not the
 * cursor being unhurried, it is the outline sitting off the thing it is drawn
 * around. So the easing is for the journey, and the arrival is exact — an
 * outline is the edge of a thing, not something following it.
 */
const GLUED = 1;
/** Within this many pixels of the target, the outline counts as arrived. */
const ARRIVED = 1.5;

type Box = { x: number; y: number; w: number; h: number; r: number };

export function Cursor() {
  const { pointerFine, reducedMotion } = useCapability();
  const dotRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const shapeRef = useRef<HTMLDivElement>(null);

  const enabled = pointerFine && reducedMotion === false;

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const label = labelRef.current;
    const shape = shapeRef.current;
    if (!dot || !label || !shape) return;

    document.documentElement.dataset.cursor = "custom";

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let held: HTMLElement | null = null;
    let glued = false;
    let frame = 0;
    /** Where the pointer was when the outline last changed what it holds. */
    let lastOverX = -1;
    let lastOverY = -1;

    /**
     * The hovered element's corner radius. Cached, because reading it needs
     * `getComputedStyle` — which forces a style recalculation — and it does not
     * change while the pointer sits on the same thing.
     */
    let measuredRadius = DOT;

    const measure = () => {
      if (!held?.isConnected) return;
      measuredRadius = radiusOf(held);
    };

    const box: Box = { x: x - DOT / 2, y: y - DOT / 2, w: DOT, h: DOT, r: DOT };

    const asDot = (): Box => ({
      x: x - DOT / 2,
      y: y - DOT / 2,
      w: DOT,
      h: DOT,
      r: DOT,
    });

    /**
     * Where the outline wants to be this frame — read from the element itself,
     * so it follows whatever is moving it: the pin, the rail, the card's own
     * hover lift.
     */
    const wanted = (): Box => {
      if (!held?.isConnected) return asDot();
      const rect = held.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return asDot();
      return {
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
        r: measuredRadius,
      };
    };

    const render = () => {
      const want = wanted();
      // Ease rather than transition: width and height are laid out, and
      // animating them through CSS on every element under the pointer is the
      // one thing guaranteed to make this feel heavy.
      const k = glued ? GLUED : EASE;
      let moved = 0;
      for (const key of ["x", "y", "w", "h", "r"] as const) {
        const delta = want[key] - box[key];
        box[key] += delta * k;
        moved = Math.max(moved, Math.abs(delta));
      }

      if (held && moved < ARRIVED) glued = true;

      shape.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
      shape.style.width = `${box.w}px`;
      shape.style.height = `${box.h}px`;
      shape.style.borderRadius = `${box.r}px`;

      // Settled and nothing held: stop asking for frames.
      if (moved < 0.25 && !held) {
        frame = 0;
        // Snap the last fraction of a pixel so it lands exactly on the dot.
        Object.assign(box, want);
        shape.style.transform = `translate3d(${want.x}px, ${want.y}px, 0)`;
        shape.style.width = `${want.w}px`;
        shape.style.height = `${want.h}px`;
        return;
      }
      frame = window.requestAnimationFrame(render);
    };

    const wake = () => {
      if (frame === 0) frame = window.requestAnimationFrame(render);
    };

    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      wake();
    };

    const onOver = (event: PointerEvent) => {
      const from = event.target as Element | null;
      const labelled = from?.closest<HTMLElement>("[data-cursor-label]");
      const text = labelled?.dataset.cursorLabel;

      let match = from?.closest<HTMLElement>(SHAPES) ?? null;
      if (match?.closest('[data-cursor-shape="off"]')) match = null;
      // Only things drawn as boxes, and only if they are cursor-sized.
      if (match) match = boxOf(match);
      if (match) {
        const rect = match.getBoundingClientRect();
        const share =
          (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
        if (rect.width === 0 || share > TOO_BIG) match = null;
      }

      // A label is its own answer; the outline would only compete with it.
      const next = text ? null : match;

      // Whether the pointer moved onto this, or it arrived underneath a pointer
      // that was sitting still. The rail does the second one constantly: it
      // slides a new card under a stationary cursor every second or so, and
      // easing across to it there is not weight, it is the outline arriving
      // late to something that was already under the pointer. So a morph is
      // eased when the pointer went somewhere, and snapped when the page did.
      const still =
        Math.abs(event.clientX - lastOverX) < 2 &&
        Math.abs(event.clientY - lastOverY) < 2;
      lastOverX = event.clientX;
      lastOverY = event.clientY;

      if (next !== held) glued = still && next !== null;
      held = next;
      measure();
      shape.dataset.on = held ? "1" : "0";

      if (text) {
        label.textContent = text;
        dot.dataset.state = "label";
      } else if (held) {
        dot.dataset.state = "shaped";
      } else if (from?.closest("a, button, [role='button'], summary")) {
        dot.dataset.state = "active";
      } else {
        dot.dataset.state = "idle";
      }
      wake();
    };

    const onLeave = () => {
      held = null;
      glued = false;
      shape.dataset.on = "0";
      dot.dataset.state = "hidden";
      wake();
    };
    const onEnter = () => {
      dot.dataset.state = "idle";
    };

    // The loop already runs for as long as something is held, so a scroll only
    // has to restart it in the case where nothing is. A resize can change the
    // corner radius, which is the one thing still cached.
    const onScroll = () => {
      wake();
    };
    const onResize = () => {
      measure();
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    wake();

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      if (frame) window.cancelAnimationFrame(frame);
      delete document.documentElement.dataset.cursor;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={shapeRef}
        aria-hidden
        data-on="0"
        data-cursor-outline
        className="pointer-events-none fixed top-0 left-0 z-[69] will-change-transform"
      />
      <div
        ref={dotRef}
        aria-hidden
        data-state="idle"
        data-custom-cursor
        className="pointer-events-none fixed top-0 left-0 z-[70] will-change-transform"
      >
        <span
          ref={labelRef}
          className="label-mono border-signal bg-void text-signal block border px-2 py-1 whitespace-nowrap"
        />
      </div>
    </>
  );
}

/**
 * The box to outline for a match, or null if there is not one.
 *
 * A card is usually a link wrapped round the element that carries the border,
 * so the thing that was matched is not the thing that is drawn — check one
 * level in before giving up.
 */
function boxOf(element: HTMLElement): HTMLElement | null {
  if ("cursorShape" in element.dataset) return element;
  if (isDrawnAsBox(element)) return element;
  const child = element.firstElementChild;
  if (child instanceof HTMLElement && isDrawnAsBox(child)) return child;
  return null;
}

/**
 * Whether the element is drawn as a box: it has a border, a fill, or enough
 * padding that its edges are part of the design. Those want their outline on
 * the box. Everything else is text on a black field, and wants the glyphs.
 */
function isDrawnAsBox(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (Number.parseFloat(style.borderTopWidth) > 0) return true;
  if (Number.parseFloat(style.borderLeftWidth) > 0) return true;
  const fill = style.backgroundColor;
  if (fill && fill !== "transparent" && !/,\s*0\s*\)$/.test(fill)) return true;
  return Number.parseFloat(style.paddingLeft) > 6;
}

/** The element's own top-left corner radius, in pixels, or 0. */
function radiusOf(element: HTMLElement): number {
  const value = getComputedStyle(element).borderTopLeftRadius;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(parsed, 24) : 0;
}
