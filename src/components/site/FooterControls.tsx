"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useUi } from "@/stores/ui";
import { Shortcut } from "./Shortcut";
import { playTick } from "./sound";

const buttonClass =
  "tap label-mono inline-flex transition-colors duration-[var(--dur-ui)] ease-brief hover:text-signal";

/** §6.10 — sound toggle, theme toggle, and the ⌘K affordance. */
export function FooterControls() {
  const soundOn = useUi((state) => state.soundOn);
  const toggleSound = useUi((state) => state.toggleSound);
  const setPaletteOpen = useUi((state) => state.setPaletteOpen);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Sound and theme are read from storage, so the first paint must not claim a
  // state it cannot know yet.
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <button
        type="button"
        onClick={() => {
          if (!soundOn) void playTick("confirm");
          toggleSound();
        }}
        aria-pressed={mounted ? soundOn : undefined}
        className={buttonClass}
      >
        Sound {mounted ? (soundOn ? "on" : "off") : "—"}
      </button>

      <button
        type="button"
        onClick={() => {
          void playTick();
          setTheme(theme === "print" ? "dark" : "print");
        }}
        className={buttonClass}
      >
        {mounted && theme === "print" ? "Dark surface" : "Print surface"}
      </button>

      <button
        type="button"
        onClick={() => {
          void playTick();
          setPaletteOpen(true);
        }}
        className={buttonClass}
      >
        <Shortcut /> for anything
      </button>
    </div>
  );
}
