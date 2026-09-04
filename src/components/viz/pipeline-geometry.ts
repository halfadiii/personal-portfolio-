/**
 * One source of geometry for the pipeline diagram: the SVG draws the edges from
 * it, and the HTML nodes are positioned from it as percentages of the same
 * field. Nodes stay real buttons that way — real focus rings, real text.
 */
export const FIELD = { w: 1240, h: 560 } as const;

export type Box = { x: number; y: number; w: number; h: number };

export const FEED_BOX = { x: 10, w: 150, h: 50, gap: 16, top: 24 } as const;

export function feedBox(index: number): Box {
  return {
    x: FEED_BOX.x,
    y: FEED_BOX.top + index * (FEED_BOX.h + FEED_BOX.gap),
    w: FEED_BOX.w,
    h: FEED_BOX.h,
  };
}

export const stageBoxes: Record<string, Box> = {
  ingest: { x: 230, y: 230, w: 160, h: 110 },
  landing: { x: 440, y: 230, w: 170, h: 110 },
  arrival: { x: 660, y: 230, w: 170, h: 110 },
  models: { x: 880, y: 110, w: 170, h: 110 },
  weather: { x: 880, y: 350, w: 170, h: 110 },
  serving: { x: 1070, y: 230, w: 160, h: 110 },
};

const right = (b: Box) => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const left = (b: Box) => ({ x: b.x, y: b.y + b.h / 2 });
const bottom = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h });
const top = (b: Box) => ({ x: b.x + b.w / 2, y: b.y });

/** Horizontal cubic between two anchor points; vertical for stacked nodes. */
function curve(
  a: { x: number; y: number },
  b: { x: number; y: number },
  axis: "x" | "y" = "x",
) {
  if (axis === "y") {
    const midY = (a.y + b.y) / 2;
    return `M${a.x} ${a.y} C${a.x} ${midY} ${b.x} ${midY} ${b.x} ${b.y}`;
  }
  const midX = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} C${midX} ${a.y} ${midX} ${b.y} ${b.x} ${b.y}`;
}

export const feedEdges = Array.from({ length: 8 }, (_, i) =>
  curve(right(feedBox(i)), left(stageBoxes.ingest)),
);

export const stageEdges = [
  curve(right(stageBoxes.ingest), left(stageBoxes.landing)),
  curve(right(stageBoxes.landing), left(stageBoxes.arrival)),
  curve(right(stageBoxes.arrival), left(stageBoxes.models)),
  curve(bottom(stageBoxes.models), top(stageBoxes.weather), "y"),
  curve(right(stageBoxes.models), left(stageBoxes.serving)),
  curve(right(stageBoxes.weather), left(stageBoxes.serving)),
];

export const pct = (box: Box) => ({
  left: `${(box.x / FIELD.w) * 100}%`,
  top: `${(box.y / FIELD.h) * 100}%`,
  width: `${(box.w / FIELD.w) * 100}%`,
  height: `${(box.h / FIELD.h) * 100}%`,
});
