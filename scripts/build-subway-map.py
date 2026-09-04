"""
Turns the MTA's static GTFS feed into the JSON the 3D map loads.

The browser should never parse a 36 MB CSV. This reads the published archive
once, picks the single most representative shape per route per direction,
projects every point with a Web Mercator projection, and writes a compact file
of route polylines, station positions, and the official route colours.

Source: https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip (public, no key).

    python scripts/build-subway-map.py

Writes:
    public/data/subway-map.json
"""

from __future__ import annotations

import csv
import io
import json
import math
import pathlib
import zipfile
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / ".gtfs" / "google_transit.zip"
OUT = ROOT / "public" / "data" / "subway-map.json"

# The map is centred on the system and scaled so the whole thing fits a
# comfortable box in world units; the scene never has to think in degrees.
WORLD_WIDTH = 120.0
# Simplification tolerance in world units. Shapes carry a point every few
# metres, which is far more than a tube 0.1 units wide can show.
TOLERANCE = 0.055
# Below this a shape is noise, not a line. Kept low so the three shuttles —
# 42 St, Franklin Av, Rockaway Park — are drawn rather than quietly dropped,
# which used to leave five station complexes serving no route on the map.
MIN_POINTS = 3
# How many patterns per route to consider before picking which to draw.
CANDIDATES = 8
# At most this many drawn shapes per route: a trunk and its branches.
MAX_PER_ROUTE = 3
# A candidate earns its own polyline only if this share of it is further than
# NEW_DISTANCE from everything already drawn for the route — which is what
# separates the Rockaway branch from the return direction of the same tunnel.
NOVEL_SHARE = 0.22
NEW_DISTANCE = 0.7


def read(archive: zipfile.ZipFile, name: str):
    with archive.open(name) as handle:
        text = io.TextIOWrapper(handle, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)


def mercator(lat: float, lon: float) -> tuple[float, float]:
    """Web Mercator, in unscaled units. Fine at city scale."""
    x = math.radians(lon)
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def simplify(points: list[tuple[float, float]], tolerance: float):
    """Ramer–Douglas–Peucker, iterative so a long shape cannot blow the stack."""
    if len(points) < 3:
        return points

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)

        worst = 0.0
        index = -1
        for i in range(start + 1, end):
            px, py = points[i]
            if length == 0:
                distance = math.hypot(px - ax, py - ay)
            else:
                distance = abs(dy * px - dx * py + bx * ay - by * ax) / length
            if distance > worst:
                worst = distance
                index = i

        if index != -1 and worst > tolerance:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))

    return [point for point, flag in zip(points, keep) if flag]


