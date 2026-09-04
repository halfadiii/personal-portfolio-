"use client";

import dynamic from "next/dynamic";

/** The map and its 46 KB of network data arrive after the page does. */
const SubwayNetwork = dynamic(
  () => import("./SubwayNetwork").then((mod) => mod.SubwayNetwork),
  {
    ssr: false,
    loading: () => (
      <div
        className="border-hairline grid place-items-center border"
        style={{ aspectRatio: "16 / 9" }}
      >
        <p className="label-mono">Loading the network…</p>
      </div>
    ),
  },
);

export function SubwayNetworkPanel() {
  return <SubwayNetwork />;
}
