"use client";

import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Live Eastern-time clock. Renders the label only until hydration so the
 * server and client markup agree and nothing shifts when the time arrives.
 */
export function Clock({ className }: { className?: string }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setTime(formatter.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className={className} data-numeric>
      <span className="sr-only">Current local time in New York: </span>
      <span aria-hidden={time === null}>{time ?? "--:--:--"}</span>
      <span className="text-steel ml-2">ET</span>
    </span>
  );
}
