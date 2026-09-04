/**
 * The moon over New York, and how it is lit.
 *
 * Answered from the clock rather than from a guess. There used to be a solar
 * position in here too, deciding whether the sky showed a sun or a moon; the
 * section only ever wanted the moon, so the sun went with it.
 */

const DAY = 86_400_000;

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
