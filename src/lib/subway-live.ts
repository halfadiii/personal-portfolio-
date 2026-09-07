import data from "@/content/data/l-line.json";
import type { LivePayload, LiveTrain } from "@/app/api/subway/live/route";

/**
 * The L, live, and the arrival inference run against it in the browser.
 *
 * This replaced a simulation. The simulation was there because the realtime
 * feeds carry no CORS headers and a browser cannot read them; `/api/subway/live`
 * is the proxy that fixes that, and everything below now runs on the same bytes
 * the MTA is publishing this minute.
 *
 * ## What was lost, and why that is the right trade
 *
 * The simulation knew where every train actually was, so it could show how far
 * each inferred arrival landed from the truth. There is no such column here,
 * and there is no such column in production either — **that is the entire
 * premise of the project.** Nobody publishes when the train arrived. A demo
 * that could check its own work was demonstrating something the real pipeline
 * can never do.
 *
 * The method is still checked, just not here: `tests/test_pipeline.py` in the
 * pipeline's own repository builds snapshots whose answer is known by
 * construction and asserts the real SQL against them. That is a better place
 * for it than a toy running in a page, because it runs on every commit.
 *
 * ## The inference is the same three rules
 *
 * Take the last prediction a trip-stop pair carried. Require that it actually
 * vanished — here that is structural, since a pair is only considered once it
 * is missing from a later snapshot. And require that it was about to happen: a
 * prediction that disappears while still more than `GRACE_SECONDS` in the
 * future is a cancellation or a re-route, not a train pulling in.
 */

export type Station = { id: string; name: string; at: number };
export type Direction = "N" | "S";

export const STATIONS: Station[] = data.stations;
export const LINE_LENGTH = data.length;
export const DIRECTIONS = data.directions as Record<
  Direction,
  { label: string; toward: string }
>;

/** How often the browser asks for a new snapshot. The feed's own cadence. */
export const POLL_SECONDS = 30;

/**
 * A prediction that vanishes while still this far out was never an arrival.
 * The same 120 seconds the warehouse uses, and the same judgement call.
 */
export const GRACE_SECONDS = 120;

/**
 * Seconds behind schedule at which a train is drawn as late.
 *
 * Measured off the live feed rather than picked: on the L the delay
 * distribution runs median 0, upper quartile 62s, ninetieth percentile 129s,
 * worst around 300s. A sixty-second threshold therefore marks a third of the
 * fleet, which is not a signal, it is a pattern. Three minutes marks the
 * genuine outliers — about one train in eight — and is also a delay a rider
 * standing on a platform would actually notice.
 */
export const LATE_SECONDS = 180;

/** Gaps outside this are not headways: see `fct_headways` in the pipeline. */
const MIN_HEADWAY_MINUTES = 0.5;
const MAX_HEADWAY_MINUTES = 60;

const INDEX = new Map(STATIONS.map((station, i) => [station.id, i]));

export function stationIndex(id: string): number | undefined {
  return INDEX.get(id);
}

export function stationName(id: string): string {
  return STATIONS[INDEX.get(id) ?? -1]?.name ?? id;
}

/* -------------------------------------------------------------------------
   Where a train is
   ------------------------------------------------------------------------- */

/**
 * The feed does not publish a position. It publishes which stop a train is at
 * or heading for, and when it expects to get there — so a train between two
 * platforms is placed by *its own prediction*, run backwards.
 *
 * That is worth being plain about, because it is not a measurement: the mark
 * on the diagram is the feed's belief made spatial. A train the MTA thinks is
 * forty seconds from Bedford Av is drawn forty seconds short of Bedford Av,
 * and if that belief is wrong the mark is wrong in exactly the same way. Which
 * is the honest picture, and arguably the interesting one — it is the same
 * belief the arrival inference is about to be built out of.
 *
 * The run time for the current segment is taken from the feed too, where it
 * can be: the gap between the next two predicted arrivals is a predicted run
 * time, scaled here by the ratio of the segment lengths. Failing that, a
 * nominal speed, which the whole line at about fifty minutes end to end gives.
 */
const NOMINAL_UNITS_PER_SECOND = LINE_LENGTH / (50 * 60);

export type Placed = {
  train: LiveTrain;
  /** Distance along the line, in the same units as `Station.at`. */
  at: number;
  /** Station it is standing at, if it is standing at one. */
  atStation: string | null;
};

