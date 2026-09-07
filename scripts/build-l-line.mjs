/**
 * The L's stations, in order, with their real spacing.
 *
 * Derived from `public/data/subway-map.json`, which `build-subway-map.py`
 * already projects out of the MTA's published static GTFS. Two reasons this
 * gets its own tiny file rather than being computed from that one at runtime:
 * the map is 46 KB and the live demo needs 24 stations out of it, and the stop
 * ids here have to be the *real* ones — `L03N`, `L29S` — because they are what
 * the realtime feed says, and the whole demo is a join between the two.
 *
 *   node scripts/build-l-line.mjs
 *
 * Distances are cumulative along the route in the map's own world units, not
 * kilometres. Only the ratios matter: they decide where the ticks sit on the
 * strip diagram, and they are real, which is why the gap between 1 Av and
 * Bedford Av is five times the gap between 8 Av and 6 Av. That is the East
 * River, and a diagram that spaced the stations evenly would be hiding it.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "public/data/subway-map.json");
const OUT = path.join(ROOT, "src/content/data/l-line.json");

const map = JSON.parse(await readFile(SOURCE, "utf8"));

const stations = map.stations
  .filter((station) => (station.routes ?? []).includes("L"))
  // The L's stop ids run L01 to L29 from Eighth Avenue to Canarsie with gaps
  // where stations were renumbered, so the numeric part is the running order.
  .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

if (stations.length < 20) {
  throw new Error(`only ${stations.length} L stations found; the map looks wrong`);
}

let cumulative = 0;
const line = stations.map((station, i) => {
  if (i > 0) {
    const previous = stations[i - 1];
    cumulative += Math.hypot(station.x - previous.x, station.z - previous.z);
  }
  return {
    id: station.id,
    name: station.name,
    at: Number(cumulative.toFixed(3)),
  };
});

const payload = {
  source: {
    from: "public/data/subway-map.json",
    note:
      "Cumulative distance along the route in the map's world units. Ratios " +
      "are what matter; they place the ticks on the strip diagram.",
    generated: new Date().toISOString().slice(0, 10),
  },
  // Northbound is toward 8 Av, which is decreasing station index; southbound
  // is toward Canarsie. The feed spells this as a suffix on every stop id.
  directions: {
    N: { label: "8 Av", toward: "8 Av" },
    S: { label: "Canarsie", toward: "Canarsie–Rockaway Pkwy" },
  },
  length: line[line.length - 1].at,
  stations: line,
};

await writeFile(OUT, JSON.stringify(payload, null, 1) + "\n", "utf8");
console.log(
  `${line.length} stations → ${path.relative(ROOT, OUT)} (${payload.length} units end to end)`,
);
