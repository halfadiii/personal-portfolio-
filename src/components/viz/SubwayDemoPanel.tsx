"use client";

import dynamic from "next/dynamic";

/**
 * The simulation and its 3D view are the whole weight of this route, so both
 * arrive after the page does, behind a skeleton of the right height.
 */
const SubwayDemo = dynamic(
  () => import("./SubwayDemo").then((mod) => mod.SubwayDemo),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-8">
        <div className="border-hairline h-[3rem] border" />
        <div
          className="border-hairline grid place-items-center border"
          style={{ aspectRatio: "16 / 8" }}
        >
          <p className="label-mono">Starting the line…</p>
        </div>
      </div>
    ),
  },
);

export function SubwayDemoPanel() {
  return <SubwayDemo />;
}
