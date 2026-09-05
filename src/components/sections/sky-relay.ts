/**
 * Where the two bodies are, at any scroll position.
 *
 * The Earth is the trail's scene and the Moon is the about section's; between
 * them lies experience, and this is the arithmetic that carries one into the
 * other. The Moon comes out from behind the Earth, swings clear of the limb,
 * and passes in front. From there the two trade places by size rather than by
 * opacity: the Moon grows toward the frame it is about to own while the Earth
 * draws back and shrinks behind it, until the planet is small enough to sit
 * entirely inside the Moon's disc and is simply not visible any more. Then the
 * Moon travels to the exact disc the about section draws, and hands over.
 *
 * Nothing fades out here except at the very end. A planet that dissolves is a
 * layer being turned down; a planet that recedes until something in front of it
 * covers it is two bodies with a spatial relationship, which is the thing being
 * described.
 *
 * Pure on purpose. Every number below is checkable without a browser, which
 * matters for a sequence that only exists across four sections of scrolling and
 * is otherwise inspected a screenshot at a time.
 *
 * Screen space throughout: CSS pixels, y downward, discs described by centre
 * and diameter — because that is what the caller writes onto a box, and
 * converting once here beats converting at every use.
 */

/**
 * Distance past the pinned trail over which the Moon emerges and takes over,
 * in viewports. Exported because the caller has to start the travel clock at
 * the end of it, and two copies of this number would drift.
 */
export const EMERGE = 1.15;

/** Fraction of that spent swinging out from behind, before it moves forward. */
const SWING = 0.5;

/**
 * When the Moon stops being occluded by the Earth and starts occluding it.
 *
 * The end of the swing, and not a moment before. Two canvases cannot interleave
 * in depth — one is simply in front of the other — so the swap has to happen
 * while the discs do not overlap, or a slice of moon changes which side of the
 * planet it is on between one frame and the next. `ORBIT.to` is set to buy that
 * gap: at the far end of the arc the Moon is clear of the Earth's limb, and
 * that is the only instant in the whole sequence when it is.
 */
const CROSS = 0.5;

/**
 * How far the Earth draws back, as a fraction of the size it was.
 *
 * Small enough to hide. The globe is drawn about 837px across and the Moon
 * settles at roughly 540, so anything under about a third leaves the planet
 * inside the disc in front of it — and the check below is on the geometry
 * rather than on this number, so the two cannot disagree.
 */
const EARTH_RECEDE = 0.16;

/** How far out the Moon starts, as a fraction of the Earth's radius. */
const ORBIT_FROM = 0.1;

/**
 * And the daylight it ends with, in pixels.
 *
 * The far end of the arc is not a multiple of anything: it is wherever the two
 * discs stop touching, plus a little. That was a fixed 1.68 radii, which works
 * on a laptop and is nonsense on a phone — a portrait frame stands the camera
 * back, so the globe comes out wider than the screen, and a moon that clears it
 * sideways clears the viewport with it. Solving for the gap instead gives the
 * same picture on both.
 */
const CLEAR = 26;

/**
 * The arc, in degrees, measured the usual way round with y upward.
 *
 * It goes where the room is, and the room is wherever the globe is not. On a
 * wide screen the planet is aimed into the right-hand two thirds, so the Moon
 * comes out to the left of it; on a phone it rides high, so the Moon comes down
 * underneath it instead. Same movement, different empty quarter.
 */
const ARC = {
  wide: { from: 255, to: 168 },
  narrow: { from: 200, to: 282 },
};

/** How much of the viewport the Moon fills once it has the frame. */
const HERO = { wide: 0.6, narrow: 0.74 };

/** And how big it starts, against that. */
const SEED = 0.3;

/** Scroll past the handover before the relay is fully gone. */
const HANDOVER = 0.55;

/**
 * How far the journey bows out of the straight line, as a fraction of the frame.
 *
 * A body that has just come round a planet and then slides flat across to the
 * edge stops being a body and becomes a sprite on a rail. The bow keeps it on
 * an arc — it is the same movement it arrived on, continuing — and costs one
 * sine. Perpendicular to the line it is travelling, so it works whichever way
 * the destination happens to lie.
 *
 * Kept modest because it stacks with the latch below, which also pulls the
 * Moon toward a destination that is still below the fold. Together at 0.14 they
 * put the bottom of the disc a hundred pixels under the window.
 */
const BOW = 0.09;

