"use client";

import { useEffect, useState } from "react";
import { profile } from "@/content";
import { hourReads } from "@/content/offclock";
import { cn } from "@/lib/utils";

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hour12: false,
});

/**
 * The time where he is, and what that hour probably means.
 *
 * Rendered empty on the server and filled after mount, the same way the footer
 * clock is: the server's clock is not the visitor's and a mismatch here is a
 * hydration error. The box reserves its own height so nothing moves when the
 * time arrives (§2.4).
 *
 * The status line is worked out from the hour rather than written down, so
 * there is no string in the repository that can be true at noon and a lie at
 * four in the morning.
 */
export function LiveClockCard({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // A minute, not a second: this shows minutes, and a per-second timer is a
    // wake-up a minute's worth of them does not earn.
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);

  const parts = now ? TIME.formatToParts(now) : null;
  const clock = parts
    ? parts
        .filter((part) => part.type !== "dayPeriod" && part.type !== "literal")
        .map((part) => part.value)
        .join(":")
    : null;
  const meridiem =
    parts?.find((part) => part.type === "dayPeriod")?.value ?? null;
  const hour = now ? Number(HOUR.format(now)) % 24 : null;

  return (
    <article
      className={cn(
        "border-hairline flex flex-col justify-between gap-4 border p-5",
        className,
      )}
    >
      <p className="label-mono">local time</p>

      <p className="flex items-baseline gap-2" data-numeric>
        <span className="font-display text-section text-signal leading-none">
          {/* A non-breaking figure space while the real time is on its way, so
              the line has its height before it has its content. */}
          {clock ?? "  :  "}
        </span>
        <span className="label-mono text-signal">{meridiem ?? ""}</span>
        <span className="sr-only">
          {clock ? `Current local time for ${profile.location}` : ""}
        </span>
      </p>

      <p className="label-mono flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>{profile.location}</span>
        <span className="text-signal">
          {hour === null ? "" : hourReads(hour)}
        </span>
      </p>
    </article>
  );
}