def main() -> None:
    if not ARCHIVE.exists():
        raise SystemExit(f"GTFS archive not found at {ARCHIVE}")

    archive = zipfile.ZipFile(ARCHIVE)

    routes = {}
    for row in read(archive, "routes.txt"):
        routes[row["route_id"]] = {
            "id": row["route_id"],
            "short": row.get("route_short_name") or row["route_id"],
            "long": row.get("route_long_name", ""),
            # The official palette, straight from the agency.
            "color": f"#{row.get('route_color') or 'A7A9AC'}",
            "text": f"#{row.get('route_text_color') or 'FFFFFF'}",
        }

    # How often each route runs each of its shapes.
    usage: dict[str, Counter] = defaultdict(Counter)
    for row in read(archive, "trips.txt"):
        shape = row.get("shape_id")
        if shape:
            usage[row["route_id"]][shape] += 1

    # The busiest few per route are the candidates; the rest are one-off
    # reroutes and late-night patterns that add nothing but geometry.
    candidates: dict[str, tuple[str, int]] = {}
    for route_id, counter in usage.items():
        for rank, (shape_id, _count) in enumerate(counter.most_common(CANDIDATES)):
            candidates[shape_id] = (route_id, rank)

    raw_shapes: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for row in read(archive, "shapes.txt"):
        shape_id = row["shape_id"]
        if shape_id not in candidates:
            continue
        raw_shapes[shape_id].append(
            (
                int(row["shape_pt_sequence"]),
                float(row["shape_pt_lat"]),
                float(row["shape_pt_lon"]),
            )
        )

    # Which routes actually call at which stop. GTFS states this in
    # stop_times, and it is the only authoritative answer — guessing from how
    # close a platform sits to a drawn shape gets the busy interchanges wrong.
    trip_route = {}
    for row in read(archive, "trips.txt"):
        trip_route[row["trip_id"]] = row["route_id"]

    served: dict[str, set[str]] = defaultdict(set)
    with archive.open("stop_times.txt") as handle:
        text = io.TextIOWrapper(handle, encoding="utf-8-sig", newline="")
        reader = csv.reader(text)
        header = next(reader)
        trip_at = header.index("trip_id")
        stop_at = header.index("stop_id")
        for row in reader:
            route_id = trip_route.get(row[trip_at])
            if route_id:
                served[row[stop_at]].add(route_id)

    stops = {}
    # Every stop, platforms included: stop_times references the platforms, and
    # `parent_station` is how the feed itself rolls them up.
    belongs_to = {}
    for row in read(archive, "stops.txt"):
        parent = row.get("parent_station") or None
        belongs_to[row["stop_id"]] = parent or row["stop_id"]
        # location_type 1 is the parent station; those are the ones riders name.
        if row.get("location_type") not in ("1", ""):
            continue
        if not row.get("stop_lat"):
            continue
        stops[row["stop_id"]] = {
            "id": row["stop_id"],
            "name": row["stop_name"],
            "lat": float(row["stop_lat"]),
            "lon": float(row["stop_lon"]),
            "parent": parent,
        }

    parents = {sid: s for sid, s in stops.items() if not s["parent"]}

    station_routes: dict[str, set[str]] = defaultdict(set)
    for stop_id, route_ids in served.items():
        parent = belongs_to.get(stop_id, stop_id)
        if parent in parents:
            station_routes[parent] |= route_ids

    # Work out the projected bounds from everything we could draw. The stations
    # already span the system, so adding a branch later cannot change the scale.
    projected_points = []
    for points in raw_shapes.values():
        for _seq, lat, lon in points:
            projected_points.append(mercator(lat, lon))
    for stop in parents.values():
        projected_points.append(mercator(stop["lat"], stop["lon"]))

    xs = [p[0] for p in projected_points]
    ys = [p[1] for p in projected_points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max_x - min_x
    span_y = max_y - min_y
    scale = WORLD_WIDTH / max(span_x, span_y)
    centre_x = (min_x + max_x) / 2
    centre_y = (min_y + max_y) / 2

    def to_world(lat: float, lon: float) -> tuple[float, float]:
        x, y = mercator(lat, lon)
        # Mercator y grows north; the scene's z grows south, hence the sign.
        return round((x - centre_x) * scale, 3), round(-(y - centre_y) * scale, 3)

    # Project and thin every candidate once, then decide which to keep.
    thinned: dict[str, list[tuple[float, float]]] = {}
    for shape_id, points in raw_shapes.items():
        ordered = [to_world(lat, lon) for _seq, lat, lon in sorted(points)]
        thinned[shape_id] = simplify(ordered, TOLERANCE)

    by_route: dict[str, list[str]] = defaultdict(list)
    for shape_id, (route_id, rank) in candidates.items():
        if shape_id in thinned:
            by_route[route_id].append(shape_id)
    for shape_ids in by_route.values():
        shape_ids.sort(key=lambda shape_id: candidates[shape_id][1])

    def novel_share(points, drawn: list[list[tuple[float, float]]]) -> float:
        """How much of this shape is somewhere none of the drawn ones go."""
        if not drawn:
            return 1.0
        far = 0
        for px, pz in points:
            nearest = min(
                math.hypot(px - qx, pz - qz)
                for shape in drawn
                for qx, qz in shape
            )
            if nearest > NEW_DISTANCE:
                far += 1
        return far / len(points)

    lines = []
    for route_id, shape_ids in by_route.items():
        route = routes.get(route_id)
        if not route:
            continue

        drawn: list[list[tuple[float, float]]] = []
        for shape_id in shape_ids:
            points = thinned[shape_id]
            if len(points) < MIN_POINTS:
                continue
            if len(drawn) >= MAX_PER_ROUTE:
                break
            # The first pattern is the line; later ones have to earn the space.
            if drawn and novel_share(points, drawn) < NOVEL_SHARE:
                continue

            drawn.append(points)
            lines.append(
                {
                    "routeId": route_id,
                    "shapeId": shape_id,
                    "short": route["short"],
                    "long": route["long"],
                    "color": route["color"],
                    "textColor": route["text"],
                    "points": [coord for point in points for coord in point],
                }
            )

    lines.sort(key=lambda line: (line["short"], line["shapeId"]))

    drawn_routes = {line["routeId"] for line in lines}

    stations = []
    for stop in parents.values():
        x, z = to_world(stop["lat"], stop["lon"])
        # Only routes that are actually drawn; a station whose service is all
        # shuttles would otherwise advertise a line that is not on the map.
        serving = sorted(station_routes.get(stop["id"], set()) & drawn_routes)
        stations.append(
            {
                "id": stop["id"],
                "name": stop["name"],
                "x": x,
                "z": z,
                "routes": serving,
            }
        )
    stations.sort(key=lambda station: station["name"])

    payload = {
        "source": {
            "name": "MTA subway GTFS static feed",
            "url": "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip",
            "note": "Route shapes, station positions, and colours are the agency's own.",
        },
        "world": {"width": WORLD_WIDTH, "scale": round(scale, 6)},
        "routes": [
            routes[rid]
            for rid in sorted({line["routeId"] for line in lines})
            if rid in routes
        ],
        "lines": lines,
        "stations": stations,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    total_points = sum(len(line["points"]) // 2 for line in lines)
    print(f"routes     {len(payload['routes'])}")
    branched = len(lines) - len({line["routeId"] for line in lines})
    print(
        f"lines      {len(lines)} ({total_points:,} points after simplifying, "
        f"{branched} of them branches)"
    )
    unserved = sum(1 for station in stations if not station["routes"])
    print(f"stations   {len(stations)} ({unserved} with no drawn route)")
    print(f"written    {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
