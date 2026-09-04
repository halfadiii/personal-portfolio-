/**
 * A working model of the thing the NYC subway pipeline has to do.
 *
 * The MTA never publishes an arrival. It publishes predictions, and a train
 * that has arrived simply stops appearing in the feed for that stop. The
 * project's `ingest/watch.py` exists to sit and watch that happen once:
 *
 *     "Polls one feed every 30 seconds and tracks a single train... so you can
 *      watch the numbers get revised -- and watch a stop DROP OFF the list the
 *      moment the train passes it. That drop-off is the whole project."
 *
 * This simulates trains on a line, generates the feed they would produce, and
 * then runs the same inference the pipeline runs against it. Because the
 * simulation knows where every train actually is, it can also show how far the
 * inference lands from the truth — which the real feed can never tell you.
 *
 * It is a simulation of the mechanism, not measured service data, and the page
 * says so. Station names and the feed registry are real; the trains are not.
 */

export type Station = {
  id: string;
  name: string;
  /** Distance from the northern terminal, in kilometres. */
  km: number;
};

/**
 * The L: Eighth Avenue to Canarsie. Chosen because it is a single line with no
 * branches, so headway at a station is unambiguous. Distances are approximate
 * spacings along the route, not surveyed track mileage.
 */
export const L_LINE: Station[] = [
  ["8 Av", 0],
  ["6 Av", 0.8],
  ["Union Sq–14 St", 1.5],
  ["3 Av", 2.2],
  ["1 Av", 2.8],
  ["Bedford Av", 4.0],
  ["Lorimer St", 4.8],
  ["Graham Av", 5.4],
  ["Grand St", 6.0],
  ["Montrose Av", 6.7],
  ["Morgan Av", 7.5],
  ["Jefferson St", 8.3],
  ["DeKalb Av", 9.1],
  ["Myrtle–Wyckoff Avs", 9.9],
  ["Halsey St", 10.7],
  ["Wilson Av", 11.4],
  ["Bushwick Av–Aberdeen St", 12.1],
  ["Broadway Junction", 13.0],
  ["Atlantic Av", 13.7],
  ["Sutter Av", 14.5],
  ["Livonia Av", 15.2],
  ["New Lots Av", 15.9],
  ["East 105 St", 16.8],
  ["Canarsie–Rockaway Pkwy", 17.6],
].map(([name, km], i) => ({
  id: `L${String(i).padStart(2, "0")}`,
  name: name as string,
  km: km as number,
}));

export const LINE_LENGTH_KM = L_LINE[L_LINE.length - 1].km;

/** How far ahead the feed publishes predictions, as `watch.py` follows six. */
const HORIZON_STOPS = 6;
/** The real feeds refresh roughly every thirty seconds. */
export const POLL_SECONDS = 30;

const CRUISE_KMH = 32;
const DWELL_SECONDS = 26;
/** A prediction that vanishes while still this far out was never an arrival. */
const CANCELLATION_GRACE = 120;

export type Train = {
  id: string;
  km: number;
  /** Index of the next station this train has not yet reached. */
  next: number;
  dwellLeft: number;
  /** Seconds behind schedule; drives both speed and prediction error. */
  delay: number;
  speedFactor: number;
  /** True arrival time per station index — the simulation's ground truth. */
  arrivals: Map<number, number>;
  /** Set when the train has run the whole line and left service. */
  retired: boolean;
};

export type Prediction = { station: number; at: number };

export type PollSnapshot = {
  t: number;
  /** trainId → the stops it is currently predicting, nearest first. */
  trips: Map<string, Prediction[]>;
};

export type InferredArrival = {
  trainId: string;
  station: number;
  /** The value the prediction carried the last time it was published. */
  inferredAt: number;
  /** When the pipeline last saw it — the poll before it vanished. */
  lastSeenAt: number;
  /** What actually happened. Available here, never available in production. */
  trueAt: number;
  /** `inferredAt - trueAt`, in seconds. */
  errorSeconds: number;
};

