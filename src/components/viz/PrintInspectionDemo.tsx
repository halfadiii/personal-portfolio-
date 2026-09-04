"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { LineHandle } from "@/components/three/PrintLine";
import { useCapability } from "@/components/motion/capability";
import { useRoom } from "@/components/motion/useRoom";
import { useOnScreen } from "@/components/three/useOnScreen";
import {
  FAILURE_LABELS,
  GATE_ORDER,
  STATIONS,
  printInspection,
  type Frame,
} from "@/lib/print-inspection";
import { cn } from "@/lib/utils";

/**
 * EagleEyes, running.
 *
 * The press streams the production run back: 600 camera frames, each one a
 * bunch of twenty-one tickets, each carrying the verdict and the four gate
 * outcomes the real engine produced for it. Nothing here is generated — the
 * frames this machine turns down are the ones the system turned down, for the
 * reasons it recorded, and the print on them is drawn from those reasons.
 *
 * The scene draws; this owns everything else. Counters live in a ref and are
 * published to React on a slow pulse, because a verdict every third of a
 * second is not a reason to re-render a page.
 */
const PrintLine = dynamic(() => import("@/components/three/PrintLine"), {
  ssr: false,
});

const { measured, replay, source } = printInspection;

type Tally = {
  seen: number;
  passed: number;
  rejected: number;
  fails: Record<string, number>;
  log: Frame[];
};

const EMPTY: Tally = { seen: 0, passed: 0, rejected: 0, fails: {}, log: [] };

