"use client";

import { useEffect, useState } from "react";

/**
 * Whether there is physically room for a scene.
 *
 * The demos used to ask for 900px, which is a desktop and nothing else. That
 * was never a statement about what the hardware could do — the hero orbit runs
 * on a phone at frame rate — it was a guess about legibility that turned into
 * a wall. What actually stops a scene being worth drawing is a box too small
 * to see anything in: a watch, or a phone held sideways with 300px of height
 * left after the browser chrome. So that is what this asks.
 *
 * The same query the hero and the trail already use, in one place now.
 */
const ROOM = "(min-width: 360px) and (min-height: 480px)";

export function useRoom() {
  // False until measured, so the server and the first client paint agree.
  const [room, setRoom] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(ROOM);
    const decide = () => setRoom(query.matches);
    decide();
    query.addEventListener("change", decide);
    return () => query.removeEventListener("change", decide);
  }, []);

  return room;
}
