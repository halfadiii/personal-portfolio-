"use client";

import dynamic from "next/dynamic";
import type { WaitSnapshot } from "@/lib/snapshot";

/**
 * Recharts is the heaviest thing on the home page, so it loads only here, only
 * on the client, behind a skeleton of the chart's exact height — no layout
 * shift while it arrives (§2.4, §8).
 */
const RegressionPlot = dynamic(
  () => import("./RegressionPlot").then((mod) => mod.RegressionPlot),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-6">
        <div className="border-hairline h-[3.25rem] border" />
        <div
          className="border-hairline flex items-end justify-center border"
          style={{ height: 420 }}
        >
          <p className="label-mono p-4">Loading the chart…</p>
        </div>
      </div>
    ),
  },
);

export function RegressionPanel({ snapshot }: { snapshot: WaitSnapshot }) {
  return <RegressionPlot snapshot={snapshot} />;
}
