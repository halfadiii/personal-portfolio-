"use client";

import { useUi } from "@/stores/ui";

/**
 * Howler, loaded on first use and only when the visitor has switched sound on.
 * Off by default, never ambient, never autoplay (§6).
 */
type HowlLike = { play: () => void };

let cache: Record<string, HowlLike> | null = null;
let loading: Promise<void> | null = null;

async function ensure() {
  if (cache || loading) return loading ?? Promise.resolve();
  loading = import("howler").then(({ Howl }) => {
    cache = {
      tick: new Howl({ src: ["/sound/tick.wav"], volume: 0.35, preload: true }),
      confirm: new Howl({
        src: ["/sound/confirm.wav"],
        volume: 0.4,
        preload: true,
      }),
    };
  });
  return loading;
}

export async function playTick(name: "tick" | "confirm" = "tick") {
  if (!useUi.getState().soundOn) return;
  await ensure();
  cache?.[name]?.play();
}

/** Convenience for components that just want a click to make a sound. */
export function useTick() {
  return playTick;
}
