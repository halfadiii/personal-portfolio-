"use client";

import { useEffect, useRef, useState } from "react";
import { useCapability } from "@/components/motion/capability";
import { Bento } from "./Bento";

/**
 * The off-the-clock cards as a deck, on a phone.
 *
 * On a narrow screen the grid collapses to one column and becomes six
 * full-width cards in a row — about two and a half screens of scrolling
 * through pictures, which is the least interesting thing this section could
 * be. So on a phone they arrive as a pile instead: squared up on top of each
 * other with a strip of each showing below the one in front, and they slide
 * apart into the list as you scroll into the section.
 *
 * Nothing about the layout changes. The cards stay exactly where the grid puts
 * them and are moved with a transform, so the page is the same height at every
 * point in the animation and the scroll position never has the ground shift
 * under it. Turn the JavaScript off, or ask for reduced motion, and what is
 * left is the plain column — which is the version that has to be right first.
 *
 * ## The pile is anchored by its bottom edge
 *
 * The obvious construction — align the tops, offset each one down — falls
 * apart on cards of different heights, because a tall card behind a short one
 * in front sticks out over the top of it and the pile stops reading as a pile.
 * Aligning the *bottoms* and fanning those down by a fixed step gives exactly
 * that step of every card no matter what it contains, and nothing can escape
 * upward as long as the card in front is the tallest one. That is the entire
 * reason the poster is ordered first on a phone.
 */

/**
 * How much of each card shows below the one in front of it, in pixels.
 *
 * Under twenty on purpose. Every card in this section ends in twenty pixels of
 * padding below its last line of type, so a strip shorter than that is the
 * card's own quiet edge — and a strip taller than that starts slicing captions
 * in half, which reads as content spilling rather than as a stack of cards.
 *
 * Eleven rather than fourteen because `leading-none` lets a descender hang
 * below its own line box: at fourteen the tail of the g in "Rocket League" was
 * still in the strip. The type sets this number, not the design.
 */
const PEEK = 11;

/*
 * How near the top of the screen the pile gets before it opens, as a fraction
 * of the viewport.
 *
 * It used to start the moment the whole pile was on screen, which put it about
 * two fifths of the way down — so it was already coming apart while you were
 * still arriving at it, and you never got to look at the pile. Holding it until
 * the front card is nearly at the top gives it a beat of its own: a stack of
 * cards over the moon, and then it opens as you pull past it.
 */
const OPEN_AT = 0.13;

/** How much of a screen of scrolling it takes to come apart. */
const RUN = 0.5;

/** Never open over less than this much scrolling, however short the screen. */
const LEAST = 300;

/** How far apart the cards start moving, as a fraction of the whole. */
const STAGGER = 0.07;

/** Below this the deck runs; above it the grid is a grid. Tailwind's `lg`. */
const NARROW = "(max-width: 1023px)";

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Fast at first and slow into place, so they settle rather than arrive. */
const ease = (x: number) => 1 - Math.pow(1 - x, 3);

export function CardDeck({
  className,
  gridClassName,
  children,
}: {
  className?: string;
  gridClassName?: string;
  children: React.ReactNode;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useCapability();
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const decide = () => setNarrow(query.matches);
    decide();
    query.addEventListener("change", decide);
    return () => query.removeEventListener("change", decide);
  }, []);

  const active = narrow && reducedMotion === false;

  useEffect(() => {
    const node = grid.current;
    if (!node || !active) return;

    const cards = Array.from(node.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    if (cards.length < 2) return;

    /**
     * How far each card has to travel to join the pile, and where it sits in it.
     *
     * Taken from `offsetTop` rather than from a bounding rect, because a rect
     * already has this effect's own transform in it and would feed the result
     * back into the next measurement. Layout position is the fixed thing here;
     * everything else is drawn relative to it.
     */
    let travel: number[] = [];
    let depth: number[] = [];
    /** Height of the pile itself: the front card, plus a strip for each behind. */
    let stacked = 0;

    const measure = () => {
      const tops = cards.map((card) => card.offsetTop);
      const bottoms = cards.map((card, i) => tops[i] + card.offsetHeight);

      // Visual order, which is not source order: the poster is pulled to the
      // front with `order`, and one column means top-to-bottom settles it.
      const order = cards
        .map((_, i) => i)
        .sort((a, b) => tops[a] - tops[b]);

      const front = order[0];
      const anchor = bottoms[front];

      travel = new Array(cards.length).fill(0);
      depth = new Array(cards.length).fill(0);
      order.forEach((card, place) => {
        depth[card] = place;
        travel[card] = anchor + place * PEEK - bottoms[card];
      });

      stacked = cards[front].offsetHeight + (cards.length - 1) * PEEK;
    };

    // Once anything in here has been focused the deck stays open. A card that
    // is behind another one is a poor place to put the focus ring, and
    // scrolling is not the only way to arrive at one of these.
    let opened = false;

    const draw = () => {
      const box = node.getBoundingClientRect();
      const view = window.innerHeight || 1;

      /*
       * It holds its shape until the front card is nearly at the top.
       *
       * `box.top` is the front card's own top edge — the poster is ordered
       * first, so the grid's box starts where it does. Nothing moves while that
       * is still on its way up the screen; the pile only opens once it has
       * arrived, and it is fully apart half a screen later.
       *
       * The pile's height is still worth knowing: on a screen too short to
       * hold it, opening at a fixed fraction from the top would start with most
       * of it already gone past. So the trigger is whichever is later of the
       * fraction and the point where the pile actually fits.
       */
      const room = Math.min(view * OPEN_AT, Math.max(0, view - stacked - 24));
      const run = Math.max(view * RUN, LEAST);
      const whole = opened ? 1 : clamp((room - box.top) / run);
      const window_ = 1 - (cards.length - 1) * STAGGER;

      cards.forEach((card, i) => {
        const place = depth[i];
        const part = ease(clamp((whole - place * STAGGER) / window_));
        const held = 1 - part;
        const y = travel[i] * held;
        // A little smaller the deeper it sits, which is what makes it read as
        // a stack of things rather than as cards that happen to overlap.
        const shrink = 1 - held * place * 0.022;
        /*
         * Scaled about its own bottom edge, not its middle.
         *
         * Scaling from the centre pulls the bottom edge up by half of what it
         * takes off the height — which is a different amount for every card,
         * because they are different heights. The strips came out uneven and
         * the deepest ones nearly vanished. Pinning the origin to the bottom
         * makes the fan exactly one step per card and turns the shrink into a
         * taper across the width, which is what says "behind".
         */
        card.style.transformOrigin = "50% 100%";
        card.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${shrink.toFixed(4)})`;
        card.style.zIndex = String(cards.length - place);
      });
    };

    const clear = () => {
      for (const card of cards) {
        card.style.transform = "";
        card.style.zIndex = "";
        card.style.transformOrigin = "";
      }
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };

    const onFocus = () => {
      if (opened) return;
      opened = true;
      draw();
    };

    // Marks the grid for the styling that only makes sense while it is a pile.
    node.dataset.deck = "";

    measure();
    draw();

    // Card heights are set by aspect ratios and by their own type, so they
    // change on rotate and on a font swap rather than only on resize.
    const observer = new ResizeObserver(() => {
      measure();
      draw();
    });
    observer.observe(node);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    node.addEventListener("focusin", onFocus);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      delete node.dataset.deck;
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      node.removeEventListener("focusin", onFocus);
      clear();
    };
  }, [active]);

  return (
    <div className={className}>
      <Bento gridRef={grid} interactive={!active} className={gridClassName}>
        {children}
      </Bento>
    </div>
  );
}
