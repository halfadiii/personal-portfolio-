"use client";

/**
 * Defers work until the browser is not busy.
 *
 * Everything scroll-linked on this site is enhancement: it can start a beat
 * after the page is interactive without anyone noticing, and starting it during
 * hydration is what pushes blocking time up (§8).
 */
export function onIdle(run: () => void, timeout = 2000): () => void {
  if (typeof window === "undefined") return () => {};

  const ric = window.requestIdleCallback;
  if (typeof ric === "function") {
    const handle = ric(run, { timeout });
    return () => window.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(run, 200);
  return () => window.clearTimeout(handle);
}
