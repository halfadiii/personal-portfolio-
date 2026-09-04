"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { FeedNode, StageNode } from "@/content/pipeline";
import {
  FIELD,
  feedBox,
  feedEdges,
  pct,
  stageBoxes,
  stageEdges,
} from "./pipeline-geometry";

export type HighlightedStage = StageNode & { codeHtml?: string };

/** Radix Dialog arrives with the first stage click, not with the page. */
const StagePanel = dynamic(() => import("./StagePanel"), { ssr: false });

export function PipelineDiagram({
  feeds,
  stages,
}: {
  feeds: FeedNode[];
  stages: HighlightedStage[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelLoaded, setPanelLoaded] = useState(false);
  const active = stages.find((stage) => stage.id === openId) ?? null;

  useEffect(() => {
    if (openId) setPanelLoaded(true);
  }, [openId]);

  return (
    <>
      <div
        // §7 — below 1024px the diagram scrolls inside its own container.
        className="relative w-full overflow-x-auto overscroll-x-contain"
        tabIndex={0}
        role="group"
        aria-label="NYC subway reliability pipeline diagram. Scrollable."
      >
        <div
          className="relative min-w-[62rem]"
          style={{ aspectRatio: `${FIELD.w} / ${FIELD.h}` }}
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${FIELD.w} ${FIELD.h}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            {feedEdges.map((d, i) => (
              <path
                key={`feed-${i}`}
                d={d}
                fill="none"
                stroke="var(--hairline)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {stageEdges.map((d, i) => (
              <path
                key={`stage-${i}`}
                d={d}
                fill="none"
                stroke="var(--steel)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <ul className="list-none">
            {feeds.map((feed, i) => (
              <li
                key={feed.id}
                className="border-hairline bg-panel absolute flex flex-col justify-center border px-3"
                style={pct(feedBox(i))}
              >
                <span className="label-mono text-signal truncate">
                  {feed.label}
                </span>
                <span className="label-mono truncate">
                  {feed.lines.join(" ")}
                </span>
              </li>
            ))}
          </ul>

          {stages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              onClick={() => setOpenId(stage.id)}
              aria-haspopup="dialog"
              className="border-steel bg-panel ease-brief hover:border-signal hover:bg-void absolute flex flex-col justify-center gap-1 border px-4 text-left transition-colors duration-[var(--dur-ui)]"
              style={pct(stageBoxes[stage.id])}
            >
              <span className="label-mono text-signal">
                {stage.index} / {stage.title.toLowerCase()}
              </span>
              <span className="text-small text-steel leading-tight">
                {stage.kicker}
              </span>
            </button>
          ))}
        </div>
      </div>

      {panelLoaded ? (
        <StagePanel stage={active} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