export function place(train: LiveTrain, now: number): Placed | null {
  const target = train.stop;
  if (!target) return null;
  const index = INDEX.get(target);
  if (index === undefined) return null;

  const here = STATIONS[index];
  if (train.status === "STOPPED_AT") {
    return { train, at: here.at, atStation: target };
  }

  // Coming from the platform behind it, which depends on which way it is going.
  const behind = STATIONS[train.direction === "N" ? index + 1 : index - 1];
  if (!behind) return { train, at: here.at, atStation: null };

  const span = Math.abs(here.at - behind.at);
  const due = train.predictions.find((p) => p.stop === target)?.at;
  if (!due) return { train, at: here.at, atStation: null };

  // The feed's own estimate of how long the *next* segment takes, rescaled.
  const [first, second] = train.predictions;
  let run = span / NOMINAL_UNITS_PER_SECOND;
  if (first && second) {
    const nextIndex = INDEX.get(second.stop);
    const firstIndex = INDEX.get(first.stop);
    if (nextIndex !== undefined && firstIndex !== undefined) {
      const nextSpan = Math.abs(STATIONS[nextIndex].at - STATIONS[firstIndex].at);
      const nextRun = second.at - first.at;
      if (nextSpan > 0 && nextRun > 10) run = nextRun * (span / nextSpan);
    }
  }
  run = Math.min(400, Math.max(30, run));

  const progress = Math.min(1, Math.max(0, 1 - (due - now) / run));
  return {
    train,
    at: behind.at + (here.at - behind.at) * progress,
    atStation: null,
  };
}

/* -------------------------------------------------------------------------
   The inference
   ------------------------------------------------------------------------- */

export type Arrival = {
  tripId: string;
  stop: string;
  direction: Direction;
  /** The value the prediction carried the last time it was published. */
  at: number;
  /** The poll before it vanished. */
  lastSeenAt: number;
  /** How far ahead it still was when the record went. */
  leadSeconds: number;
};

type Tracked = { at: number; seenAt: number; direction: Direction };

/**
 * Fed consecutive snapshots; emits the arrivals hiding between them.
 *
 * Deliberately a small stateful object rather than a pure function over a
 * buffer: the browser sees the feed the way the poller does, one snapshot at a
 * time and forwards only, and an inference that needed the whole history in
 * memory would not be the same inference.
 */
export class Inference {
  /** `tripId|stop` → the last prediction seen for it. */
  private open = new Map<string, Tracked>();
  readonly arrivals: Arrival[] = [];
  /** Vanished while still too far out to be an arrival. Counted, not kept. */
  discarded = 0;
  polls = 0;
  watchingSince: number | null = null;

  accept(payload: LivePayload): Arrival[] {
    const observedAt = payload.generatedAt || payload.fetchedAt;
    this.polls += 1;
    this.watchingSince ??= observedAt;

    const present = new Map<string, Tracked>();
    for (const train of payload.trains) {
      for (const prediction of train.predictions) {
        present.set(`${train.id}|${prediction.stop}`, {
          at: prediction.at,
          seenAt: observedAt,
          direction: train.direction,
        });
      }
    }

    const found: Arrival[] = [];
    for (const [key, last] of this.open) {
      if (present.has(key)) continue;
      // Gone from this snapshot. Either it arrived, or the trip was pulled.
      const [tripId, stop] = key.split("|");
      const lead = last.at - last.seenAt;
      if (lead > GRACE_SECONDS) {
        this.discarded += 1;
        continue;
      }
      found.push({
        tripId,
        stop,
        direction: last.direction,
        at: last.at,
        lastSeenAt: last.seenAt,
        leadSeconds: lead,
      });
    }

    this.open = present;
    // Newest last, so the list reads forwards in time.
    found.sort((a, b) => a.at - b.at);
    this.arrivals.push(...found);
    // A page left open all afternoon should not grow without bound.
    if (this.arrivals.length > 600) this.arrivals.splice(0, this.arrivals.length - 600);
    return found;
  }
}

/* -------------------------------------------------------------------------
   Headway and excess wait, from inferred arrivals only
   ------------------------------------------------------------------------- */

export type Metrics = {
  arrivals: number;
  headways: number;
  meanHeadway: number | null;
  /** What a rider turning up at random actually waits. */
  riderWait: number | null;
  /** The same, minus what an evenly spread service would ask. */
  excessWait: number | null;
};

/**
 * Excess wait is not the mean gap halved. Riders arrive at random, so they are
 * likelier to walk into a long gap than a short one — E[H²]/(2·E[H]) against
 * the E[H]/2 an even service would give. Bunching can leave the mean headway
 * untouched and still make the wait materially worse, and only this notices.
 */
export function metricsFor(
  arrivals: Arrival[],
  stop: string,
  direction: Direction,
): Metrics {
  const times = arrivals
    .filter((a) => a.stop === stop && a.direction === direction)
    .map((a) => a.at)
    .sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const minutes = (times[i] - times[i - 1]) / 60;
    if (minutes >= MIN_HEADWAY_MINUTES && minutes <= MAX_HEADWAY_MINUTES) {
      gaps.push(minutes);
    }
  }

  if (!gaps.length) {
    return {
      arrivals: times.length,
      headways: 0,
      meanHeadway: null,
      riderWait: null,
      excessWait: null,
    };
  }

  const sum = gaps.reduce((total, gap) => total + gap, 0);
  const sumSquares = gaps.reduce((total, gap) => total + gap * gap, 0);
  const mean = sum / gaps.length;
  const riderWait = sumSquares / (2 * sum);

  return {
    arrivals: times.length,
    headways: gaps.length,
    meanHeadway: mean,
    riderWait,
    excessWait: riderWait - mean / 2,
  };
}