export type SimOptions = {
  /** Seconds between train departures from the terminal. */
  headwaySeconds: number;
  seed: number;
};

export class SubwaySim {
  t = 0;
  trains: Train[] = [];
  polls: PollSnapshot[] = [];
  inferred: InferredArrival[] = [];
  /** Vanished while still comfortably in the future: dropped, not an arrival. */
  discarded = 0;

  private nextDeparture = 0;
  private nextPollAt = 0;
  private serial = 0;
  private random: () => number;

  constructor(private options: SimOptions) {
    this.random = seeded(options.seed);
  }

  /** Advance the world by `dt` simulated seconds. */
  step(dt: number) {
    this.t += dt;

    if (this.t >= this.nextDeparture) {
      this.depart();
      // Real departures are not metronomic; ±12% keeps headways honest.
      this.nextDeparture =
        this.t + this.options.headwaySeconds * (0.88 + this.random() * 0.24);
    }

    for (const train of this.trains) this.advance(train, dt);
    this.trains = this.trains.filter((train) => !train.retired);

    if (this.t >= this.nextPollAt) {
      this.poll();
      this.nextPollAt = this.t + POLL_SECONDS;
    }
  }

  /** Hold one train at its platform, the way a sick passenger does. */
  injectDelay(seconds = 150) {
    const running = this.trains.filter((train) => train.next > 1);
    if (running.length === 0) return null;
    const victim = running[Math.floor(this.random() * running.length)];
    victim.dwellLeft += seconds;
    victim.delay += seconds;
    return victim.id;
  }

  private depart() {
    this.serial += 1;
    this.trains.push({
      id: `L${String(this.serial).padStart(3, "0")}`,
      km: 0,
      next: 0,
      dwellLeft: 0,
      delay: 0,
      // Not every train runs the line at the same rate.
      speedFactor: 0.92 + this.random() * 0.16,
      arrivals: new Map(),
      retired: false,
    });
  }

  private advance(train: Train, dt: number) {
    if (train.dwellLeft > 0) {
      train.dwellLeft = Math.max(0, train.dwellLeft - dt);
      return;
    }

    const kmPerSecond = (CRUISE_KMH * train.speedFactor) / 3600;
    train.km += kmPerSecond * dt;

    // A delayed train recovers a little on every run between stops.
    if (train.delay > 0) train.delay = Math.max(0, train.delay - dt * 0.06);

    while (train.next < L_LINE.length && train.km >= L_LINE[train.next].km) {
      train.arrivals.set(train.next, this.t);
      train.dwellLeft = DWELL_SECONDS * (0.8 + this.random() * 0.5);
      train.next += 1;
      if (train.next >= L_LINE.length) {
        train.retired = true;
        return;
      }
      break;
    }
  }

  /**
   * One poll of the feed: what the agency currently believes about every train
   * in service, for its next few stops.
   */
  private poll() {
    const trips = new Map<string, Prediction[]>();

    for (const train of this.trains) {
      const predictions: Prediction[] = [];
      const last = Math.min(train.next + HORIZON_STOPS, L_LINE.length);

      for (let station = train.next; station < last; station += 1) {
        const distance = L_LINE[station].km - train.km;
        if (distance < 0) continue;

        const kmPerSecond = (CRUISE_KMH * train.speedFactor) / 3600;
        const stopsBetween = station - train.next;
        const travel =
          distance / kmPerSecond +
          stopsBetween * DWELL_SECONDS +
          train.dwellLeft;

        // Error grows with how far ahead the guess is, which is why the
        // numbers visibly converge as a train closes on a platform.
        const horizon = stopsBetween + 1;
        const noise = (this.random() - 0.5) * 2 * (6 + horizon * 9);

        predictions.push({ station, at: this.t + travel + noise });
      }

      if (predictions.length) trips.set(train.id, predictions);
    }

    const snapshot: PollSnapshot = { t: this.t, trips };
    const previous = this.polls[this.polls.length - 1];
    if (previous) this.infer(previous, snapshot);

    this.polls.push(snapshot);
    if (this.polls.length > 40) this.polls.shift();
  }

