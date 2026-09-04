/**
 * The one number each project is actually willing to defend, taken verbatim
 * from the project copy in §5.3 — nothing here is interpolated or invented.
 *
 * Deliberately not a time series: the source material gives point values and
 * one genuine before/after, so the work rail draws those shapes rather than a
 * fabricated sparkline (see src/components/viz/MetricMark.tsx).
 */
export type ProjectMetric =
  /** A real before/after pair, e.g. 69 → 95 mAP. */
  | {
      kind: "delta";
      label: string;
      unit: string;
      from: number;
      to: number;
      scaleMax: number;
    }
  /** A single measured level against a known ceiling, e.g. 87% accuracy. */
  | {
      kind: "level";
      label: string;
      unit: string;
      value: number;
      scaleMax: number;
    }
  /** A shortfall against a baseline, e.g. a cohort running 19% below ROI. */
  | { kind: "shortfall"; label: string; unit: string; value: number }
  /** A cardinality, e.g. eight feeds every thirty seconds. */
  | { kind: "count"; label: string; unit: string; value: number; note: string };

export const projectMetrics: Record<string, ProjectMetric> = {
  "nyc-subway-reliability": {
    kind: "count",
    label: "Real-time MTA feeds ingested",
    unit: "feeds",
    value: 8,
    note: "every 30 seconds",
  },
  "bank-marketing-strategy": {
    kind: "level",
    label: "ROC AUC, gradient boosting on a held-out split",
    unit: "",
    value: 91.6,
    scaleMax: 100,
  },
  "print-inspection-cv": {
    kind: "delta",
    label: "Detection performance",
    unit: "mAP",
    from: 69,
    to: 95,
    scaleMax: 100,
  },
  "customer-churn": {
    kind: "level",
    label: "Test accuracy on 10K telecom records",
    unit: "%",
    value: 87,
    scaleMax: 100,
  },
  "fake-news-detector": {
    kind: "level",
    label: "Precision, TF-IDF plus ensemble",
    unit: "%",
    value: 91,
    scaleMax: 100,
  },
  "marketing-segmentation": {
    kind: "shortfall",
    label: "Worst cohort against target ROI",
    unit: "%",
    value: 19,
  },
};
