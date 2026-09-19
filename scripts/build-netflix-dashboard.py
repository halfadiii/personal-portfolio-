"""
Build the data behind /dashboard/netflix-engagement.

Reads the star schema that halfadiii/netflix-engagement-analytics commits as
flat CSVs (data/model/*.csv) -- Netflix's own public releases, modelled -- and
reproduces the repository's SQL KPI layer (sql/kpis.sql) in pandas. Only the
aggregates the page draws are written out: the 517,500-row weekly fact table
stays on this machine, and the browser gets about 40 KB.

    python scripts/build-netflix-dashboard.py [--source <path to a clone>]

Output: src/content/data/netflix-engagement.json

## Netflix's "Other" rows

From 2025H2 the What We Watched report folds titles below its reporting
threshold into two aggregate rows, "Other Shows" and "Other Movies". They are
Netflix's methodology and belong in the totals, which is why the KPIs keep them
and still match Netflix's published figures. They are not titles, though: in
2026H1 "Other Shows" is the second-largest row in the file. So every per-title
view here -- the concentration curve, the top ten -- drops them, and the page
says so.

## The premiere

The repository's README describes The Gentlemen's first season returning to 85
markets "in the week Season 2 launched". The data says Season 2 first charted a
week earlier, on 2026-09-06, and the 85 is the second week. Both weeks are
written out here so the page can tell it the way it happened.

Every number printed below "check" is one the README or the case study states.
Nothing is asserted: a new data drop that changes a finding shows up as a
changed number rather than a quietly stale sentence.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "content" / "data" / "netflix-engagement.json"

# Where the concentration slider stops. The catalogue size is appended per half.
RANKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000]
CATEGORIES = [
    ("Movie", "English", "Films, English"),
    ("Movie", "Non-English", "Films, non-English"),
    ("Show", "English", "TV, English"),
    ("Show", "Non-English", "TV, non-English"),
]
BUCKET = r"^Other (Shows|Movies)$"


def r(x: float, n: int = 2) -> float:
    return float(round(float(x), n))


def main() -> None:
    parser = argparse.ArgumentParser()
    # His working copy; a fresh clone of the repo works the same way.
    parser.add_argument("--source", type=Path, default=ROOT.parent.parent / "Ent. Dashboard")
    args = parser.parse_args()
    model = args.source / "data" / "model"

    half = pd.read_csv(model / "fact_engagement_half.csv")
    weekly = pd.read_csv(model / "fact_top10_weekly.csv", low_memory=False)
    regions = pd.read_csv(model / "dim_region.csv")
    titles = pd.read_csv(model / "dim_title.csv")
    name_of = dict(zip(titles.title_id, titles.title_name))
    half["title_name"] = half.title_id.map(name_of)
    half["bucket"] = half.title_name.str.match(BUCKET, na=False)

    # ------------------------------------------------------------ halves (Q0-Q3)
    periods = []
    prior = None
    for label, g in half.groupby("period_label", sort=True):
        hours = g.hours_viewed.sum()
        by_type = {}
        for ctype, t in g.groupby("content_type"):
            by_type[ctype] = {
                "titles": int(len(t)),
                "hoursB": r(t.hours_viewed.sum() / 1e9),
                "avgM": r(t.hours_viewed.mean() / 1e6),
                "pctHours": r(100 * t.hours_viewed.sum() / hours, 1),
                "pctTitles": r(100 * len(t) / len(g), 1),
            }

        # Per-title views: real titles only.
        real = g[~g.bucket]
        sorted_hours = np.sort(real.hours_viewed.dropna().to_numpy())[::-1]
        cumulative = sorted_hours.cumsum() / sorted_hours.sum()
        n_titles = len(sorted_hours)
        stops = [n for n in RANKS if n < n_titles] + [n_titles]
        # The curve against rank on a log axis, so the head is readable.
        ranks = np.unique(np.round(np.logspace(0, np.log10(n_titles), 140)).astype(int))
        curve = [[int(n), r(100 * cumulative[n - 1], 2)] for n in ranks]
        top = [
            {"title": row.title_name, "type": row.content_type, "hoursM": r(row.hours_viewed / 1e6, 1)}
            for row in real.sort_values("hours_viewed", ascending=False).head(10).itertuples()
        ]

        periods.append(
            {
                "label": label,
                "titles": int(g.title_id.nunique()),
                "hoursB": r(hours / 1e9),
                "avgM": r(g.hours_viewed.mean() / 1e6),
                "changePct": None if prior is None else r(100 * (hours - prior) / prior),
                "bucketPct": r(100 * g[g.bucket].hours_viewed.sum() / hours, 2),
                "byType": by_type,
                "concentration": {
                    "titles": int(n_titles),
                    "stops": [{"n": int(n), "pct": r(100 * cumulative[n - 1], 1)} for n in stops],
                    "halfOfHoursTitles": int(np.searchsorted(cumulative, 0.5) + 1),
                    "curve": curve,
                },
                "top": top,
            }
        )
        prior = hours

    # ------------------------------------------------------------ weekly global
    global_id = int(regions.loc[regions.region_name == "Global", "region_id"].iloc[0])
    g_weekly = weekly[weekly.region_id == global_id]
    weeks = sorted(g_weekly.date_key.unique())
    pivot = g_weekly.groupby(["date_key", "content_type", "language"]).hours_viewed.sum()
    trend = []
    for week in weeks:
        row = {"week": week}
        for i, (ctype, lang, _) in enumerate(CATEGORIES):
            row[f"c{i}"] = r(pivot.get((week, ctype, lang), 0) / 1e6, 1)
        trend.append(row)
    language = []
    for ctype, lang, label in CATEGORIES:
        s = g_weekly[(g_weekly.content_type == ctype) & (g_weekly.language == lang)]
        language.append(
            {"label": label, "hoursB": r(s.hours_viewed.sum() / 1e9), "titles": int(s.title_id.nunique())}
        )

    # ------------------------------------------------------------ countries (Q4)
    countries_df = weekly[weekly.region_id != global_id].merge(regions, on="region_id")
    stick = countries_df.groupby(["region_name", "iso2"]).agg(
        weeks=("cumulative_weeks_in_top10", "mean"), titles=("title_id", "nunique")
    )
    # Global alignment, as sql/kpis.sql (b): a country's #1 against the Global
    # English-language #1 of the same content type, over the last 52 weeks.
    latest = weekly.date_key.max()
    since = (pd.Timestamp(latest) - pd.Timedelta(days=364)).strftime("%Y-%m-%d")
    g1 = g_weekly[(g_weekly.weekly_rank == 1) & (g_weekly.language == "English")][
        ["date_key", "content_type", "title_id"]
    ].rename(columns={"title_id": "global_title"})
    c1 = countries_df[(countries_df.weekly_rank == 1) & (countries_df.date_key >= since)][
        ["date_key", "content_type", "title_id", "region_name"]
    ]
    joined = c1.merge(g1, on=["date_key", "content_type"])
    joined["match"] = joined.title_id == joined.global_title
    align = joined.groupby(["region_name", "content_type"]).match.mean().unstack()
    countries = []
    for (name, iso2), row in stick.iterrows():
        countries.append(
            {
                "name": name,
                "iso2": iso2,
                "stickWeeks": r(row.weeks),
                "titles": int(row.titles),
                "alignMovie": r(100 * align.loc[name, "Movie"], 1) if name in align.index else None,
                "alignShow": r(100 * align.loc[name, "Show"], 1) if name in align.index else None,
            }
        )
    countries.sort(key=lambda c: -c["stickWeeks"])

    # ------------------------------------------------------------ the premiere (Q5)
    s1 = int(titles.loc[titles.title_name == "The Gentlemen: Season 1", "title_id"].iloc[0])
    s2 = int(titles.loc[titles.title_name == "The Gentlemen: Season 2", "title_id"].iloc[0])
    s2_first = weekly.loc[weekly.title_id == s2, "date_key"].min()
    prev_week = (pd.Timestamp(latest) - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
    names = sorted(regions.loc[regions.region_name != "Global", "region_name"])

    def ranks_in(title_id: int, week: str) -> pd.Series:
        rows = countries_df[(countries_df.title_id == title_id) & (countries_df.date_key == week)]
        return rows.set_index("region_name").weekly_rank

    now_rank, was_rank = ranks_in(s1, latest), ranks_in(s1, prev_week)
    markets = []
    for name in names:
        now = int(now_rank[name]) if name in now_rank.index else None
        was = int(was_rank[name]) if name in was_rank.index else None
        if now is None:
            status = "absent" if was is None else "dropped"
        elif was is None:
            status = "reentered"
        else:
            status = "climbed" if now < was else ("held" if now == was else "fell")
        markets.append({"name": name, "now": now, "was": was, "status": status})

    def global_row(title_id: int, week: str):
        row = g_weekly[(g_weekly.title_id == title_id) & (g_weekly.date_key == week)]
        return (int(row.weekly_rank.iloc[0]), r(row.hours_viewed.iloc[0] / 1e6, 1)) if len(row) else (None, None)

    s1_countries = countries_df[countries_df.title_id == s1].groupby("date_key").region_name.nunique()
    before = s1_countries[s1_countries.index < s2_first]
    premiere = {
        "title": "The Gentlemen",
        "week": latest,
        "priorWeek": prev_week,
        "season2FirstWeek": s2_first,
        "season2": {
            "firstWeek": dict(zip(["rank", "hoursM"], global_row(s2, s2_first)))
            | {"markets": int(ranks_in(s2, s2_first).size)},
            "latestWeek": dict(zip(["rank", "hoursM"], global_row(s2, latest)))
            | {"markets": int(ranks_in(s2, latest).size)},
        },
        "season1": {
            "lastOnGlobalChart": g_weekly.loc[
                (g_weekly.title_id == s1) & (g_weekly.date_key < s2_first), "date_key"
            ].max(),
            "globalRankLatestWeek": global_row(s1, latest)[0],
            "weeksCharting2025To2026": int((before.index >= "2025-01-01").sum()),
            "maxMarketsBeforePremiere2025On": int(before[before.index >= "2025-01-01"].max()),
            "marketsFirstWeek": int(ranks_in(s1, s2_first).size),
            "marketsLatestWeek": int(now_rank.size),
        },
        "markets": markets,
    }

    payload = {
        "source": {
            "repo": "https://github.com/halfadiii/netflix-engagement-analytics",
            "halfRows": int(len(half)),
            "weeklyRows": int(len(weekly)),
            "weeks": len(weeks),
            "firstWeek": weeks[0],
            "lastWeek": weeks[-1],
            "countries": len(names),
        },
        "categories": [label for _, _, label in CATEGORIES],
        "periods": periods,
        "trend": trend,
        "language": language,
        "countries": countries,
        "premiere": premiere,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ------------------------------------------------------------ check
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")
    print("check:")
    for p in periods:
        c = p["concentration"]
        print(f"  {p['label']}: {p['hoursB']}B hours ({p['changePct']}%), {p['titles']:,} titles, {p['avgM']}M avg;"
              f" shows {p['byType']['Show']['pctHours']}% of hours on {p['byType']['Show']['pctTitles']}% of titles,"
              f" {p['byType']['Show']['avgM']}M vs {p['byType']['Movie']['avgM']}M per title;"
              f" 'Other' rows {p['bucketPct']}%; top 10 real titles {c['stops'][2]['pct']}%;"
              f" half of hours from {c['halfOfHoursTitles']} of {c['titles']:,}; #1 {p['top'][0]['title']} {p['top'][0]['hoursM']}M")
    for l in language:
        print(f"  {l['label']}: {l['hoursB']}B hours, {l['titles']} titles")
    print("  stickiest", [(c["name"], c["stickWeeks"]) for c in countries[:3]])
    print("  churniest", [(c["name"], c["stickWeeks"]) for c in countries[-3:]])
    print("  Canada", next(c for c in countries if c["name"] == "Canada"))
    counts = pd.Series([m["status"] for m in markets]).value_counts().to_dict()
    climbs = [m["was"] - m["now"] for m in markets if m["status"] == "climbed"]
    print(f"  premiere: {json.dumps(premiere['season2'])}")
    print(f"  season 1: {json.dumps(premiere['season1'])}")
    print(f"  season 1 latest week vs first: {counts}, largest climb {max(climbs)}")


if __name__ == "__main__":
    main()
