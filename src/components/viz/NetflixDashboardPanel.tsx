"use client";

import dynamic from "next/dynamic";

/**
 * Recharts is most of this route's weight, so the dashboard arrives after the
 * page does, behind a placeholder of about the right height.
 */
const NetflixDashboard = dynamic(
  () => import("./NetflixDashboard").then((mod) => mod.NetflixDashboard),
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

export function NetflixDashboardPanel() {
  return <NetflixDashboard />;
}
