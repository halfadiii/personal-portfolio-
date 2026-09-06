import type { ProjectMetric } from "@/content";
import { cn } from "@/lib/utils";

/**
 * The small mark that stands in for a project's one real number.
 *
 * Each form is chosen by what the source material actually supports: a genuine
 * before/after draws a two-point delta, a point measurement draws a level bar
 * against its ceiling, a shortfall draws the gap it leaves in one, a cardinality draws
 * that many units. Nothing is interpolated into a time series.
 *
 * Pure SVG with a fixed viewBox, so it costs no JavaScript and reserves its own
 * height — no layout shift, no chart library on the critical path.
 */

const W = 220;
const H = 56;

export function MetricMark({
  metric,
  className,
  labelled = true,
}: {
  metric: ProjectMetric;
  className?: string;
  /** Set false when a caption next to the mark already states the numbers. */
  labelled?: boolean;
}) {
  return (
    <figure className={cn("m-0 flex flex-col gap-1.5", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={describe(metric)}
        className="block h-auto w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        <Mark metric={metric} />
      </svg>
      {labelled ? (
        <figcaption className="label-mono">{describe(metric)}</figcaption>
      ) : null}
    </figure>
  );
}

function Mark({ metric }: { metric: ProjectMetric }) {
  switch (metric.kind) {
    case "delta": {
      const x1 = 6;
      const x2 = W - 6;
      const y = (v: number) => H - 10 - (v / metric.scaleMax) * (H - 22);
      return (
        <>
          <line
            x1={x1}
            x2={x2}
            y1={H - 9.5}
            y2={H - 9.5}
            stroke="var(--hairline)"
            strokeWidth="1"
          />
          <line
            x1={x1}
            x2={x2}
            y1={y(metric.from)}
            y2={y(metric.to)}
            stroke="var(--signal)"
            strokeWidth="1.5"
          />
          <circle cx={x1} cy={y(metric.from)} r="3" fill="var(--steel)" />
          <circle cx={x2} cy={y(metric.to)} r="3.5" fill="var(--signal)" />
        </>
      );
    }
    case "level": {
      const track = W - 12;
      const filled = (metric.value / metric.scaleMax) * track;
      return (
        <>
          <rect
            x="6"
            y={H / 2 - 5}
            width={track}
            height="10"
            fill="none"
            stroke="var(--hairline)"
            strokeWidth="1"
          />
          <rect
            x="6"
            y={H / 2 - 5}
            width={filled}
            height="10"
            fill="var(--signal)"
          />
          <line
            x1={6 + filled}
            x2={6 + filled}
            y1={H / 2 - 13}
            y2={H / 2 + 13}
            stroke="var(--signal)"
            strokeWidth="1"
          />
        </>
      );
    }
    case "shortfall": {
      /*
       * The same vocabulary as a level: an outlined track for the thing being
       * measured against, filled to where it actually got, and the empty tail
       * is the shortfall.
       *
       * It used to encode the number as the *thickness* of a full-width block
       * hanging under a dashed line — nineteen per cent came out as ten pixels
       * of depth in a fifty-six pixel box, with nothing to compare it to, so it
       * read as a solid bar and the figure was invisible. It also silently
       * saturated at sixty. A fifth of the track left empty is a fifth you can
       * see.
       */
      const track = W - 12;
      const short = Math.min(100, Math.max(0, metric.value));
      const reached = ((100 - short) / 100) * track;
      return (
        <>
          <rect
            x="6"
            y={H / 2 - 5}
            width={track}
            height="10"
            fill="none"
            stroke="var(--hairline)"
            strokeWidth="1"
          />
          <rect
            x="6"
            y={H / 2 - 5}
            width={reached}
            height="10"
            fill="var(--signal)"
            opacity="0.9"
          />
          {/* Where it stopped. The gap from here to the end of the track is
              the number the caption quotes. */}
          <line
            x1={6 + reached}
            x2={6 + reached}
            y1={H / 2 - 13}
            y2={H / 2 + 13}
            stroke="var(--signal)"
            strokeWidth="1"
          />
          {/* Target, at the end of the track. */}
          <line
            x1={6 + track}
            x2={6 + track}
            y1={H / 2 - 13}
            y2={H / 2 + 13}
            stroke="var(--steel)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </>
      );
    }
    case "count": {
      const gap = 4;
      const size = Math.min(
        18,
        (W - 12 - gap * (metric.value - 1)) / metric.value,
      );
      return (
        <>
          {Array.from({ length: metric.value }, (_, i) => (
            <rect
              key={i}
              x={6 + i * (size + gap)}
              y={H / 2 - size / 2}
              width={size}
              height={size}
              fill="none"
              stroke="var(--signal)"
              strokeWidth="1"
            />
          ))}
        </>
      );
    }
  }
}

export function describe(metric: ProjectMetric): string {
  switch (metric.kind) {
    case "delta":
      return `${metric.label}: ${metric.from} → ${metric.to} ${metric.unit}`;
    case "level":
      return `${metric.label}: ${metric.value}${metric.unit}`;
    case "shortfall":
      return `${metric.label}: ${metric.value}${metric.unit} below`;
    case "count":
      return `${metric.label}: ${metric.value} ${metric.unit}, ${metric.note}`;
  }
}
