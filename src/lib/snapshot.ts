import snapshot from "@/content/data/subway-wait-snapshot.json";

/**
 * The committed snapshot behind §6.6.
 *
 * The chart reads a file in the repository rather than a live warehouse, so the
 * page never depends on BigQuery being awake. `scripts/build-wait-snapshot.py`
 * rebuilds it from two published sources; with `points` empty the section
 * renders an honest pending state instead of inventing numbers.
 */
export type RouteKey = "red" | "blue" | "orange" | "green" | "neutral";

export type SnapshotRoute = {
  id: string;
  label: string;
  color: RouteKey;
  /** Dash pattern, so meaning is never carried by colour alone (§8). */
  dash: string;
};

export type SnapshotPoint = {
  route: string;
  year: number;
  /** 1–12. */
  month: number;
  /** Share of the month's hours with measurable rain, in percent. */
  wetHoursPct: number;
  /** The month's rainfall total, carried for context rather than fitted. */
  precipMm: number;
  /** Additional platform time, with the controls partialled out. */
  excessWaitMinutes: number;
  passengers: number;
};

export type SnapshotFit = {
  route: string;
  interceptMinutes: number;
  /** Minutes of extra platform time per percentage point of wet hours. */
  minutesPerWetPoint: number;
  ciLow: number;
  ciHigh: number;
  n: number;
};

/** True when the 95% interval contains zero — no detectable effect. */
export function straddlesZero(fit: SnapshotFit): boolean {
  return fit.ciLow <= 0 && fit.ciHigh >= 0;
}

export type WaitSnapshot = {
  status: "pending" | "live";
  generatedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  source: string;
  routes: SnapshotRoute[];
  points: SnapshotPoint[];
  fits: SnapshotFit[];
};

/** Stroke colours for marks on the black canvas — see tokens.css. */
export const ROUTE_STROKE: Record<RouteKey, string> = {
  red: "var(--line-red-on-void)",
  blue: "var(--line-blue-on-void)",
  orange: "var(--line-orange-on-void)",
  green: "var(--line-green-on-void)",
  neutral: "var(--signal)",
};

export const waitSnapshot = snapshot as WaitSnapshot;

export const hasSnapshotData = waitSnapshot.points.length > 0;

/** Fitted line and confidence band for one route across the observed range. */
export function fitSeries(fit: SnapshotFit, from: number, to: number) {
  const steps = 24;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const wetHoursPct = from + ((to - from) * i) / steps;
    const low = Number(
      (fit.interceptMinutes + fit.ciLow * wetHoursPct).toFixed(3),
    );
    const high = Number(
      (fit.interceptMinutes + fit.ciHigh * wetHoursPct).toFixed(3),
    );
    return {
      wetHoursPct: Number(wetHoursPct.toFixed(2)),
      fit: Number(
        (fit.interceptMinutes + fit.minutesPerWetPoint * wetHoursPct).toFixed(
          3,
        ),
      ),
      low,
      high,
      /* Recharts draws an Area between the two values of a tuple dataKey. */
      band: [low, high] as [number, number],
    };
  });
}
