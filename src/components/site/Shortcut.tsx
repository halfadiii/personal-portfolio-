"use client";

import { useEffect, useState } from "react";

/**
 * The palette shortcut, named for the keyboard the visitor is actually on.
 * `⌘` on a Mac is meaningless on Windows and Linux, and none of the three
 * self-hosted faces carries the glyph, so it would fall back mid-line as well.
 *
 * Renders the Ctrl form on the server and corrects after mount — the wrong
 * label for one frame beats a blank one.
 */
export function Shortcut({ letter = "K" }: { letter?: string }) {
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  return (
    <kbd className="text-signal font-mono">
      {mac ? "Cmd" : "Ctrl"} {letter}
    </kbd>
  );
}