export function PrintInspectionDemo() {
  const { richMotion, reducedMotion, pointerFine } = useCapability();
  const { ref: viewport, onScreen } = useOnScreen<HTMLDivElement>();
  const room = useRoom();
  const [station, setStation] = useState<string | null>(null);
  const [tally, setTally] = useState<Tally>(EMPTY);
  const [running, setRunning] = useState(true);

  const counts = useRef<Tally>({ ...EMPTY, fails: {}, log: [] });
  const cursor = useRef(0);

  const handleRef = useRef<LineHandle>({
    next: () => replay[0],
    onJudged: () => {},
    interval: 1 / Math.max(1, measured.lineRate),
    running: true,
  });

  handleRef.current.next = useCallback(() => {
    const frame = replay[cursor.current % replay.length];
    cursor.current += 1;
    return frame;
  }, []);

  handleRef.current.onJudged = useCallback((frame: Frame) => {
    const t = counts.current;
    t.seen += 1;
    if (frame.status === "OK") t.passed += 1;
    else {
      t.rejected += 1;
      // Which gate turned it down. The count gate short-circuits the rest, so
      // a count failure is reported on its own the way the engine reports it.
      const failed = GATE_ORDER.filter((_, i) => frame.checks[i] === 0);
      const reasons = failed.some((g) => g.id === "count")
        ? ["count_mismatch"]
        : failed.map((g) => g.failure);
      for (const key of reasons) t.fails[key] = (t.fails[key] ?? 0) + 1;
    }
    t.log = [frame, ...t.log].slice(0, 7);
  }, []);

  handleRef.current.running = running && onScreen;

  // Publish the counters three times a second. Fast enough to feel live,
  // slow enough that the page is not re-rendering per frame.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = counts.current;
      setTally({ ...t, fails: { ...t.fails }, log: [...t.log] });
    }, 320);
    return () => window.clearInterval(id);
  }, []);

  const open = useMemo(
    () => STATIONS.find((s) => s.id === station) ?? null,
    [station],
  );

  const tooHeavy = !richMotion || reducedMotion !== false || !room;
  const latest = tally.log[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="label-mono max-w-[42rem]">
          Streaming the recorded run at a seventh of line speed. Tickets come
          off this press seven across and three deep, so one camera frame is
          twenty-one of them — and every verdict, block count, and failed check
          below is the production engine&rsquo;s own output for that frame.
        </p>
        <button
          type="button"
          aria-pressed={!running}
          onClick={() => setRunning((value) => !value)}
          className="label-mono border-hairline text-signal ease-brief hover:border-signal border px-4 py-2 transition-colors duration-[var(--dur-ui)]"
        >
          {running ? "Hold the line" : "Run the line"}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_21rem]">
        <div className="flex flex-col gap-4">
          <div
            ref={viewport}
            data-cursor-shape="off"
            className={cn(
              "border-hairline relative min-w-0 overflow-hidden border",
              // The ratio is the canvas's, and only the canvas needs it — held
              // on a phone it would reserve a 210px box for two lines of type.
              // A little squarer on a narrow screen, because 16:9 of 349px is
              // 196px and the press has some height to it.
              !tooHeavy && "aspect-[16/10] sm:aspect-video",
            )}
          >
            {tooHeavy ? (
              <p className="label-mono p-6 text-balance">
                The press needs a screen with some room on it and motion you
                have not asked to reduce. Every measured result is below, and
                the stations are listed with it.
              </p>
            ) : (
              <PrintLine
                handleRef={handleRef}
                onStation={setStation}
                active={station}
              />
            )}
          </div>

          {/* The callout. Also the whole explanation of the machine when the
              scene has not mounted, which is why it is not inside it. */}
          <div className="border-hairline min-h-[7.5rem] border p-5">
            {open ? (
              <div className="flex flex-col gap-2">
                <p className="label-mono text-signal">
                  {STATIONS.indexOf(open) + 1} / {open.title} — {open.role}
                </p>
                <p className="text-body text-steel measure">{open.detail}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="label-mono text-signal">
                  {/* There is no machine to hover where it could not be
                      drawn — but the five buttons underneath still work, and
                      they are the whole of it on a phone. */}
                  {tooHeavy
                    ? "Five stations. Pick one."
                    : pointerFine
                      ? "Five stations. Hover the machine, or pick one."
                      : "Five stations. Tap the machine, or pick one."}
                </p>
                <ul className="flex list-none flex-wrap gap-2 p-0">
                  {STATIONS.map((item, i) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setStation(item.id)}
                        className="label-mono border-hairline text-steel ease-brief hover:border-signal hover:text-signal border px-3 py-2 transition-colors duration-[var(--dur-ui)]"
                      >
                        {i + 1} · {item.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* The dashboard. */}
        <aside className="border-hairline flex min-w-0 flex-col gap-5 border p-5">
          <div>
            <p className="label-mono mb-2">This run</p>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="frames" value={tally.seen} />
              <Stat label="passed" value={tally.passed} tone="pass" />
              <Stat label="rejected" value={tally.rejected} tone="fail" />
            </dl>
          </div>

          <div>
            <p className="label-mono mb-2">
              The four gates{latest ? ` · frame ${latest.serial}` : ""}
            </p>
            <ul className="flex list-none flex-col p-0">
              {measured.gates.map((gate, i) => {
                const state = latest ? latest.checks[i] === 1 : null;
                return (
                  <li
                    key={gate.id}
                    className="rule-bottom flex items-baseline gap-3 py-2 last:border-b-0"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 block h-2 w-2 shrink-0",
                        state === null
                          ? "bg-steel"
                          : state
                            ? "bg-[var(--line-green-on-void)]"
                            : "bg-[var(--line-red-on-void)]",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="label-mono text-signal block">
                        {gate.label}
                      </span>
                      <span className="label-mono block">{gate.question}</span>
                    </span>
                    <span className="label-mono text-right" data-numeric>
                      {state === null ? "—" : state ? "pass" : "fail"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="label-mono mb-2">Why they were turned down</p>
            {tally.rejected === 0 ? (
              <p className="label-mono">Nothing rejected yet.</p>
            ) : (
              <ul className="flex list-none flex-col gap-2 p-0">
                {Object.entries(tally.fails)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <li key={reason}>
                      <p className="label-mono flex items-baseline justify-between gap-3">
                        <span>{FAILURE_LABELS[reason] ?? reason}</span>
                        <span className="text-signal" data-numeric>
                          {count}
                        </span>
                      </p>
                      <span
                        aria-hidden
                        className="bg-signal mt-1 block h-px"
                        style={{
                          width: `${(count / Math.max(1, tally.rejected)) * 100}%`,
                        }}
                      />
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div>
            <p className="label-mono mb-2">Last through the camera</p>
            <ol className="flex list-none flex-col p-0">
              {tally.log.map((frame, i) => (
                <li
                  key={`${frame.serial}-${i}`}
                  className="rule-bottom label-mono flex items-baseline justify-between gap-3 py-1.5 last:border-b-0"
                >
                  <span data-numeric>{frame.serial}</span>
                  <span data-numeric>{frame.big} blocks</span>
                  <span
                    className={
                      frame.status === "OK"
                        ? "text-[var(--line-green-on-void)]"
                        : "text-[var(--line-red-on-void)]"
                    }
                  >
                    {frame.status}
                  </span>
                </li>
              ))}
              {tally.log.length === 0 ? (
                <li className="label-mono py-1.5">
                  Waiting for the first one.
                </li>
              ) : null}
            </ol>
          </div>
        </aside>
      </div>

      <p className="label-mono">
        {source.system} for {source.client}, {source.line}. {source.note} Model:{" "}
        {/* A weights path has no spaces in it and is wider than a phone. */}
        <span className="text-signal break-all">{source.model}</span>.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "pass" | "fail";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-mono">{label}</dt>
      <dd
        className={cn(
          "font-display text-sub leading-none",
          tone === "pass" && "text-[var(--line-green-on-void)]",
          tone === "fail" && "text-[var(--line-red-on-void)]",
        )}
        data-numeric
      >
        {value}
      </dd>
    </div>
  );
}
