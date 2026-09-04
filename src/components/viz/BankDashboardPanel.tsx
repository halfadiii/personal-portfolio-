"use client";

import dynamic from "next/dynamic";

/**
 * Recharts and the 860 KB dataset are the whole weight of this route, so both
 * arrive after the page does, behind a skeleton of the right height.
 */
const BankDashboard = dynamic(
  () => import("./BankDashboard").then((mod) => mod.BankDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-6">
        <div className="border-hairline h-[9rem] border" />
        <div className="border-hairline grid h-[26rem] place-items-center border">
          <p className="label-mono">Loading the dashboard…</p>
        </div>
      </div>
    ),
  },
);

export function BankDashboardPanel() {
  return <BankDashboard />;
}
