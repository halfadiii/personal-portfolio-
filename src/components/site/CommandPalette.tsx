"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useHotkeys } from "react-hotkeys-hook";
import { onIdle } from "@/components/motion/idle";
import { useUi } from "@/stores/ui";

const CommandPaletteImpl = dynamic(() => import("./CommandPaletteImpl"), {
  ssr: false,
});

/**
 * The ⌘K listener, and nothing else, until the palette is actually wanted.
 *
 * cmdk and Fuse.js are a fifth of the page's JavaScript, so keeping them behind
 * the first open is what holds the home page inside the §8 budget. But a
 * shortcut that waits on a network round trip is a shortcut that feels broken,
 * so the chunk is warmed once the page goes idle: it is still absent from the
 * initial bundle, and by the time anyone presses ⌘K it is already in memory.
 */
export function CommandPalette() {
  const open = useUi((state) => state.paletteOpen);
  const setOpen = useUi((state) => state.setPaletteOpen);
  const [loaded, setLoaded] = useState(false);

  useHotkeys(
    "mod+k",
    (event) => {
      event.preventDefault();
      setOpen(!open);
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [open, setOpen],
  );

  useEffect(() => {
    if (open) {
      setLoaded(true);
      return;
    }
    return onIdle(() => void import("./CommandPaletteImpl"));
  }, [open]);

  if (!loaded) return null;
  return <CommandPaletteImpl />;
}