/**
 * How bright the Moon is while it is still crossing the page, against the 1 it
 * arrives at.
 *
 * Not a taste decision. The Moon renders very close to pure white, and it
 * crosses experience and capabilities — where the copy is steel, and where
 * capabilities is a five-column grid with no empty half to keep out of the way
 * of. Measured at full strength, headings over it came out at 1.05:1 and the
 * mono stack lines at 2.3:1. The halo underneath the type does most of the work
 * but it cannot rescue thin strokes from pure white, so the body is dimmed
 * while it is over the reading and comes up to full as it clears to the edge,
 * which is where the about section keeps it and where there is nothing to read.
 */
const VEIL = 0.42;
/*
 * Applied as brightness and not as opacity, which is not a detail.
 *
 * A half-transparent Moon in front of the Earth shows the Earth through it, and
 * the one thing this sequence has to say is that one body is in front of the
 * other. Turning the light down instead leaves it solid. Over the black of the
 * page the two are arithmetically the same — 255 at 42% and 42% of 255 are both
 * 107 — so the contrast measurements hold either way.
 */

/** The last part of the journey, over which it comes up to full. */
const UNVEIL = 0.72;

/**
 * How near the destination has to get, in viewports, before the Moon starts
 * aiming at the live element instead of at the pose it predicts for it.
 *
 * This is what stops the arrival snapping. Flying the whole way to a fixed
 * resting pose means easing to a *standstill* — smoothstep has no velocity left
 * at the end — and the thing being landed on is not standing still: it is an
 * element on a scrolling page, moving a pixel for every pixel of scroll. So the
 * Moon stopped dead and the page then picked it up at full speed: nothing to
 * twenty pixels a frame with no motion in between.
 *
 * Measured in distance rather than in progress, and that matters. Ramping it
 * over the last stretch of the *journey* aims at an element still a screen and
 * a half below the window, and the Moon sags off the bottom of the frame
 * following it down. Ramping it over the last stretch of the *approach* bounds
 * the sag: the pull toward the target is `r·(1 - smoothstep(0, L, r))`, which
 * peaks at 0.096·L however far away the thing starts — 78px here, against the
 * 370 it was diving before.
 */
