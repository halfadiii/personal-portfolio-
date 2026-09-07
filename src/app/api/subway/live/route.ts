import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export const runtime = "nodejs";
// The fetch below gives up at 8s; this leaves headroom for the decode without
// letting a hung upstream hold a function open.
export const maxDuration = 15;
/*
 * Regenerated at most every twenty seconds, and cached in between.
 *
 * This started as `dynamic = "force-dynamic"` with an explicit
 * `s-maxage=20` header, and that quietly did the opposite of what it said:
 * force-dynamic makes Next replace the response's cache-control with
 * `max-age=0`, so the header was stripped, every edge request was a MISS, and
 * every visitor's poll reached the MTA directly. Verified on the deployed
 * site, not assumed — `x-vercel-cache: MISS` on consecutive requests is what
 * gave it away.
 *
 * `revalidate` is the mechanism that actually holds. It also stops the other
 * failure: with no dynamic API in the handler, Next would otherwise be free to
 * evaluate this at build time and serve one frozen snapshot forever.
 */
export const revalidate = 20;

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
 * ## The caching is doing real work
 *
 * A twenty-second revalidation window means the edge answers almost every
 * request and the MTA is asked about three times a minute — the same three
 * times whether one person is watching or a thousand. That is the difference
 * between a demo and a nuisance: a public feed does not owe anyone unlimited
 * requests, and a page that hammers it on every visitor is one that deserves
 * to be blocked. It also absorbs the feed's slow moments, which are real.
 *
 * ## What is returned, and what is deliberately not
 *
 * Positions and predictions, and nothing derived. No arrivals, no headways, no
 * excess wait. Those are inferences, and the point of the demo is to watch them
 * being made from consecutive snapshots — so they are made in the browser, out
 * of the same raw material the warehouse gets. Computing them here would be
 * showing the answer and calling it the method.
 */

const BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";

/**
 * All eight of them. The MTA splits the subway by line group, so a picture of
 * the whole system is eight fetches — run together, they cost about as long as
 * the slowest one rather than the sum. Measured: 241ms for all eight, 443 KB
 * of protobuf, about 500 trains.
 */
const FEEDS = ["", "-ace", "-bdfm", "-g", "-jz", "-nqrw", "-l", "-si"];
const TIMEOUT_MS = 8000;

/**
 * How many predictions each train carries out of here.
 *
 * The map needs two — where a train is heading and the stop after it, which is
 * what the run time is estimated from. The strip diagram needs the L's full
 * horizon, because the beam *is* those predictions. Sending eight for all five
 * hundred trains would quadruple the payload to draw six stems.
 */
const HORIZON = (route: string | null) => (route === "L" ? 8 : 2);

export type LiveTrain = {
  /** The trip id, which is the only stable identity a train has for a day. */
  id: string;
  /** Route it is running, e.g. `L`, `6`, `FS`. */
  route: string;
  /** The direction letter the feed puts on its stop ids. */
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
  /** How many of the eight endpoints answered. Reported, not hidden. */
  feeds: { asked: number; answered: number };
  trains: LiveTrain[];
};

/**
 * `L03N` → `L03`, and the direction it was carrying.
 *
 * Deliberately not checked against a station list. The L's own stops are known
 * here, but every other route's are not, and a route handler that silently
 * dropped stops it did not recognise would be making a decision the client is
 * better placed to make — it has the geometry, so it knows what it can draw.
 */
function split(stopId: string): { stop: string; direction: "N" | "S" } | null {
  const tail = stopId.slice(-1);
  if (tail !== "N" && tail !== "S") return null;
  return { stop: stopId.slice(0, -1), direction: tail };
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

/** One feed, decoded, or null if it could not be had. Never throws. */
async function pull(
  suffix: string,
  signal: AbortSignal,
): Promise<InstanceType<
  typeof GtfsRealtimeBindings.transit_realtime.FeedMessage
> | null> {
  try {
    const response = await fetch(BASE + suffix, {
      signal,
      // Matches the route's own window. `no-store` here would force the whole
      // route dynamic again and undo the caching above.
      next: { revalidate: 20 },
      headers: { "user-agent": "adityaaryan.in subway demo" },
    });
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
  } catch {
    // One endpoint having a bad afternoon costs that endpoint's trains, not
    // the response. The same rule the pipeline's own poller follows.
    return null;
  }
}

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const feeds = await Promise.all(
      FEEDS.map((suffix) => pull(suffix, controller.signal)),
    );
    const alive = feeds.filter((feed) => feed !== null);
    if (!alive.length) {
      return NextResponse.json(
        { error: "The MTA feeds could not be read." },
        { status: 502 },
      );
    }

    // Predictions come from TripUpdate; where a train *is* comes from
    // VehiclePosition. They are separate entities keyed by the same trip id,
    // so they are collected separately and joined at the end.
    const predictions = new Map<string, LiveTrain["predictions"]>();
    const route = new Map<string, string>();
    const direction = new Map<string, "N" | "S">();
    const delay = new Map<string, number>();
    const placed = new Map<
      string,
      { stop: string | null; status: string | null }
    >();

    let generatedAt = 0;

    for (const feed of alive) {
      generatedAt = Math.max(generatedAt, seconds(feed.header?.timestamp));

      for (const entity of feed.entity) {
        const update = entity.tripUpdate;
        if (update?.trip?.tripId) {
          const id = update.trip.tripId;
          const on = update.trip.routeId ?? "";
          if (on) route.set(id, on);
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
          const id = vehicle.trip.tripId;
          const on = vehicle.trip.routeId ?? "";
          if (on) route.set(id, on);
          const parsed = vehicle.stopId ? split(vehicle.stopId) : null;
          if (parsed) direction.set(id, parsed.direction);
          placed.set(id, {
            stop: parsed?.stop ?? null,
            status: statusName(vehicle.currentStatus),
          });
        }
      }
    }

    const trains: LiveTrain[] = [];
    for (const [id, ahead] of predictions) {
      const where = placed.get(id);
      const heading = direction.get(id);
      const on = route.get(id);
      if (!heading || !on) continue;
      trains.push({
        id,
        route: on,
        direction: heading,
        // A trip with no VehiclePosition yet still has predictions; fall back
        // to the nearest stop it is predicting, which is where it is going.
        stop: where?.stop ?? ahead[0]?.stop ?? null,
        status: where?.status ?? null,
        delay: delay.get(id) ?? null,
        predictions: ahead.slice(0, HORIZON(on)),
      });
    }

    const payload: LivePayload = {
      generatedAt,
      fetchedAt: Math.floor(Date.now() / 1000),
      feeds: { asked: FEEDS.length, answered: alive.length },
      trains,
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "The MTA feeds could not be read." },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
