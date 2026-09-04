"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Whether an element is anywhere near the viewport.
 *
 * Used to stop a canvas rendering once it has been scrolled past. A WebGL
 * scene keeps drawing at full cost whether or not anyone can see it, and the
 * hero here is fill-bound — leaving it running while the visitor reads the
 * work rail was most of the lag further down the page.
 *
 * The margin keeps it awake a little before it arrives, so nothing has to
 * catch up on the frame it comes back into view.
 */
export function useOnScreen<T extends HTMLElement>(margin = "220px") {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);

  return { ref, onScreen };
}
