import data from "@/content/data/netflix-engagement.json";

/**
 * The streaming engagement dashboard (/dashboard/netflix-engagement).
 *
 * `scripts/build-netflix-dashboard.py` writes the file this reads, out of the
 * star schema committed in halfadiii/netflix-engagement-analytics: Netflix's
 * three half-yearly What We Watched reports and five years of its weekly Top
 * 10, global and in 94 countries. The script reproduces the repository's SQL
 * KPI layer; nothing here is computed from anything else, and nothing is typed
 * in by hand.
 */

export type TypeSplit = {
  titles: number;
  hoursB: number;
  avgM: number;
  pctHours: number;
  pctTitles: number;
};

export type Period = {
  label: string;
  titles: number;
  hoursB: number;
  avgM: number;
  changePct: number | null;
  /** Share of the half's hours in Netflix's "Other" aggregate rows. */
  bucketPct: number;
  byType: { Show: TypeSplit; Movie: TypeSplit };
  concentration: {
    /** Real titles only: the "Other" rows are left out of every per-title view. */
    titles: number;
    stops: { n: number; pct: number }[];
    halfOfHoursTitles: number;
    /** [rank, cumulative % of hours], log-spaced in rank. */
    curve: [number, number][];
  };
  top: { title: string; type: "Show" | "Movie"; hoursM: number }[];
};

export type Country = {
  name: string;
  iso2: string;
  stickWeeks: number;
  titles: number;
  alignMovie: number | null;
  alignShow: number | null;
};

export type MarketStatus = "climbed" | "reentered" | "held" | "fell" | "dropped" | "absent";

export type Market = {
  name: string;
  now: number | null;
  was: number | null;
  status: MarketStatus;
};

type GlobalWeek = { rank: number | null; hoursM: number | null; markets: number };

export type NetflixData = {
  source: {
    repo: string;
    halfRows: number;
    weeklyRows: number;
    weeks: number;
    firstWeek: string;
    lastWeek: string;
    countries: number;
  };
  categories: string[];
  periods: Period[];
  trend: ({ week: string } & Record<`c${number}`, number>)[];
  language: { label: string; hoursB: number; titles: number }[];
  countries: Country[];
  premiere: {
    title: string;
    week: string;
    priorWeek: string;
    season2FirstWeek: string;
    season2: { firstWeek: GlobalWeek; latestWeek: GlobalWeek };
    season1: {
      /** Its last week on the global chart before Season 2 arrived. */
      lastOnGlobalChart: string;
      globalRankLatestWeek: number | null;
      weeksCharting2025To2026: number;
      maxMarketsBeforePremiere2025On: number;
      marketsFirstWeek: number;
      marketsLatestWeek: number;
    };
    markets: Market[];
  };
};

export const netflix = data as unknown as NetflixData;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09-13` → `13 Sep 2026`, without a timezone to shift it a day. */
export function formatWeek(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** `2026H1` → `H1 2026`. */
export function formatHalf(label: string): string {
  return `${label.slice(4)} ${label.slice(0, 4)}`;
}
