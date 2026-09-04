"use client";

import { useEffect } from "react";
import { useCapability } from "@/components/motion/capability";

/**
 * A light behind the heading, following the pointer across it.
 *
 * The effect is a second copy of the heading with no fill at all — `color:
 * transparent` — and nothing but a stack of glows for a text shadow. With
 * nothing to fill the glyphs, that shadow is the letterforms blurred, showing
 * both around the edges and through the middle. Laid over the real heading in
 * `plus-lighter` it only ever adds light: the type warms where the cursor is
 * and the spill carries past its edges, which is what a source sitting behind
 * it would do.
 *
 * A radial mask centred on the pointer keeps only the part near the cursor.
 * The layer is padded far past the text on every side, because a mask is
 * clipped to its element's box — without the padding the gradient runs into
 * the edge of the heading's box and the glow ends in a straight line, which
 * reads as a rectangle drawn round the text.
 *
 * The copy is built at runtime rather than written into the markup, so the
 * page never ships the name twice for a search engine to read, and a visitor
 * who gets no pointer never has the element at all.
 *
 * It goes *inside* the heading, which is the whole trick. A copy parked beside
 * the heading is a copy of one moment: the preloader animates the name's width
 * axis from `"wdth" 62` out to 125 as it hands the page over, and the motion
 * layer leans the heading about with a transform. Neither of those reaches a
 * detached sibling, so the glow keeps the letterforms it was born with — 333px
 * narrower than the finished name — and sits as a ghost beside type that has
 * widened out from under it. As a child it inherits the width axis and rides
 * the transform for free, and cannot come apart from the name at all.
 *
 * The heading is `pointer-events: none` — the orbit underneath has to stay
 * draggable through it — so hover is worked out by hit-testing the cached box
 * rather than by listening on the element.
 */

export function NameGlow() {
  const { pointerFine, reducedMotion } = useCapability();

  useEffect(() => {
    if (!pointerFine || reducedMotion !== false) return;

    const name = document.querySelector<HTMLElement>("[data-hero-name]");
    if (!name) return;

    const glow = document.createElement("div");
    glow.setAttribute("aria-hidden", "true");
    glow.dataset.nameGlow = "";
    glow.innerHTML = name.innerHTML;
    // Ids would be duplicated, and an inline style would be a frozen frame of
    // whatever was animating when the copy was taken. Everything this layer
    // needs it inherits from the heading it now sits in.
    for (const node of glow.querySelectorAll("[id]"))
      node.removeAttribute("id");
    for (const node of glow.querySelectorAll("[style]"))
      node.removeAttribute("style");

    // The layer is positioned against the heading, so the heading has to be
    // the containing block. It is a static block element otherwise, and this
    // adds no stacking context of its own.
    const hadPosition = name.style.position;
    name.style.position = "relative";
    // Last, so it paints over the type and adds light to the letters
    // themselves rather than only to the sky around them.
    name.append(glow);

    // The stylesheet owns how far the layer overhangs the text; read it back
    // rather than keeping a second copy of the number here, because the mask
    // is measured from the padded box and the two must agree exactly.
    const pad = Number.parseFloat(getComputedStyle(glow).paddingTop) || 0;

    let box = new DOMRect();
    const place = () => {
      // Only the hit-test box. The layer sizes itself off the heading now.
      const rect = name.getBoundingClientRect();
      box = new DOMRect(
        rect.left + window.scrollX,
        rect.top + window.scrollY,
        rect.width,
        rect.height,
      );
    };

    place();
    void document.fonts?.ready.then(place);
    const observer = new ResizeObserver(place);
    observer.observe(name);

    let frame = 0;
    let px = 0;
    let py = 0;
    let lit = false;

    const draw = () => {
      frame = 0;
      glow.style.setProperty("--gx", `${px.toFixed(1)}px`);
      glow.style.setProperty("--gy", `${py.toFixed(1)}px`);
      glow.style.setProperty("--glow", lit ? "1" : "0");
    };

    const onMove = (event: PointerEvent) => {
      const x = event.clientX + window.scrollX;
      const y = event.clientY + window.scrollY;
      // A little slack around the box, so the light arrives before the pointer
      // has quite reached the type and does not snap off at the edge.
      const inside =
        x >= box.left - 40 &&
        x <= box.right + 40 &&
        y >= box.top - 24 &&
        y <= box.bottom + 24;

      if (!inside && !lit) return;
      lit = inside;
      // The mask is measured from the padded box, not the text.
      px = x - box.left + pad;
      py = y - box.top + pad;
      // One write per frame, whatever the pointer is doing: the mask is
      // rasterised on change and this layer is the width of the viewport.
      if (frame === 0) frame = window.requestAnimationFrame(draw);
    };

    const onLeave = () => {
      lit = false;
      if (frame === 0) frame = window.requestAnimationFrame(draw);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      glow.remove();
      name.style.position = hadPosition;
    };
  }, [pointerFine, reducedMotion]);

  return null;
}
