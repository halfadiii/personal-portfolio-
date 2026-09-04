/**
 * What is in the sky over New York right now, and how it is lit.
 *
 * Two questions, both answered from the clock rather than from a guess. Which
 * body is up is a matter of where the sun is, which is astronomy and is worth
 * doing properly — "day is six until six" is wrong by an hour and a half in
 * June and wrong the other way in December, and a site that puts a sun in the
 * sky at half past seven on a January evening has told a small lie about the
 * one thing it was claiming to know.
 */

/** Where the clock on this page is. */
export const PLACE = { latitude: 40.7128, longitude: -74.006 };

const RAD = Math.PI / 180;
const DAY = 86_400_000;

/** Days since J2000.0 — 2000-01-01 12:00 UTC. */
function daysSinceJ2000(at: Date): number {
  return (at.getTime() - Date.UTC(2000, 0, 1, 12)) / DAY;
}

/**
 * How high the sun is above the horizon, in degrees. Negative means down.
 *
 * The low-precision solar position from the Astronomical Almanac: mean
 * longitude and anomaly, two terms of the equation of centre, then a rotation
 * into the horizon frame. Good to about a hundredth of a degree, which is
 * around a second of sunrise — far past what a picture of a sun needs, and
 * cheap enough to run on every tick.
 */
export function sunAltitude(at: Date = new Date()): number {
  const d = daysSinceJ2000(at);

  const meanLongitude = (280.46 + 0.9856474 * d) * RAD;
  const meanAnomaly = (357.528 + 0.9856003 * d) * RAD;

  // The orbit is an ellipse, so the sun runs ahead of its mean position for
  // half the year and behind it for the other half.
  const ecliptic =
    meanLongitude +
    1.915 * RAD * Math.sin(meanAnomaly) +
    0.02 * RAD * Math.sin(2 * meanAnomaly);

  const obliquity = (23.439 - 0.0000004 * d) * RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(ecliptic),
    Math.cos(ecliptic),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));

  // Greenwich mean sidereal time, then carried west to the observer.
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const localSidereal = (gmst * 15 + PLACE.longitude) * RAD;
  const hourAngle = localSidereal - rightAscension;

  const latitude = PLACE.latitude * RAD;
  const sine =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);

  return Math.asin(Math.max(-1, Math.min(1, sine))) / RAD;
}

/**
 * Which body to draw.
 *
 * The boundary is the sun's centre on the horizon rather than the moment the
 * last of it disappears, because the alternative is arguing about refraction
 * for a picture. Twilight is nobody's idea of daytime.
 */
export function skyBody(at: Date = new Date()): "sun" | "moon" {
  return sunAltitude(at) > 0 ? "sun" : "moon";
}

/* -------------------------------------------------------------------------
   The moon.
   ------------------------------------------------------------------------- */

/** Mean length of one new moon to the next, in days. */
const SYNODIC = 29.530588853;

/** A new moon that actually happened: 2000-01-06 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export type MoonPhase = {
  /** 0 at new, 0.5 at full, wrapping back to 1 at the next new. */
  phase: number;
  /** How much of the disc is lit, 0 to 1. */
  illumination: number;
  /** Days since the last new moon. */
  age: number;
  /** What an almanac would call it. */
  name: string;
  /** True while the lit edge is growing. */
  waxing: boolean;
};

/**
 * The eight names, by which eighth of the cycle the moon is in — except that
 * the four singular ones (new, both quarters, full) are moments rather than
 * stretches, so they get a narrow window and the crescents and gibbous phases
 * get the rest.
 */
function nameFor(phase: number): string {
  if (phase < 0.02 || phase > 0.98) return "New moon";
  if (phase < 0.23) return "Waxing crescent";
  if (phase < 0.27) return "First quarter";
  if (phase < 0.48) return "Waxing gibbous";
  if (phase < 0.52) return "Full moon";
  if (phase < 0.73) return "Waning gibbous";
  if (phase < 0.77) return "Last quarter";
  return "Waning crescent";
}

/**
 * The phase, from the mean synodic month against a known new moon — the same
 * arithmetic an almanac uses for a printed calendar.
 *
 * It is not an ephemeris. The Moon's orbit is eccentric and perturbed, so the
 * real new moon wanders around this by up to about half a day. At the size
 * this is drawn, half a day of phase is a couple of pixels of terminator, and
 * the alternative is shipping an orbital model to move a shadow nobody can
 * measure.
 */
export function moonPhase(at: Date = new Date()): MoonPhase {
  const days = (at.getTime() - NEW_MOON) / DAY;
  // `%` keeps the sign of the dividend, and this has to work before 2000.
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;

  return {
    phase,
    // The lit fraction of the disc is the projection of a half-lit sphere,
    // which is a cosine and not the linear ramp people expect.
    illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2,
    age,
    name: nameFor(phase),
    waxing: phase < 0.5,
  };
}

/**
 * Where to put the sun for that phase, as seen by a camera on +Z looking at
 * the origin.
 *
 * New moon puts the sun behind the moon and the near side goes dark; full moon
 * puts it behind the viewer. A quarter puts it out to the side, which is why a
 * half moon is lit on its edge rather than its top. The small tilt in Y is the
 * ecliptic not being edge-on to us — without it the terminator is a perfectly
 * vertical line, which never quite happens and reads as a graphic.
 */
export function sunDirection(phase: number): [number, number, number] {
  const a = 2 * Math.PI * phase;
  const tilt = 0.14;
  return [Math.sin(a), tilt, -Math.cos(a)];
}
