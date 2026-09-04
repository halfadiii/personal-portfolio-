"""
Builds the committed snapshot behind the regression section (§6.6).

Both sides of this are measured, published data, fetched fresh each time it is
run:

  * Excess wait comes from the MTA's own `Subway Customer Journey-Focused
    Metrics`, which publishes `additional_platform_time` — the minutes a rider
    spends on a platform beyond what the schedule implies — by line, by month,
    split peak and off-peak, with the passenger counts to weight them.
    https://data.ny.gov/d/r7qk-6tcy  (public, no key)

  * Rainfall comes from the ERA5 reanalysis archive at Central Park, hourly,
    reduced to the share of hours in each month that had measurable rain.
    https://open-meteo.com/en/docs/historical-weather-api  (public, no key)

    That reduction is the specification, and it is chosen before looking at any
    result: platform time is published as a monthly average over every trip, so
    what should move it is how much of the month was wet, not how many
    millimetres fell. One storm dropping 80 mm on a single afternoon is a large
    monthly total and a very small share of the month's trips.

The estimate is a per-line OLS of excess wait on rainfall, controlling for
month of the year and for the pandemic period. Both controls matter: winter
and summer have different service patterns, and 2020-21 has a ridership
collapse that would otherwise be read as a rainfall effect. What the chart
plots is the added-variable form — the part of excess wait the controls do not
explain — so the cloud and the fitted line are the same estimate.

    python scripts/build-wait-snapshot.py

Writes:
    src/content/data/subway-wait-snapshot.json
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import urllib.parse
import urllib.request
from collections import defaultdict

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "content" / "data" / "subway-wait-snapshot.json"

MTA = "https://data.ny.gov/resource/r7qk-6tcy.json"
WEATHER = "https://archive-api.open-meteo.com/v1/archive"

# Central Park, which is the station the city's rainfall record is kept at.
LAT, LON = 40.7794, -73.9632

START = "2015-01-01"

# Five lines, one per available stroke colour, each the colour it is signed in
# on the real system. Meaning is never carried by colour alone, so each also
# gets a dash pattern (§8).
LINES = [
    {"id": "1", "label": "1", "color": "red", "dash": "0"},
    {"id": "4", "label": "4", "color": "green", "dash": "6 3"},
    {"id": "A", "label": "A", "color": "blue", "dash": "2 3"},
    {"id": "F", "label": "F", "color": "orange", "dash": "10 4"},
    {"id": "L", "label": "L", "color": "neutral", "dash": "1 4"},
]

# The months in which ridership collapsed and service was rewritten. Left in
# the model as an indicator rather than dropped: throwing away two years of
# observations to tidy a chart is its own kind of dishonesty.
PANDEMIC = (dt.date(2020, 3, 1), dt.date(2021, 12, 1))


def get(url: str) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": "portfolio"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def month_of(stamp: str) -> dt.date:
    return dt.date.fromisoformat(stamp[:10]).replace(day=1)


def fetch_wait() -> dict[str, dict[dt.date, tuple[float, float]]]:
    """Per line, per month: passenger-weighted platform time and passengers."""
    ids = ",".join(f"'{line['id']}'" for line in LINES)
    query = urllib.parse.urlencode(
        {
            "$select": "month,line,period,num_passengers,additional_platform_time",
            "$where": f"line in ({ids}) and month >= '{START}T00:00:00'",
            "$limit": 50000,
        }
    )

    rows = get(f"{MTA}?{query}")
    assert isinstance(rows, list)

    # Peak and off-peak are separate rows; a rider-weighted mean of the two is
    # the month the average rider actually had.
    totals: dict[tuple[str, dt.date], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for row in rows:
        apt = row.get("additional_platform_time")
        riders = row.get("num_passengers")
        if apt is None or riders is None:
            continue
        key = (row["line"], month_of(row["month"]))
        totals[key][0] += float(apt) * float(riders)
        totals[key][1] += float(riders)

    out: dict[str, dict[dt.date, tuple[float, float]]] = defaultdict(dict)
    for (line, month), (weighted, riders) in totals.items():
        if riders > 0:
            out[line][month] = (weighted / riders, riders)
    return out


#: A tenth of a millimetre in an hour is the threshold for "it was raining".
WET_MM = 0.1


def fetch_rain(first: dt.date, last: dt.date) -> dict[dt.date, tuple[float, float]]:
    """Per month: the share of hours that were wet, and the total millimetres."""
    end = (last.replace(day=28) + dt.timedelta(days=4)) - dt.timedelta(days=1)
    query = urllib.parse.urlencode(
        {
            "latitude": LAT,
            "longitude": LON,
            "start_date": first.isoformat(),
            "end_date": end.isoformat(),
            "hourly": "precipitation",
            "timezone": "America/New_York",
        }
    )

    payload = get(f"{WEATHER}?{query}")
    assert isinstance(payload, dict)
    hourly = payload["hourly"]

    wet: dict[dt.date, int] = defaultdict(int)
    hours: dict[dt.date, int] = defaultdict(int)
    total: dict[dt.date, float] = defaultdict(float)

    for stamp, mm in zip(hourly["time"], hourly["precipitation"]):
        month = dt.date.fromisoformat(stamp[:10]).replace(day=1)
        hours[month] += 1
        if mm is None:
            continue
        total[month] += float(mm)
        if float(mm) >= WET_MM:
            wet[month] += 1

    return {
        month: (100.0 * wet[month] / count, total[month])
        for month, count in hours.items()
        if count > 0
    }


def regress(
    wait: np.ndarray, rain: np.ndarray, months: list[dt.date]
) -> tuple[float, float, int, np.ndarray]:
    """
    OLS of wait on wet-hour share, month-of-year, and the pandemic period.

    Returns the rainfall coefficient, its standard error, the residual degrees
    of freedom, and the added-variable values to plot — wait with everything
    except rainfall taken out of it, put back on the original scale.
    """
    n = len(wait)
    # Intercept, rainfall, eleven month dummies (January is the reference),
    # and the pandemic indicator.
    design = np.zeros((n, 2 + 11 + 1))
    design[:, 0] = 1.0
    design[:, 1] = rain
    for i, month in enumerate(months):
        if month.month > 1:
            design[i, 1 + month.month] = 1.0
        if PANDEMIC[0] <= month <= PANDEMIC[1]:
            design[i, -1] = 1.0

    beta, _residuals, rank, _s = np.linalg.lstsq(design, wait, rcond=None)
    fitted = design @ beta
    residual = wait - fitted
    dof = n - rank
    sigma2 = float(residual @ residual) / dof

    # Standard error of the rainfall coefficient from the covariance matrix.
    covariance = np.linalg.pinv(design.T @ design) * sigma2
    stderr = float(np.sqrt(covariance[1, 1]))

    # Added-variable form: what is left of wait once the controls have had
    # their say, recentred so the axis still reads in minutes.
    controls = design.copy()
    controls[:, 1] = 0.0
    adjusted = wait - controls @ beta + float(beta[0])

    return float(beta[1]), stderr, dof, adjusted


def t_critical(dof: int) -> float:
    """Two-sided 95% t. Close enough to normal past a few dozen observations."""
    table = {1: 12.706, 2: 4.303, 5: 2.571, 10: 2.228, 20: 2.086, 30: 2.042, 60: 2.000}
    for size, value in sorted(table.items()):
        if dof <= size:
            return value
    return 1.96


def main() -> None:
    print("fetching MTA customer journey metrics…")
    wait = fetch_wait()
    if not wait:
        raise SystemExit("no rows returned from the MTA feed")

    every_month = sorted({m for series in wait.values() for m in series})
    print(f"  {len(wait)} lines, {every_month[0]} to {every_month[-1]}")

    print("fetching Central Park hourly rainfall…")
    rain = fetch_rain(every_month[0], every_month[-1])
    print(f"  {len(rain)} months of rainfall")

    points = []
    fits = []

    for line in LINES:
        series = wait.get(line["id"])
        if not series:
            print(f"  {line['id']}: no data, skipped")
            continue

        months = sorted(m for m in series if m in rain)
        y = np.array([series[m][0] for m in months])
        x = np.array([rain[m][0] for m in months])
        riders = [series[m][1] for m in months]

        slope, stderr, dof, adjusted = regress(y, x, months)
        margin = t_critical(dof) * stderr

        for month, wet, value, passengers in zip(months, x, adjusted, riders):
            points.append(
                {
                    "route": line["id"],
                    "year": month.year,
                    "month": month.month,
                    "wetHoursPct": round(float(wet), 2),
                    "precipMm": round(rain[month][1], 1),
                    "excessWaitMinutes": round(float(value), 3),
                    "passengers": int(passengers),
                }
            )

        # The line is drawn through the centroid, which is where an
        # added-variable plot puts it.
        intercept = float(adjusted.mean() - slope * x.mean())
        fits.append(
            {
                "route": line["id"],
                "interceptMinutes": round(intercept, 3),
                "minutesPerWetPoint": round(slope, 5),
                "ciLow": round(slope - margin, 5),
                "ciHigh": round(slope + margin, 5),
                "n": len(months),
            }
        )
        print(
            f"  {line['id']}: {slope:+.5f} min per wet point "
            f"[{slope - margin:+.5f}, {slope + margin:+.5f}]  n={len(months)}"
        )

    payload = {
        "status": "live",
        "generatedAt": dt.date.today().isoformat(),
        "windowStart": every_month[0].isoformat(),
        "windowEnd": every_month[-1].isoformat(),
        "source": (
            "MTA Subway Customer Journey-Focused Metrics (data.ny.gov/d/r7qk-6tcy) "
            "joined to Central Park hourly rainfall (Open-Meteo ERA5 archive). "
            "OLS per line of additional platform time on the share of hours in "
            "the month with measurable rain, controlling for month of year and "
            "for the 2020-21 period. Built by scripts/build-wait-snapshot.py."
        ),
        "routes": LINES,
        "points": points,
        "fits": fits,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"written    {OUT} ({OUT.stat().st_size / 1024:.0f} KB, {len(points)} points)")


if __name__ == "__main__":
    main()
