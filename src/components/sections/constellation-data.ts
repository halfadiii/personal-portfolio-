import {
  profile,
  projectMetrics,
  projects,
  type ProjectMetric,
} from "@/content";

/**
 * The hero constellation, §6.2.
 *
 * Appendix A asks the client for 9–12 project stills and chart crops. Until
 * those arrive the constellation is built from the site's own content — the six
 * projects and the four headline metrics — so nothing on screen is a stand-in
 * for data that does not exist. When the stills land, add an `image` field to a
 * fragment and it renders as a `next/image` in the same reserved box.
 */
export type Fragment = {
  id: string;
  /** Percentage offsets inside the constellation field. */
  x: number;
  y: number;
  /** Reserved width in px; height follows from the content box. */
  w: number;
  /** Drift rate multiplier for the GSAP timeline; 1 is the base rate. */
  rate: number;
  kind: "project" | "metric";
  index: string;
  title: string;
  caption: string;
  metric?: ProjectMetric;
  /** The three fragments kept in the static mobile grid (§7). */
  compact?: boolean;
};

/**
 * Slots keep two bands clear: the name sits across roughly 12–34% and the
 * positioning paragraph across the bottom quarter, so no fragment is ever
 * behind body copy that has to stay readable.
 */
const SLOTS = [
  { x: 1, y: 2, w: 176, rate: 0.6 },
  { x: 62, y: 2, w: 150, rate: 1.15 },
  { x: 80, y: 1, w: 164, rate: 0.8 },
  { x: 88, y: 38, w: 150, rate: 1.35 },
  { x: 1, y: 44, w: 168, rate: 1.0 },
  { x: 22, y: 40, w: 186, rate: 0.7 },
  { x: 45, y: 48, w: 172, rate: 1.25 },
  { x: 68, y: 36, w: 180, rate: 0.9 },
  { x: 34, y: 62, w: 156, rate: 1.45 },
  { x: 74, y: 58, w: 164, rate: 0.55 },
] as const;

const projectFragments = projects.map((project, i) => ({
  id: project.slug,
  kind: "project" as const,
  index: String(i + 1).padStart(2, "0"),
  title: project.title,
  caption: project.period,
  metric: projectMetrics[project.slug],
  compact: i < 2,
}));

const metricFragments = profile.headlineMetrics.map((metric, i) => ({
  id: `headline-${i}`,
  kind: "metric" as const,
  index: metric.value,
  title: metric.label,
  caption: "measured outcome",
  compact: i === 0,
}));

export const fragments: Fragment[] = [
  ...projectFragments,
  ...metricFragments,
].map((fragment, i) => ({ ...fragment, ...SLOTS[i % SLOTS.length] }));

export const compactFragments = fragments.filter((f) => f.compact);