const LATCH = 0.9;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => v * v * (3 - 2 * v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export type Disc = { x: number; y: number; d: number };

export type SkyPlacement = {
  /**
   * The Earth's layer: how much of its original size is left, where that size
   * is centred, and whether it is worth drawing at all. Opacity is 1 or 0 and
   * never between — it goes out by being covered, not by being faded, and the
   * 0 only arrives once the geometry says the Moon is over all of it.
   */
  earth: { x: number; y: number; scale: number; opacity: number };
  /** Null before the Moon has any business being on screen. */
  moon:
    | (Disc & { opacity: number; brightness: number; front: boolean })
    | null;
};

/**
 * @param view          Viewport, CSS pixels.
 * @param past          Pixels scrolled beyond the end of the trail's pin.
 *                      Negative while the trail is still running.
 * @param earthDisc     Where the globe is drawn, at full trail progress.
 * @param target        The about section's moon, as it stands right now, or
 *                      null when that section has not been laid out yet.
 * @param rest          Where that same disc will be at the end of the journey.
 *                      Aiming at `target` for the whole trip sends the Moon
 *                      down through the fold and back — the destination is
 *                      still a screen and a half below the window for most of
 *                      it — so the journey is flown to the resting pose and
 *                      only the last frame, where the two coincide, hands over
 *                      to the live one.
 * @param travel        Pixels of scrolling from the end of the emergence to the
 *                      point where the Moon should be sitting on `target`.
 *                      Null disables the journey and the Moon simply holds.
 * @param travelled     How many of those pixels have gone by.
 */
export function placeSky({
  view,
  past,
  earthDisc,
  target,
  rest,
  travel,
  travelled,
}: {
  view: { w: number; h: number };
  past: number;
  earthDisc: Disc;
  target: Disc | null;
  rest: Disc | null;
  travel: number | null;
  travelled: number;
}): SkyPlacement {
  const wide = view.w >= 1024;

  const still = {
    x: earthDisc.x,
    y: earthDisc.y,
    scale: 1,
    opacity: 1,
  };

  // Nothing before the pin ends. A little before, in fact, so the first frame
  // of the emergence is already behind the disc rather than appearing at its
  // edge.
  if (past < -0.02 * view.h) return { earth: still, moon: null };

  const heroD = (wide ? HERO.wide : HERO.narrow) * Math.min(view.w, view.h);
  const hero: Disc = { x: view.w * 0.5, y: view.h * (wide ? 0.46 : 0.42), d: heroD };

  const out = clamp(past / (EMERGE * view.h));
  const radius = earthDisc.d / 2;

  const arc = wide ? ARC.wide : ARC.narrow;
  // Where the swing ends: far enough out that the disc the Moon has grown to by
  // then is clear of the limb, which is the one frame in which it can change
  // which side of the planet it is on without anybody seeing.
  const swungTo = radius + (0.72 * heroD) / 2 + CLEAR;

  let disc: Disc;
  const earth = { ...still };

  if (out <= SWING) {
    // Out from behind, along an arc. The eased radius is what makes it look
    // like it is coming round the body rather than sliding out from under it.
    const k = smooth(out / SWING);
    const theta = (mix(arc.from, arc.to, k) * Math.PI) / 180;
    const rho = mix(ORBIT_FROM * radius, swungTo, k);
    disc = {
      x: earthDisc.x + Math.cos(theta) * rho,
      y: earthDisc.y - Math.sin(theta) * rho,
      d: mix(SEED, 0.72, k) * heroD,
    };
  } else {
    // Forward, into the frame it is about to own — and the planet draws back
    // behind it at the same time, on the same eased fraction, so the two read
    // as one movement rather than as a growth and a shrink that happen to
    // overlap.
    const k = smooth((out - SWING) / (1 - SWING));
    const theta = (arc.to * Math.PI) / 180;
    const from: Disc = {
      x: earthDisc.x + Math.cos(theta) * swungTo,
      y: earthDisc.y - Math.sin(theta) * swungTo,
      d: 0.72 * heroD,
    };
    disc = {
      x: mix(from.x, hero.x, k),
      y: mix(from.y, hero.y, k),
      d: mix(from.d, hero.d, k),
    };
    earth.scale = mix(1, EARTH_RECEDE, k);
    earth.x = mix(earthDisc.x, disc.x, k);
    earth.y = mix(earthDisc.y, disc.y, k);
  }

  let opacity = 1;
  let brightness = VEIL;

  // The journey to the about section, and the handover at the end of it. The
  // destination is read fresh every frame rather than solved once, because it
  // is an element on a scrolling page: it is moving too.
  if (target && rest && travel !== null && travel > 0) {
    const k = smooth(clamp(travelled / travel));
    // Landed, so follow the real thing; still flying, so aim at where it will
    // be. At the moment `k` reaches 1 these are the same disc, which is what
    // makes the change of destination invisible.
    /*
     * The predicted pose while the destination is far off, the live element as
     * it arrives. They are the same disc at the moment of arrival — the lock is
     * *defined* as the scroll position that centres the target — so the
     * changeover has nothing to show, and the Moon inherits the element's
     * motion rather than having to be picked up from a standstill.
     */
    const left = Math.max(0, travel - travelled);
    const latch = 1 - smooth(clamp(left / (LATCH * view.h)));
    const dest = {
      x: mix(rest.x, target.x, latch),
      y: mix(rest.y, target.y, latch),
      d: mix(rest.d, target.d, latch),
    };
    const flat = {
      x: mix(disc.x, dest.x, k),
      y: mix(disc.y, dest.y, k),
      d: mix(disc.d, dest.d, k),
    };
    // Perpendicular to the run, peaking in the middle and exactly zero at both
    // ends — so neither the departure nor the arrival is moved by it.
    const runX = dest.x - disc.x;
    const runY = dest.y - disc.y;
    const len = Math.hypot(runX, runY) || 1;
    const bow = Math.sin(Math.PI * k) * BOW * view.h;
    disc = {
      x: flat.x + (-runY / len) * bow,
      y: flat.y + (runX / len) * bow,
      d: flat.d,
    };
    // The planet is riding inside the Moon by now, so it goes wherever it goes.
    earth.x = mix(earth.x, disc.x, k);
    earth.y = mix(earth.y, disc.y, k);
    brightness = mix(VEIL, 1, smooth(clamp((k - UNVEIL) / (1 - UNVEIL))));

    const over = travelled - travel;
    if (over > 0) opacity = 1 - clamp(over / (HANDOVER * view.h));
  }

  /*
   * Is any of the planet still outside the Moon?
   *
   * Asked of the geometry rather than assumed from the timeline, because the
   * two discs are sized from different things — the globe from a camera, the
   * Moon from whatever box the about section happens to give it — and a
   * constant chosen to look right at one window size is wrong at the next. Once
   * the answer is no there is nothing to draw, and the layer can stop.
   */
  const front = out > CROSS;
  const covered =
    front &&
    Math.hypot(earth.x - disc.x, earth.y - disc.y) + radius * earth.scale <=
      disc.d / 2;
  if (covered) earth.opacity = 0;

  return {
    earth,
    moon: { ...disc, opacity, brightness, front },
  };
}
