/**
 * The static network, and the fleet that runs on it.
 *
 * `scripts/build-subway-map.py` projects the MTA's own GTFS shapes and stops
 * into world coordinates once, at build time, so the browser loads 46 KB of
 * JSON rather than parsing a 36 MB archive. Route colours are the agency's
 * published values.
 *
 * Train positions are simulated. The realtime feeds send protobuf with no CORS
 * headers, so a browser cannot read them directly — that needs a small proxy,
 * and `TrainSource` is the seam where one would attach. Until then the fleet
 * runs on a schedule and the page says so plainly.
 */

export type MapRoute = {
  id: string;
  short: string;
  long: string;
  color: string;
  text: string;
};

export type MapLine = {
  routeId: string;
  /** The GTFS shape this polyline came from; unique, so it keys the mesh. */
  shapeId: string;
  short: string;
  long: string;
  color: string;
  textColor: string;
  /** Flat [x, z, x, z, …] in world units. */
  points: number[];
};

export type MapStation = {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Route ids that call here, per the feed’s own `stop_times`. */
  routes: string[];
};

export type SubwayMapData = {
  source: { name: string; url: string; note: string };
  world: { width: number; scale: number };
  routes: MapRoute[];
  lines: MapLine[];
  stations: MapStation[];
};

let cache: Promise<SubwayMapData> | null = null;

export function loadSubwayMap(): Promise<SubwayMapData> {
  cache ??= fetch("/data/subway-map.json").then((response) => {
    if (!response.ok) throw new Error(`map data returned ${response.status}`);
    return response.json() as Promise<SubwayMapData>;
  });
  return cache;
}

export type Vehicle = {
  id: string;
  /** Index into `lines`. */
  line: number;
  /** 0..1 along that line's curve. */
  t: number;
  /** +1 toward the end of the shape, -1 back. */
  heading: 1 | -1;
  speed: number;
  dwellLeft: number;
  /** Index into `stations`, set while the train is at a platform. */
  atStation: number | null;
  nextStation: number | null;
};

/**
 * Runs a fleet over the network.
 *
 * Each train belongs to one line and slides along its curve, pausing at the
 * stations that sit on it. Swapping this for live positions means replacing
 * `step` with a decode of the feed and a tween toward the reported position —
 * everything downstream reads `vehicles` and does not care where it came from.
 */
export class Fleet {
  vehicles: Vehicle[] = [];

  /** Per line: the arc positions of the stations along it, ascending. */
  private stops: number[][] = [];
  private stopIds: number[][] = [];
  private random: () => number;

  constructor(
    private data: SubwayMapData,
    private lengths: number[],
    seed = 1337,
  ) {
    this.random = seeded(seed);
    this.indexStations();
  }

  /**
   * Which stations lie on which line, and where along it.
   *
   * Membership is the feed's answer, not a guess: `stop_times` says which
   * routes call at which platform, and the build script rolls that up onto the
   * parent station. Proximity to the drawn shape only supplies the arc
   * position, with a loose cap to drop the odd branch a route's most-used
   * pattern does not actually cover.
   */
  private indexStations() {
    const OFF_SHAPE = 0.8;

    for (const line of this.data.lines) {
      const arcs: number[] = [];
      const ids: number[] = [];
      const count = line.points.length / 2;

      // Cumulative chord length, which is the parameterisation `getPointAt`
      // uses. Vertex index would not do: simplification leaves a dead-straight
      // run like Lexington Avenue with two vertices and twelve stations.
      const along = new Float64Array(count);
      for (let i = 1; i < count; i += 1) {
        along[i] =
          along[i - 1] +
          Math.hypot(
            line.points[i * 2] - line.points[(i - 1) * 2],
            line.points[i * 2 + 1] - line.points[(i - 1) * 2 + 1],
          );
      }
      const total = along[count - 1] || 1;

      this.data.stations.forEach((station, stationIndex) => {
        if (!station.routes.includes(line.routeId)) return;

        let best = Infinity;
        let bestArc = 0;

        // Nearest point on the polyline, not the nearest vertex.
        for (let i = 0; i < count - 1; i += 1) {
          const ax = line.points[i * 2];
          const az = line.points[i * 2 + 1];
          const vx = line.points[(i + 1) * 2] - ax;
          const vz = line.points[(i + 1) * 2 + 1] - az;
          const span = vx * vx + vz * vz;

          const t = span
            ? Math.min(
                1,
                Math.max(
                  0,
                  ((station.x - ax) * vx + (station.z - az) * vz) / span,
                ),
              )
            : 0;

          const dx = station.x - (ax + vx * t);
          const dz = station.z - (az + vz * t);
          const distance = dx * dx + dz * dz;

          if (distance < best) {
            best = distance;
            bestArc = (along[i] + Math.sqrt(span) * t) / total;
          }
        }

        if (Math.sqrt(best) < OFF_SHAPE) {
          arcs.push(bestArc);
          ids.push(stationIndex);
        }
      });

      const order = arcs.map((_, i) => i).sort((a, b) => arcs[a] - arcs[b]);
      this.stops.push(order.map((i) => arcs[i]));
      this.stopIds.push(order.map((i) => ids[i]));
    }
  }

