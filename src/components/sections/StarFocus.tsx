"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useCapability } from "@/components/motion/capability";
import { cn } from "@/lib/utils";

/**
 * What happens when you click the star.
 *
 * Everything else goes. Not dimmed — gone: this sits over the whole document
 * at full opacity, so the orbit, the name, the panel, and the galaxy behind
 * the page are all behind a black screen, and the only thing on it is the star.
 *
 * The blackout is a plain element rather than anything clever in the scene
 * because "everything else" is not all in one place. The planets are in the
 * hero canvas, the galaxy is a separate canvas behind the entire document, and
 * the name and the record are HTML. Dimming each of those to nothing would be
 * a uniform threaded through three unrelated trees; covering the lot is one
 * element and cannot get out of step with itself.
 *
 * The order is deliberate. The screen goes black first and the star arrives
 * into it, which is the same reason a theatre goes dark before the curtain:
 * the dark is what makes the next thing the only thing.
 *
 * ## Why it is a portal
 *
 * The hero section is marked `isolate`, which gives it a stacking context of
 * its own — so a z-index set in here is only ever compared against its
 * siblings inside that section, and the sticky header two levels up wins
 * whatever number this asks for. Raising the number does not help; there is no
 * number that reaches. Rendered into the body it is a sibling of the header
 * instead, and z-index means what it looks like it means.
 */

const StarScene = dynamic(() => import("@/components/three/StarScene"), {
  ssr: false,
});

/** Pull the chunk down without rendering it, so the click has nothing to wait for. */
export function warmStar() {
  void import("@/components/three/StarScene");
}

/** How long the screen takes to go black. The star is mounted after this. */
const BLACKOUT_MS = 520;

/** The line, and the reason this is worth clicking at all. */
const ORIGIN =
  "It is derived from the Sanskrit word “āditya,” which means “sun” or “sun god.”";

export function StarFocus({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pointerFine } = useCapability();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Three stages, because neither the black nor the star is ready on the frame
  // this mounts. The black has to start transparent and be raised on the next
  // frame or the browser has no first value to animate from; the writing waits
  // for the star, which has a surface to generate before it has anything to
  // show.
  const [dark, setDark] = useState(false);
  const [mountStar, setMountStar] = useState(false);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    if (!open) {
      setDark(false);
      setMountStar(false);
      setLit(false);
      return;
    }
    const raise = requestAnimationFrame(() => setDark(true));

    /*
     * The star waits for the black.
     *
     * Generating the surface is half a second of solid work on the main
     * thread — six faces of a cube map, and nothing else can run while it
     * happens. Mounted with the overlay, that half second lands *before* the
     * blackout has painted a single frame, so a click produced a frozen orbit
     * and then a jump. Started once the screen is already black it costs
     * nothing anyone can see: there is nothing on screen to stutter.
     */
    const hold = window.setTimeout(() => setMountStar(true), BLACKOUT_MS + 40);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      cancelAnimationFrame(raise);
      window.clearTimeout(hold);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The star at the centre of the system"
      // Above the header, the record, and the reading progress bar.
      className="fixed inset-0 z-[70]"
    >
      {/* The blackout. Its own element under the canvas rather than a
          background on the parent, so it can fade on its own schedule. */}
      <div
        className={cn(
          "ease-brief absolute inset-0 bg-black transition-opacity duration-[520ms]",
          dark ? "opacity-100" : "opacity-0",
        )}
        // Anywhere that is not the star is a way out.
        onClick={onClose}
      />

      <div className="pointer-events-none absolute inset-0">
        {mountStar ? (
          <StarScene drift={!pointerFine} onReady={() => setLit(true)} />
        ) : null}
      </div>

      {/*
        The line, in the middle of the disc.

        Dark on the brightest part of the star, which is the centre — limb
        darkening means the middle is where the contrast is best and the edge is
        where it would be worst. The warm halo is not decoration: the surface
        underneath is fibrils at a few pixels a strand, and small type laid
        straight onto that loses its counters. The halo gives every letter a
        quiet patch to sit in.
      */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center px-8",
          "ease-brief transition-opacity duration-[700ms]",
          lit ? "opacity-100" : "opacity-0",
        )}
      >
        <p
          className="text-small max-w-[15rem] text-center text-balance sm:max-w-[24rem]"
          style={{
            color: "#2a0a00",
            textShadow:
              "0 0 14px rgba(255, 226, 176, 0.95), 0 0 34px rgba(255, 196, 122, 0.7)",
          }}
        >
          {ORIGIN}
        </p>
      </div>

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          "ease-brief transition-opacity duration-[700ms]",
          lit ? "opacity-100" : "opacity-0",
        )}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="tap label-mono border-hairline text-steel ease-brief hover:border-steel hover:text-signal border px-4 py-2.5 transition-colors duration-[var(--dur-ui)]"
        >
          Back to the system
        </button>
      </div>
    </div>,
    document.body,
  );
}
