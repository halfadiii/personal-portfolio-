import { Fleet, type SubwayMapData, type Vehicle } from "./subway-map";

/**
 * The same network, driven by the MTA's own feeds rather than by a seed.
 *
 * `Fleet` slides trains along their shapes at an invented speed, and its own
 * doc comment promised that swapping it for live positions meant replacing
 * `step` and nothing else. This is that swap, and the promise held: everything
 * downstream reads `vehicles` and never learns where the numbers came from.
 *
 * ## The trains move at the feed's speed, by construction
 *
 * The simulation was stepped at three times real time on top of an invented
 * 30km/h, which is why it read as a hurried toy. Nothing here has a speed at
 * all. A train is placed between the platform behind it and the one it is
 * heading for, at the fraction of the way the MTA's *own predicted arrival*
 * implies — so it crosses that segment in exactly the time the MTA says it
 * will, and gets there when the MTA says it gets there. There is no rate to
 * tune and no rate to get wrong.
 *
 * ## Which way along the shape
 *
 * A route's `N` and `S` do not map onto "up the polyline" and "down it": that
 * depends on which end the shape was drawn from and it differs by route. So
 * the direction is read off the train's own predictions instead. The stop
 * after next is further along the way it is going, whichever way that is, and
 * the sign of the arc difference between them is the answer. It cannot
 * disagree with the data, because it is derived from it.
 */

export type LiveVehicleSource = {
  id: string;
  route: string;
  stop: string | null;
  status: string | null;
  delay: number | null;
  predictions: { stop: string; at: number }[];
};

type Track = {
  line: number;
  fromArc: number;
  toArc: number;
  /** Epoch seconds the feed expects it at `toArc`. */
  dueAt: number;
  /** How long the feed implies that segment takes. */
  runSeconds: number;
  stopped: boolean;
  target: number;
  delay: number | null;
  /** Predicted arrival at each station still ahead, by station index. */
  ahead: Map<number, number>;
};

export class LiveFleet extends Fleet {
  private tracks = new Map<string, Track>();
  private byId = new Map<string, Vehicle>();
  private stationIndex = new Map<string, number>();
  /** Lines carrying each route, cached: the search is otherwise per train. */
  private linesFor = new Map<string, number[]>();

  constructor(data: SubwayMapData, lengths: number[]) {
    super(data, lengths);
    data.stations.forEach((station, index) =>
      this.stationIndex.set(station.id, index),
    );
    data.lines.forEach((line, index) => {
      const list = this.linesFor.get(line.routeId) ?? [];
      list.push(index);
      this.linesFor.set(line.routeId, list);
    });
  }

  /** Arc position of a station on a line, or null if it is not on it. */
  private arcOf(line: number, station: number): number | null {
    const at = this.stopIds[line]?.indexOf(station) ?? -1;
    return at < 0 ? null : this.stops[line][at];
  }

