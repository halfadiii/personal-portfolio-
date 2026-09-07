import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import lLine from "@/content/data/l-line.json";

export const runtime = "nodejs";
// The fetch below gives up at 8s; this leaves headroom for the decode without
// letting a hung upstream hold a function open.
export const maxDuration = 15;
// Never prerendered: the whole value of this route is that it is answered now.
export const dynamic = "force-dynamic";

/**
 * One poll of the MTA's L feed, decoded, on the server.
 *
 * ## Why this exists at all
 *
 * The realtime feeds are protobuf served without CORS headers, so a browser
 * cannot read them. Not "should not" — cannot: the fetch is blocked before the
 * bytes arrive. Every live transit map on the web has something like this file
 * behind it, and the demo on this site was a simulation for exactly this
 * reason until it got one.
 *
 * So the work happens here: fetch, decode, and hand the browser the small
 * amount of JSON it actually needs. About 30 KB of protobuf becomes about 6 KB
 * of JSON, and the client never learns what a protobuf is.
 *
 * ## The cache header is doing real work
 *
 * `s-maxage=20` means Vercel's edge answers almost every request from cache and
 * the MTA is asked at most about three times a minute — the same three times
 * whether one person is watching or a thousand. That is the difference between
 * a demo and a nuisance: a public feed does not owe anyone unlimited requests,
 * and a page that hammers it on every visitor is one that deserves to be
 * blocked.
 *
 * `stale-while-revalidate` then covers the MTA having a bad moment. A visitor
 * gets the last good snapshot instantly while a fresh one is fetched behind
 * them, which matters because this feed does occasionally take several seconds
 * to answer.
 *
 * ## What is returned, and what is deliberately not
 *
 * Positions and predictions, and nothing derived. No arrivals, no headways, no
 * excess wait. Those are inferences, and the point of the demo is to watch them
 * being made from consecutive snapshots — so they are made in the browser, out
 * of the same raw material the warehouse gets. Computing them here would be
 * showing the answer and calling it the method.
 */

const FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l";
const TIMEOUT_MS = 8000;

/** Stop ids the L actually calls at, so a yard move cannot invent a station. */
const KNOWN = new Set(lLine.stations.map((station) => station.id));

export type LiveTrain = {
  /** The trip id, which is the only stable identity a train has for a day. */
  id: string;
  /** `N` toward 8 Av, `S` toward Canarsie. */
  direction: "N" | "S";
  /** Station id (no direction suffix) this train is at or heading for. */
  stop: string | null;
  /** `STOPPED_AT`, `INCOMING_AT` or `IN_TRANSIT_TO`, straight from the feed. */
  status: string | null;
  /**
   * Seconds behind schedule at its next stop, as the MTA reports it. This is
   * the agency's own number against its own timetable, not something derived
   * here, and it is the one thing on the diagram encoded by appearance rather
   * than by position — bunching is what excess wait measures.
   */
  delay: number | null;
  /** Predicted arrivals ahead of it, nearest first. Epoch seconds. */
  predictions: { stop: string; at: number }[];
};

export type LivePayload = {
  /** The feed header's own timestamp. The event time. */
  generatedAt: number;
  /** When this server fetched it. Never the event time; see the MTA repo. */
  fetchedAt: number;
  trains: LiveTrain[];
};

/** `L03N` → `L03`, and the direction it was carrying. */
function split(stopId: string): { stop: string; direction: "N" | "S" } | null {
  const tail = stopId.slice(-1);
  if (tail !== "N" && tail !== "S") return null;
  const stop = stopId.slice(0, -1);
  return KNOWN.has(stop) ? { stop, direction: tail } : null;
}

/**
 * `current_status` off the wire, as a name.
 *
 * protobufjs hands enums back as their numeric value unless it is asked
 * otherwise, and `1` reaching the browser as a status is a value nothing can
 * compare against — the client checks for `STOPPED_AT` to decide whether to
 * draw a train standing at a platform or creeping toward one, and a silent
 * mismatch there puts every stationary train slightly in the wrong place.
 * Both forms are accepted because which one arrives depends on how the message
 * is serialised downstream.
 */
const STATUS = ["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"] as const;

function statusName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return STATUS[value] ?? null;
  return null;
}

/** protobufjs returns int64 as a Long object or a string, depending. */
function seconds(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  const long = value as { low: number; high: number };
  if (typeof long.low === "number") return long.high * 2 ** 32 + long.low;
  return 0;
}

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(FEED, {
      signal: controller.signal,
      // Next would otherwise cache this fetch and serve the same snapshot for
      // as long as the route lives, which is the one thing it must not do.
      cache: "no-store",
      headers: { "user-agent": "adityaaryan.in subway demo" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `The MTA feed answered ${response.status}.` },
        { status: 502 },
      );
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    const feed =
      GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

    // Predictions come from TripUpdate; where a train *is* comes from
    // VehiclePosition. They are separate entities keyed by the same trip id,
    // so they are collected separately and joined at the end.
    const predictions = new Map<string, LiveTrain["predictions"]>();
    const direction = new Map<string, "N" | "S">();
    const delay = new Map<string, number>();
    const placed = new Map<string, { stop: string | null; status: string | null }>();

    for (const entity of feed.entity) {
      const update = entity.tripUpdate;
      if (update?.trip?.tripId) {
        const id = update.trip.tripId;
        const ahead: LiveTrain["predictions"] = [];
        for (const stop of update.stopTimeUpdate ?? []) {
          const at = seconds(stop.arrival?.time);
          const parsed = stop.stopId ? split(stop.stopId) : null;
          if (!at || !parsed) continue;
          direction.set(id, parsed.direction);
          // The delay on the nearest stop is the one that describes the train.
          if (!ahead.length && typeof stop.arrival?.delay === "number") {
            delay.set(id, stop.arrival.delay);
          }
          ahead.push({ stop: parsed.stop, at });
        }
        if (ahead.length) predictions.set(id, ahead);
      }

      const vehicle = entity.vehicle;
      if (vehicle?.trip?.tripId) {
        const parsed = vehicle.stopId ? split(vehicle.stopId) : null;
        if (parsed) direction.set(vehicle.trip.tripId, parsed.direction);
        placed.set(vehicle.trip.tripId, {
          stop: parsed?.stop ?? null,
          status: statusName(vehicle.currentStatus),
        });
      }
    }

    const trains: LiveTrain[] = [];
    for (const [id, ahead] of predictions) {
      const where = placed.get(id);
      const heading = direction.get(id);
      if (!heading) continue;
      trains.push({
        id,
        direction: heading,
        // A trip with no VehiclePosition yet still has predictions; fall back
        // to the nearest stop it is predicting, which is where it is going.
        stop: where?.stop ?? ahead[0]?.stop ?? null,
        status: where?.status ?? null,
        delay: delay.get(id) ?? null,
        predictions: ahead.slice(0, 8),
      });
    }

    const payload: LivePayload = {
      generatedAt: seconds(feed.header?.timestamp),
      fetchedAt: Math.floor(Date.now() / 1000),
      trains,
    };

    return NextResponse.json(payload, {
      headers: {
        "cache-control":
          "public, s-maxage=20, stale-while-revalidate=40, max-age=0",
      },
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "The MTA feed did not answer in time."
          : "The MTA feed could not be read.",
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
