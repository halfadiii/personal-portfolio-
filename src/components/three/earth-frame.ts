/**
 * The shot: where the globe ends up on screen, as numbers on their own.
 *
 * Its own file, and that is the whole point of the file. `earthDisc` is needed
 * by the relay that hands this scene over to the moon, and importing it from
 * EarthScene meant importing EarthScene — which is to say three.js, which is to
 * say 250 kB of it landing in the first load of the home page and quietly
 * undoing the `next/dynamic` boundary the scene is behind. Arithmetic has no
 * business dragging a renderer in with it.
 */

/**
 * The shot, as numbers something outside this file can also use.
 *
 * These were literals inside the frame loop, which was fine while the globe was
 * the only thing that needed to know where the globe is. The moon now comes out
 * from behind it, and a moon placed against a remembered idea of the framing
 * drifts away from the planet the moment either is touched. One source.
 */
export const LENS = 32;
export const RANGE = { far: 4.5, near: 0.75 };
/**
 * Where the globe sits in the frame, as a fraction of it: 0 is left/top.
 *
 * Into the empty half on a wide screen; high and back on a narrow one, which
 * puts the text on sky and the limb above it. Both axes read the same way round
 * now. The vertical used to be stored inverted — 0.78 meaning 22% down — which
 * cost nothing while the globe was alone in the frame and 0.5 on every wide
 * screen, and was wrong the moment something else had to be placed against it:
 * the moon spent its first portrait outing orbiting a point 470px below the
 * planet it was meant to be coming out from behind.
 */
export const AIM = { wide: { x: 0.71, y: 0.5 }, narrow: { x: 0.5, y: 0.22 } };
/** Below this, the frame is treated as portrait and the camera stands back. */
export const WIDE_AT = 1024;

/** How far back the camera stands, for a given progress and frame shape. */
export function standoff(progress: number, width: number, height: number) {
  const raw = RANGE.far - progress * RANGE.near;
  const shape = width / Math.max(1, height);
  return shape < 1 ? raw * Math.min(1.55, 0.8 / shape) : raw;
}

/**
 * Where the globe is drawn, in CSS pixels: centre and diameter.
 *
 * Exported for the relay that hands this scene over to the moon. Progress
 * defaults to 1 because that is the only value it has by the time anything
 * outside asks — the trail is finished and the camera has stopped moving.
 */
export function earthDisc(width: number, height: number, progress = 1) {
  const distance = standoff(progress, width, height);
  const halfH = Math.tan((LENS * Math.PI) / 360) * distance;
  const aim = width >= WIDE_AT ? AIM.wide : AIM.narrow;
  return {
    x: aim.x * width,
    y: aim.y * height,
    // Radius one in world units, against the half-frame it is measured in.
    d: (height / halfH) * 1,
  };
}

