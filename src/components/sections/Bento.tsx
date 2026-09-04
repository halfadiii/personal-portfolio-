"use client";

import { useEffect, useRef } from "react";
import { useCapability } from "@/components/motion/capability";

/**
 * The grid, with the cards aware of each other.
 *
 * Pointing at one lifts it and pushes its neighbours away, hardest for the
 * card next door and less for every card beyond it. The point is that the grid
 * reads as a set of objects sharing a space rather than as five independent
 * hover states: nothing on a real desk moves without the things beside it
 * noticing.
 *
 * Only transforms, and only on enter and leave — no work per frame, and the
 * easing is a CSS transition, so the whole effect runs on the compositor. The
 * geometry is measured once against the grid's own box, so it survives being
 * scrolled past and only a resize invalidates it.
 */

/** How far the nearest neighbour is pushed, in pixels. */
const NUDGE = 10;
/** Distance over which that push halves. Roughly one card. */
const FALLOFF = 420;
/** What the card under the pointer does. */
const LIFT = 6;
const GROW = 1.015;

export function Bento({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const { pointerFine, reducedMotion } = useCapability();
  const enabled = pointerFine && reducedMotion === false;

  useEffect(() => {
    const node = grid.current;
    if (!node || !enabled) return;

    const cards = Array.from(node.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );

    /** Card centres, relative to the grid — so scrolling cannot stale them. */
    let centres: { x: number; y: number }[] = [];
    const measure = () => {
      const box = node.getBoundingClientRect();
      centres = cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          x: rect.left - box.left + rect.width / 2,
          y: rect.top - box.top + rect.height / 2,
        };
      });
    };

    const settle = () => {
      for (const card of cards) {
        card.style.transform = "";
        card.style.zIndex = "";
      }
    };

    const arrange = (index: number) => {
      if (centres.length !== cards.length) measure();
      const from = centres[index];
      cards.forEach((card, i) => {
        if (i === index) {
          card.style.transform = `translate3d(0, ${-LIFT}px, 0) scale(${GROW})`;
          // Above its neighbours while it is the one being looked at.
          card.style.zIndex = "1";
          return;
        }
        const dx = centres[i].x - from.x;
        const dy = centres[i].y - from.y;
        const distance = Math.hypot(dx, dy) || 1;
        const push = NUDGE / (1 + distance / FALLOFF);
        card.style.transform = `translate3d(${((dx / distance) * push).toFixed(2)}px, ${((dy / distance) * push).toFixed(2)}px, 0)`;
        card.style.zIndex = "";
      });
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      const index = cards.findIndex((card) => card.contains(target));
      if (index >= 0) arrange(index);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener("pointerover", onOver);
    node.addEventListener("pointerleave", settle);

    return () => {
      observer.disconnect();
      node.removeEventListener("pointerover", onOver);
      node.removeEventListener("pointerleave", settle);
      settle();
    };
  }, [enabled]);

  return (
    <div ref={grid} data-bento={enabled ? "" : undefined} className={className}>
      {children}
    </div>
  );
}