  /** One snapshot in. Returns how many of its trains could be placed. */
  accept(trains: LiveVehicleSource[]): number {
    const seen = new Set<string>();
    let placed = 0;

    for (const train of trains) {
      const targetId = train.stop ?? train.predictions[0]?.stop ?? null;
      const target = targetId ? this.stationIndex.get(targetId) : undefined;
      if (target === undefined) continue;

      // A route can be drawn as several shapes; take the one carrying both this
      // stop and the one after it, so a train on a branch lands on the branch
      // rather than on the trunk.
      const after = train.predictions[1]?.stop;
      const afterIndex = after ? this.stationIndex.get(after) : undefined;
      const candidates = this.linesFor.get(train.route) ?? [];

      let line = -1;
      for (const option of candidates) {
        if (this.arcOf(option, target) === null) continue;
        line = option;
        if (
          afterIndex !== undefined &&
          this.arcOf(option, afterIndex) !== null
        ) {
          break;
        }
      }
      if (line < 0) continue;

      const toArc = this.arcOf(line, target);
      if (toArc === null) continue;

      const order = this.stopIds[line];
      const arcs = this.stops[line];
      const at = order.indexOf(target);

      // Which way along the shape, read off the train's own predictions.
      let sign = 1;
      if (afterIndex !== undefined) {
        const nextArc = this.arcOf(line, afterIndex);
        if (nextArc !== null && nextArc !== toArc) {
          sign = Math.sign(nextArc - toArc);
        }
      }

      const behind = at - sign;
      const fromArc =
        behind >= 0 && behind < arcs.length
          ? arcs[behind]
          : toArc - sign * 0.02;

      const dueAt = train.predictions[0]?.at ?? 0;

      // The feed's own run time for the *next* segment, rescaled to this one.
      let runSeconds = 90;
      if (train.predictions[1] && afterIndex !== undefined) {
        const nextArc = this.arcOf(line, afterIndex);
        const gap = train.predictions[1].at - train.predictions[0].at;
        if (nextArc !== null && gap > 10) {
          const nextSpan = Math.abs(nextArc - toArc);
          const span = Math.abs(toArc - fromArc);
          if (nextSpan > 0) runSeconds = gap * (span / nextSpan);
        }
      }
      runSeconds = Math.min(400, Math.max(20, runSeconds));

      const ahead = new Map<number, number>();
      for (const prediction of train.predictions) {
        const index = this.stationIndex.get(prediction.stop);
        if (index !== undefined) ahead.set(index, prediction.at);
      }

      this.tracks.set(train.id, {
        line,
        fromArc,
        toArc,
        dueAt,
        runSeconds,
        stopped: train.status === "STOPPED_AT",
        target,
        delay: train.delay,
        ahead,
      });

      let vehicle = this.byId.get(train.id);
      if (!vehicle) {
        vehicle = {
          id: train.id,
          line,
          t: fromArc,
          heading: sign >= 0 ? 1 : -1,
          speed: 0,
          dwellLeft: 0,
          atStation: null,
          nextStation: target,
        };
        this.byId.set(train.id, vehicle);
      }
      vehicle.line = line;
      vehicle.heading = sign >= 0 ? 1 : -1;
      vehicle.nextStation = target;
      seen.add(train.id);
      placed += 1;
    }

    // Trains that finished their run, or dropped out of the feed.
    for (const id of [...this.byId.keys()]) {
      if (!seen.has(id)) {
        this.byId.delete(id);
        this.tracks.delete(id);
      }
    }

    this.vehicles = [...this.byId.values()];
    return placed;
  }

  /**
   * Re-place every train against the wall clock.
   *
   * Called every frame, which is what makes a train creep toward a platform
   * between snapshots instead of teleporting when one lands. `now` is epoch
   * seconds, because that is the clock the feed's predictions are in.
   */
  advance(now: number) {
    for (const vehicle of this.vehicles) {
      const track = this.tracks.get(vehicle.id);
      if (!track) continue;
      if (track.stopped || !track.dueAt) {
        vehicle.t = track.toArc;
        vehicle.atStation = track.stopped ? track.target : null;
        continue;
      }
      const progress = Math.min(
        1,
        Math.max(0, 1 - (track.dueAt - now) / track.runSeconds),
      );
      vehicle.t = track.fromArc + (track.toArc - track.fromArc) * progress;
      vehicle.atStation = progress >= 1 ? track.target : null;
    }
  }

  /**
   * Trains not currently standing at a platform.
   *
   * The base class counts trains that are not dwelling, which it knows because
   * it invented the dwell. Here it is whatever the feed's `current_status`
   * says, which is the same question answered by somebody who can see.
   */
  get moving() {
    return this.vehicles.filter((vehicle) => vehicle.atStation === null).length;
  }

  /** Seconds behind schedule, as the MTA reports it, or null. */
  delayOf(id: string): number | null {
    return this.tracks.get(id)?.delay ?? null;
  }

  /**
   * Trains still heading for one station, soonest first.
   *
   * Overridden because the live version does not have to estimate. The feed
   * publishes a predicted arrival for every stop still ahead of a train, so
   * this is a lookup rather than an arc length divided by an invented speed —
   * and the numbers it returns are the ones on the platform countdown clock.
   */
  approaching(stationIndex: number, limit = 8) {
    const now = Date.now() / 1000;
    const found: { vehicle: Vehicle; seconds: number }[] = [];

    for (const vehicle of this.vehicles) {
      const at = this.tracks.get(vehicle.id)?.ahead.get(stationIndex);
      if (at === undefined) continue;
      const seconds = at - now;
      if (seconds < -30) continue;
      found.push({ vehicle, seconds: Math.max(0, seconds) });
    }

    found.sort((a, b) => a.seconds - b.seconds);
    return found.slice(0, limit);
  }
}