  /**
   * The inference, exactly as `int_inferred_arrivals.sql` states it: take the
   * last observation in which a (trip, stop) pair was still predicted, read the
   * arrival time it was carrying, and drop anything that vanished while still
   * comfortably in the future.
   */
  private infer(previous: PollSnapshot, current: PollSnapshot) {
    for (const [trainId, before] of previous.trips) {
      const after = current.trips.get(trainId);
      const stillThere = new Set((after ?? []).map((p) => p.station));

      for (const prediction of before) {
        if (stillThere.has(prediction.station)) continue;

        if (prediction.at > previous.t + CANCELLATION_GRACE) {
          this.discarded += 1;
          continue;
        }

        const train = this.trains.find((candidate) => candidate.id === trainId);
        const trueAt = train?.arrivals.get(prediction.station);
        if (trueAt === undefined) {
          this.discarded += 1;
          continue;
        }

        this.inferred.push({
          trainId,
          station: prediction.station,
          inferredAt: prediction.at,
          lastSeenAt: previous.t,
          trueAt,
          errorSeconds: prediction.at - trueAt,
        });
      }
    }

    if (this.inferred.length > 400) {
      this.inferred.splice(0, this.inferred.length - 400);
    }
  }

  /** Arrivals inferred at one station, oldest first. */
  arrivalsAt(station: number): InferredArrival[] {
    return this.inferred
      .filter((arrival) => arrival.station === station)
      .sort((a, b) => a.inferredAt - b.inferredAt);
  }

  /**
   * Headways and excess wait at one station, from the inferred arrivals only —
   * the same inputs the warehouse has.
   */
  metricsAt(station: number) {
    const arrivals = this.arrivalsAt(station);
    const headways: number[] = [];
    for (let i = 1; i < arrivals.length; i += 1) {
      const gap = (arrivals[i].inferredAt - arrivals[i - 1].inferredAt) / 60;
      if (gap > 0.2 && gap < 60) headways.push(gap);
    }

    if (headways.length === 0) {
      return {
        arrivals: arrivals.length,
        headways,
        meanHeadway: 0,
        excessWait: 0,
        meanError: 0,
        worstError: 0,
      };
    }

    const sum = headways.reduce((a, b) => a + b, 0);
    const sumSquares = headways.reduce((a, b) => a + b * b, 0);
    // Riders arrive at random, so they are more likely to land inside a long
    // gap than a short one: E[H²]/2E[H] − E[H]/2.
    const excessWait = sumSquares / (2 * sum) - sum / headways.length / 2;

    const errors = arrivals.map((a) => Math.abs(a.errorSeconds));
    return {
      arrivals: arrivals.length,
      headways,
      meanHeadway: sum / headways.length,
      excessWait: Math.max(0, excessWait),
      meanError: errors.reduce((a, b) => a + b, 0) / errors.length,
      worstError: Math.max(...errors),
    };
  }

  /** The most recent polls for one train, as `watch.py` prints them. */
  watch(trainId: string, count = 8) {
    return this.polls.slice(-count).map((poll) => ({
      t: poll.t,
      predictions: poll.trips.get(trainId) ?? null,
    }));
  }

  /** The train with the most stops still ahead of it — what `watch.py` picks. */
  pickWatchTarget(): string | null {
    let best: Train | null = null;
    for (const train of this.trains) {
      if (train.next < 2 || train.next > L_LINE.length - 4) continue;
      if (!best || train.next < best.next) best = train;
    }
    return best?.id ?? this.trains[0]?.id ?? null;
  }
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** `1234` → `20:34` in the simulation's own clock. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600) % 24;
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