  stationsOnLine(line: number): number[] {
    return this.stopIds[line] ?? [];
  }

  /**
   * Trains currently heading for one station, soonest first.
   *
   * `nextStation` alone answers almost nothing — at any instant it names one
   * platform per train, so 496 stations share a few hundred values and most
   * come up empty. A rider wants everything still upstream of them, which is
   * what a countdown clock shows.
   */
  approaching(stationIndex: number, limit = 8) {
    const found: { vehicle: Vehicle; seconds: number }[] = [];

    for (const vehicle of this.vehicles) {
      const stops = this.stops[vehicle.line];
      const ids = this.stopIds[vehicle.line];
      if (!stops?.length) continue;

      const at = ids.indexOf(stationIndex);
      if (at < 0) continue;

      const arc = stops[at];
      const ahead = vehicle.heading === 1 ? arc - vehicle.t : vehicle.t - arc;
      if (ahead <= 0) continue;

      // Every platform it still has to call at on the way.
      let between = 0;
      for (const stop of stops) {
        const before =
          vehicle.heading === 1
            ? stop > vehicle.t && stop < arc
            : stop < vehicle.t && stop > arc;
        if (before) between += 1;
      }

      found.push({
        vehicle,
        seconds: ahead / vehicle.speed + between * 5 + vehicle.dwellLeft,
      });
    }

    found.sort((a, b) => a.seconds - b.seconds);
    return found.slice(0, limit);
  }

  /** Populate the fleet: more trains on longer lines, as service works. */
  populate(perLine = 4) {
    let serial = 0;
    this.vehicles = [];

    this.data.lines.forEach((line, index) => {
      const length = this.lengths[index] ?? 1;
      const count = Math.max(2, Math.round((perLine * length) / 45));

      for (let i = 0; i < count; i += 1) {
        serial += 1;
        this.vehicles.push({
          id: `${line.short}-${String(serial).padStart(3, "0")}`,
          line: index,
          t: (i + this.random() * 0.4) / count,
          heading: this.random() > 0.5 ? 1 : -1,
          // Roughly 30 km/h expressed as arc per second on this line.
          speed: (0.0085 * (0.9 + this.random() * 0.2) * 45) / length,
          dwellLeft: 0,
          atStation: null,
          nextStation: null,
        });
      }
    });

    return this.vehicles.length;
  }

  step(dt: number) {
    for (const vehicle of this.vehicles) {
      const stops = this.stops[vehicle.line];

      if (vehicle.dwellLeft > 0) {
        vehicle.dwellLeft -= dt;
        if (vehicle.dwellLeft <= 0) vehicle.atStation = null;
        continue;
      }

      const before = vehicle.t;
      vehicle.t += vehicle.speed * vehicle.heading * dt;

      // Turn round at the terminals rather than vanishing.
      if (vehicle.t >= 1) {
        vehicle.t = 1;
        vehicle.heading = -1;
        vehicle.dwellLeft = 20;
      } else if (vehicle.t <= 0) {
        vehicle.t = 0;
        vehicle.heading = 1;
        vehicle.dwellLeft = 20;
      }

      // Did it cross a platform this step?
      if (stops?.length) {
        const low = Math.min(before, vehicle.t);
        const high = Math.max(before, vehicle.t);
        for (let i = 0; i < stops.length; i += 1) {
          if (stops[i] > low && stops[i] <= high) {
            vehicle.atStation = this.stopIds[vehicle.line][i];
            vehicle.dwellLeft = 3.5 + this.random() * 2.5;
            break;
          }
        }

        const ahead =
          vehicle.heading === 1
            ? stops.findIndex((stop) => stop > vehicle.t)
            : findLastIndex(stops, (stop) => stop < vehicle.t);
        vehicle.nextStation =
          ahead >= 0 ? this.stopIds[vehicle.line][ahead] : null;
      }
    }
  }

  get moving() {
    return this.vehicles.filter((vehicle) => vehicle.dwellLeft <= 0).length;
  }
}

function findLastIndex<T>(items: T[], test: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (test(items[i])) return i;
  }
  return -1;
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Black or white on a route's own colour, whichever is actually readable.
 *
 * The agency publishes a `route_text_color` and it is white for every line,
 * which puts small labels at 3.2:1 on the orange trunk and 3.7:1 on the greens
 * — under the 4.5:1 WCAG asks of text this size. The line colours themselves
 * stay exactly as published; only the ink on top of them is chosen here.
 */
export function readableInk(background: string): string {
  const hex = background.replace("#", "");
  const value = parseInt(
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex,
    16,
  );
  const channel = (shift: number) => {
    const srgb = ((value >> shift) & 255) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);

  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onBlack >= onWhite ? "#000000" : "#ffffff";
}
