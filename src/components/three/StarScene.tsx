"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";

/**
 * The star, close enough to see the surface.
 *
 * This is what the centre of the hero system turns into when you click it. It
 * is a different picture from the one in the about section: that one is the
 * photosphere in white light, granulation and sunspots, which is the Sun as a
 * camera sees it. This is the chromosphere in H-alpha — the layer just above,
 * photographed through a filter a tenth of a nanometre wide — which is the Sun
 * as it is usually photographed when someone wants it to look like this.
 *
 * ## Why the surface is threads and not cells
 *
 * In white light the surface is granulation: packed convection cells with dark
 * lanes between them, drawn with a Worley field.
 * In H-alpha you are looking at gas held by the magnetic field, and the field
 * is smooth, so what you see is *fibrils* — hair, lying in long curving strands
 * that follow the field lines and swirl around the active regions.
 *
 * The shape comes from level sets. Take a smooth scalar field over the sphere
 * and slice it finely: the contours are long meandering curves that never
 * cross, they crowd where the field steepens, and they are hair. That is the
 * same `abs(2n - 1)` ridge that was exactly the wrong answer for granulation —
 * a maze of curves that never close — and it is exactly the right one here.
 *
 * ## Why it is baked
 *
 * This fills the screen. Full screen at a 1.6 pixel ratio on a laptop is around
 * five megapixels, and the surface above is a dozen fbm evaluations deep — live,
 * that is tens of milliseconds a frame and the fans come on. So the whole
 * surface is generated once into a cube map and after that a frame is one
 * texture fetch and some arithmetic. The bake happens while the screen is
 * fading to black, so the one expensive moment is spent where there is nothing
 * to see anyway.
 *
 * What still runs live is the part that has to: the corona and the prominences
 * standing off the limb, which move. They are an annulus rather than a disc,
 * and the shader leaves early everywhere the photosphere is in front of them.
 */

/**
 * Cube face size for the baked surface. Six of these, generated once.
 *
 * 768 rather than 1024 because the extra was not visible and the wait was. Six
 * faces at 1024 is half a second of solid main-thread work, and although that
 * happens behind an opaque screen where nothing can stutter, it is still half a
 * second of black before the star arrives. At 768 the same bake is around three
 * hundred milliseconds, and the disc is still sampled at roughly two texels per
 * screen pixel on a large display — so the strands are resolution-limited by
 * the screen rather than by this.
 */
const SURFACE_SIZE = 768;

/**
 * Radius of the shell the atmosphere is marched inside, in solar radii.
 *
 * This is geometry, not a picture: a sphere around the star which a view ray
 * enters at the front and walks through. It has to reach past the corner of the
 * frame, because anything it does not cover is atmosphere that is not there.
 */
const REACH = 1.85;

/** Cube face size for the baked magnetic field. Low frequency, so small. */
const FIELD_SIZE = 256;

/** Half the frame height, in sphere radii. Room for the prominences. */
const FRAME = 1.34;

/**
 * Half the frame *width* in portrait, where width is the binding constraint.
 *
 * Tighter than FRAME on purpose. Sized to clear the prominences on both sides,
 * a phone gives the disc three quarters of its width and a third of its height,
 * which is a small sun in a lot of black. Letting the corona run off the sides
 * costs nothing — it is a fringe, and the photograph this is built from is a
 * crop through the limb anyway — and buys a disc that fills the screen it is on.
 */
const FRAME_NARROW = 1.16;

/** Seconds for the star to swell into frame when it opens. */
const INTRO_SECONDS = 1.15;

/** Scale the star starts at, roughly the size it was on the ring. */
const INTRO_FROM = 0.28;

/** How far the pointer tips the star, in radians. */
const SWAY = 0.06;
const EASE = 1.8;

/** Cubic in-out — starts and ends at rest. */
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const NOISE = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      sum += noise3(p) * amp;
      p *= 2.07;
      amp *= 0.5;
    }
    return sum;
  }

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  float worley(vec3 p) {
    vec3 base = floor(p);
    float best = 9.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 cell = base + vec3(float(x), float(y), float(z));
          vec3 seed = cell + hash33(cell);
          vec3 away = p - seed;
          best = min(best, dot(away, away));
        }
      }
    }
    return sqrt(best);
  }
`;

const SURFACE_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The generator. Runs six times at bake and never again, which is what pays
 * for the octave counts in here.
 *
 * Nothing in this is view dependent. Limb darkening, the rim, and the colour
 * ramp all depend on where the camera is and all happen per frame; what gets
 * stored is only what is true of the surface itself.
 *
 *   R  chromosphere intensity, everything composited
 *   G  a fine strand field on its own, so the live shader has something to
 *      breathe with that is not just a brightness wobble over the whole disc
 *   B  how magnetically active this patch is, which tints as well as brightens
 */
const SURFACE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;

  ${NOISE}

  /**
   * The ridge: the single level set through the middle of the noise.
   *
   * This is the whole shape of a fibril field, and it is worth being precise
   * about why, because the near miss is instructive. Slicing a smooth scalar at
   * *evenly spaced* intervals — fract(psi * pitch) — gives nested contours at a
   * regular spacing, which is a topographic map: concentric whorls around every
   * local maximum, and it reads as a fingerprint.
   *
   * Taking one contour per noise cell instead gives one long meandering curve
   * per cell, which is hair. The centre is the noise's own midpoint rather than
   * 0.5, because three octaves of a [0,1] noise sum to at most 0.875 and a
   * ridge cut at 0.5 sits off to one side of the distribution.
   */
  float ridge(float n, float sharpness) {
    return pow(clamp(1.0 - abs(n - 0.44) * 2.4, 0.0, 1.0), sharpness);
  }

  void main() {
    vec3 n = normalize(vDirection);

    /*
     * The swirl.
     *
     * Bending the space the strands are measured in is what gives them
     * direction. It replaces an earlier attempt to squash the sample space
     * along a tangent flow field, which could not work: every sample here is
     * radial, a tangent is perpendicular to it by construction, and the
     * projection onto the flow is therefore identically zero. A warp has no
     * such degeneracy — it displaces the sample point rather than projecting
     * it, so it bends the strands wherever it points.
     */
    vec3 warp = vec3(
      fbm(n * 3.4 + vec3(3.1), 3),
      fbm(n * 3.4 + vec3(17.4), 3),
      fbm(n * 3.4 + vec3(31.7), 3)
    ) - 0.5;

    // The hair, at two scales. The fine one is the texture; the coarse one is
    // the larger structure it lies in.
    float fine = ridge(fbm(n * 168.0 + warp * 34.0, 3), 2.7);
    float coarse = ridge(fbm(n * 63.0 + warp * 17.0, 3), 1.7);

    // Supergranulation. In H-alpha the cell walls are where the field is swept
    // to and the gas is brightest, so the network is the *boundary* — far from
    // a seed rather than near one.
    float cell = worley(n * 12.0);
    float network = smoothstep(0.30, 0.66, cell);

    // Active regions: plage, the bright magnetic ground around a sunspot group.
    // Named 'region' rather than the obvious thing because 'active' is a
    // reserved word in GLSL ES, and a shader that uses it does not compile —
    // it bakes six black faces and says nothing.
    float region = fbm(n * 2.9 + vec3(4.4, 1.2, 8.8), 4);
    float plage = smoothstep(0.52, 0.68, region);

    // Filaments: cool gas suspended on the field, seen against the bright disc
    // and therefore dark. The same ridge, far coarser and far sharper, so it
    // comes out as a few long curves rather than a texture — and only where
    // there is field to hold it up.
    float filament =
      smoothstep(0.62, 0.93, ridge(fbm(n * 13.0 + warp * 7.0, 3), 3.2)) *
      smoothstep(0.42, 0.58, region);

    // Sunspot cores, inside the busiest plage.
    float spot = smoothstep(0.655, 0.700, region);

    // A broad unevenness under everything else. Without it the disc is one
    // tone with detail on top; the real thing is lighter and darker across
    // whole quarters of itself.
    float broad = fbm(n * 1.7 + vec3(88.0), 3) - 0.44;

    float heat =
      0.37
      + 0.33 * fine
      + 0.16 * coarse
      + 0.09 * network
      + 0.22 * plage
      + 0.13 * broad
      - 0.30 * filament
      - 0.38 * spot;

    // Fine grain, so the strands do not end at a hard resolution.
    heat += (fbm(n * 430.0, 2) - 0.5) * 0.06;

    gl_FragColor = vec4(clamp(heat, 0.0, 1.0), fine, region, 1.0);
  }
`;

/**
 * The magnetic field, baked.
 *
 * Two things the atmosphere needs to know about every point on the surface:
 * which way the field runs there, and how strong it is. Both are smooth and
 * slowly varying, which is why this cube is a third the size of the surface one
 * and costs almost nothing to generate.
 *
 * The activity in alpha is the *same* field the photosphere uses for its plage
 * and its filaments. That is the point: a prominence is the same structure as a
 * filament, seen from the side rather than from above, so both have to come out
 * of one field or the disc and the limb disagree about where the sun is active.
 *
 *   RGB  the field direction here, lying in the surface
 *   A    how magnetically active it is
 */
const FIELD_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;

  ${NOISE}

  void main() {
    vec3 d = normalize(vDirection);

    // Three noises make an arbitrary smooth vector field; subtracting the
    // radial part leaves what lies in the surface.
    vec3 g = vec3(
      fbm(d * 2.2 + vec3(11.2), 3),
      fbm(d * 2.2 + vec3(37.7), 3),
      fbm(d * 2.2 + vec3(61.3), 3)
    ) - 0.5;
    vec3 t = g - d * dot(g, d);
    float len = length(t);
    t = len > 1e-4 ? t / len : normalize(cross(d, vec3(0.0, 1.0, 0.0)));

    float region = fbm(d * 2.9 + vec3(4.4, 1.2, 8.8), 4);

    gl_FragColor = vec4(t * 0.5 + 0.5, region);
  }
`;

const PHOTOSPHERE_VERT = /* glsl */ `
  varying vec3 vDirection;
  varying vec3 vNormalView;
  void main() {
    vDirection = normalize(position);
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PHOTOSPHERE_FRAG = /* glsl */ `
  precision highp float;
  uniform samplerCube uSurface;
  uniform float uTime;
  varying vec3 vDirection;
  varying vec3 vNormalView;

  /**
   * H-alpha is one line, so this is one colour at a range of brightnesses
   * rather than a spectrum — which is why a filtered sun photograph is always
   * monochrome orange. The ramp runs from near-black in a filament to a hot
   * cream in the middle of a plage.
   */
  vec3 haColour(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c = mix(vec3(0.055, 0.008, 0.002), vec3(0.30, 0.045, 0.008), smoothstep(0.00, 0.20, t));
    c = mix(c, vec3(0.62, 0.145, 0.020), smoothstep(0.16, 0.38, t));
    c = mix(c, vec3(0.90, 0.335, 0.065), smoothstep(0.34, 0.56, t));
    c = mix(c, vec3(0.99, 0.545, 0.175), smoothstep(0.52, 0.74, t));
    c = mix(c, vec3(1.00, 0.760, 0.420), smoothstep(0.70, 0.88, t));
    c = mix(c, vec3(1.00, 0.925, 0.720), smoothstep(0.86, 1.00, t));
    return c;
  }

  void main() {
    vec4 s = textureCube(uSurface, normalize(vDirection));

    // The surface is fixed, but the chromosphere is not still — so the stored
    // strand field is breathed in and out against the composite, phased by how
    // active the patch is so the whole disc does not pulse together.
    float heat = s.r + (s.g - 0.45) * 0.085 * sin(uTime * 0.22 + s.b * 21.0);

    // One in the middle of the disc, zero at the limb. The camera is
    // orthographic, so the view direction is constant and this is just the
    // normal leaning away.
    float mu = clamp(vNormalView.z, 0.0, 1.0);

    // Limb darkening. Looking at the edge, the line of sight leaves the sun
    // higher up, where the gas is cooler and thinner.
    heat *= 0.30 + 0.70 * pow(mu, 0.58);

    vec3 colour = haColour(heat);

    // Limb reddening: the edge is a different colour as well as a darker one.
    colour = mix(colour, colour * vec3(1.06, 0.62, 0.34), 1.0 - pow(mu, 0.42));

    // The rim. Right at the edge the disc is not the surface any more, it is
    // the chromosphere seen sideways — optically thick, and the brightest
    // H-alpha on the whole sun.
    colour += vec3(1.00, 0.40, 0.14) * smoothstep(0.30, 0.015, mu) * 0.85;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

const SHELL_VERT = /* glsl */ `
  varying vec3 vObject;
  void main() {
    vObject = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The atmosphere, marched.
 *
 * The first version of this was a flat quad behind the sphere, and it looked
 * like one. Everything it drew was a function of how far a pixel sat from the
 * middle of the screen, so the tongues stood at screen angles rather than at
 * places on the sun, they did not turn when the surface turned underneath them,
 * and none of it had any depth. It was a picture of a corona pasted behind a
 * ball.
 *
 * This is a volume. The mesh is a sphere around the star, and each fragment
 * walks its own view ray through the shell between the surface and the outer
 * edge, adding up what it passes through. That one change buys most of what was
 * missing, because it is what is actually happening:
 *
 *   - Everything is sampled in the star's own frame, so the whole atmosphere
 *     turns with the surface. A tongue belongs to the patch of sun it stands on
 *     and goes round with it.
 *   - Prominences stand where the field is, read from the baked field cube —
 *     the same activity that puts plage and filaments on the disc.
 *   - Each one is anchored at a footpoint and leans over as it rises, along the
 *     field, because that is what plasma on a loop does. Height enters the lean
 *     quadratically, so a tongue arcs rather than tilting.
 *   - Plasma drifts along the loop over time, so the structure evolves rather
 *     than shimmering in place.
 *
 * ## Why it costs less than it sounds
 *
 * Nothing inside the disc is marched at all. A ray whose closest approach to the
 * centre is under one solar radius has the photosphere in front of it, and
 * anything suspended over the disc is seen in absorption rather than emission —
 * which is a filament, and the filaments are already in the baked surface. So
 * the march runs on an annulus and the whole disc leaves on the second line.
 *
 * The other saving is that the ray is straight and the camera is orthographic,
 * so a ray that misses the sphere cannot be occluded by it. There is no
 * visibility test anywhere in here, only a distance.
 */
const SHELL_FRAG = /* glsl */ `
  precision highp float;
  uniform samplerCube uField;
  uniform float uTime;
  uniform vec3  uRay;
  varying vec3 vObject;

  ${NOISE}

  /**
   * Outer edge of the marched plasma, in solar radii.
   *
   * A third of a radius is around two hundred thousand kilometres, which is
   * taller than all but the rarest prominence. Marching further was marching
   * empty space and paying for it twice: once in samples, and once in the
   * dither that low densities over long chords leave behind.
   */
  const float SHELL = 1.30;
  /**
   * Steps along the chord.
   *
   * This and the sheet thickness are one decision, not two. A sheet thinner
   * than the step gets hit by some rays and missed by their neighbours, and
   * what that produces is not a thin sheet — it is grain, at pixel scale, which
   * reads as noise rather than as anything solar. Either the step comes down to
   * meet the sheet or the sheet goes up to meet the step, and stepping finely
   * enough to resolve an eighth-of-a-range level set would take about a hundred
   * and fifty samples. So the sheet is a quarter of the range instead, the step
   * is halved, and the jitter turns what is left into softness rather than
   * banding.
   *
   * Kept as low as that allows, because a loop in GLSL is unrolled before it is
   * compiled — every step is another copy of the body in the program, and the
   * compile is the longest single stall in opening the star.
   */
  const int STEPS = 32;
  /**
   * How fast suspended plasma thins with height.
   *
   * A scale height of a thirteenth of a radius puts most of the material inside
   * fifty thousand kilometres of the surface, which is where a real quiescent
   * prominence keeps most of its mass. Slower than this and the star wears the
   * atmosphere as a shroud rather than standing tongues on it.
   */
  const float SCALE_HEIGHT = 11.0;

  /** How much plasma is at this point in the atmosphere. */
  float plasma(vec3 x, float rr) {
    float h = rr - 1.0;
    vec3 d = x / rr;

    vec4 f = textureCube(uField, d);

    /*
     * Where a prominence is allowed to stand.
     *
     * A band rather than a threshold, and that is the physics rather than a
     * tuning: prominences form on polarity inversion lines — the boundary
     * between opposite magnetic polarities — not in the middle of an active
     * region. Threshold the activity instead and they pile up in the centre of
     * every plage, which is the one place the real ones are not, and the limb
     * comes out ringed evenly all the way round.
     *
     * It is also the same rule that puts filaments on the disc, so a prominence
     * seen at the limb is the same object that would read as a dark thread if
     * it happened to be facing us.
     */
    float stand =
      smoothstep(0.45, 0.51, f.a) * (1.0 - smoothstep(0.55, 0.64, f.a));
    if (stand <= 0.002) return 0.0;

    vec3 tangent = normalize(f.rgb * 2.0 - 1.0);

    /*
     * The arc.
     *
     * Rising plasma is carried along the field, and the further it has risen the
     * further it has been carried — so the offset grows faster than the height,
     * and the tongue bends over instead of leaning straight.
     *
     * How far it gets carried varies with the local field rather than being one
     * number everywhere. With a single lean every footpoint in a region throws
     * its arc at the same angle and the same radius, and what comes out is a set
     * of evenly nested rings — an arcade drawn by a machine. Tying the reach to
     * the field strength gives neighbouring loops different spans, which is what
     * makes a real arcade look like a bundle rather than a diagram.
     *
     * The last term is flow along the loop, which is what makes it evolve.
     */
    float reach = 1.3 + 2.0 * f.a;
    vec3 q = x + tangent * (h * reach + h * h * reach * 2.2 + uTime * 0.0032);

    /*
     * Stand the structures up.
     *
     * Keeping less than half of the radial coordinate makes the noise vary
     * slowly with height and quickly across it, so a feature is tall and narrow
     * rather than round — which is the shape a prominence has, because the field
     * holding it up runs that way. This is the same anisotropy that was a no-op
     * on the surface, and it works here for the reason it failed there: these
     * sample points have a radial component to compress.
     */
    vec3 qs = q - d * (dot(q, d) * 0.38);

    // Thin enough to be a sheet, thick enough for the march to resolve it.
    // Frequencies chosen against the step, not by eye. The chord is walked in
    // steps of about a twenty-fifth of a radius, so detail finer than that is
    // not resolved — it is sampled at random and comes back as streaks. The
    // body sits at about an eighth of a radius and the carve at a fifteenth,
    // both comfortably above the step, which is why this reads as structure
    // rather than as grain.
    float body = fbm(qs * 8.5, 3);
    float sheet = pow(clamp(1.0 - abs(body - 0.44) * 4.5, 0.0, 1.0), 2.0);

    // Cut the sheet into separate blades. Without this it is one continuous
    // surface wrapped round the active field, and a continuous surface at this
    // scale reads as mist rather than as a dozen separate tongues.
    float carve = fbm(qs * 15.0, 2);
    sheet *= smoothstep(0.30, 0.52, carve);

    return sheet * stand * exp(-h * SCALE_HEIGHT);
  }

  void main() {
    vec3 p = vObject;

    // Closest approach of this ray to the centre: the impact parameter, and the
    // only geometry this shader needs.
    float alongC = -dot(p, uRay);
    vec3 c = p + uRay * alongC;
    float rs = length(c);

    /*
     * Where the atmosphere stops, and why it does not stop at the limb.
     *
     * The photosphere is opaque and in front of everything here, so the obvious
     * cut is exactly at one radius. That leaves a dotted ring on the limb, and
     * the reason is antialiasing: on the silhouette the disc only partly covers
     * its pixels, and the fraction it does not cover has nothing behind it,
     * because this shader discarded there. Every other pixel on that circle
     * gets a different fraction, so the seam comes out as dots rather than as a
     * line.
     *
     * So the atmosphere is carried a little way *under* the disc and faded out
     * there. Those pixels are already covered by opaque photosphere, so the only
     * thing the extra reaches is the sliver the disc left, which is exactly what
     * needed filling.
     */
    if (rs < 0.985) discard;

    float hLimb = rs - 1.0;
    vec3 dLimb = c / rs;
    vec4 fl = textureCube(uField, dLimb);

    // Spicules: the fine bristle of jets standing all the way round the limb,
    // ten thousand kilometres tall and gone in minutes, which is what stops the
    // edge reading as a drawn circle. Short enough that marching them would
    // spend twenty-eight samples on a fringe two pixels deep.
    float bristle = fbm(dLimb * 58.0 + vec3(0.0, 0.0, uTime * 0.018), 2);
    float spicules =
      exp(-hLimb * 72.0) * pow(max(bristle - 0.42, 0.0) * 3.2, 1.6) * 2.4;

    // The inner corona, brighter over active field.
    float halo = exp(-hLimb * 9.0) * (0.10 + 0.18 * fl.a);
    float far = exp(-hLimb * 2.4) * 0.03;

    /*
     * And the loops, which are the part that has to be a volume.
     *
     * There is deliberately no early-out here on whether this ray grazes active
     * field, although one is very tempting and did in fact go in. It cannot
     * work. The closest-approach direction depends only on the *angle* of the
     * pixel around the centre and not on its distance from it — every pixel on
     * a line out from the middle of the star grazes the limb at the same place.
     * So any test on the field there is constant along that whole line, and
     * thresholding it does not skip quiet regions: it cuts the atmosphere into
     * hard-edged pie slices, which is exactly what it looked like.
     *
     * The march is cheap enough without it. Skipping the disc is what pays for
     * this shader, and that is a geometric test rather than a field one.
     */
    float loops = 0.0;
    if (rs < SHELL) {
      float halfChord = sqrt(max(SHELL * SHELL - rs * rs, 0.0));
      float stepLen = (2.0 * halfChord) / float(STEPS);
      // Offset by a per-pixel fraction of a step. Without it every ray samples
      // the same heights and the atmosphere comes out in shells.
      float jitter = hash13(vec3(gl_FragCoord.xy, 1.0));
      vec3 begin = c - uRay * halfChord + uRay * (stepLen * jitter);
      for (int i = 0; i < STEPS; i++) {
        vec3 x = begin + uRay * (stepLen * float(i));
        float rr = length(x);
        if (rr < 1.0 || rr > SHELL) continue;
        // Emission, so it simply adds: no ordering, no absorption. At these
        // densities H-alpha out here is close enough to optically thin.
        loops += plasma(x, rr) * stepLen;
      }
    }
    loops *= 34.0;

    float glow = (halo + spicules + loops + far) * smoothstep(0.985, 1.0, rs);
    // Out to the edge of the shell and no further, or the atmosphere ends on a
    // circle that is really the geometry showing.
    glow *= 1.0 - smoothstep(1.42, 1.80, rs);

    // Coloured by which of the two is doing the work rather than by how far out
    // the pixel is. Tint by radius and the prominences come out orange the
    // moment they overlap the bright inner corona, which is where they all
    // start — they are hydrogen, and hydrogen is red wherever it is standing.
    vec3 hAlpha = vec3(1.00, 0.17, 0.07);
    vec3 hot = vec3(1.00, 0.72, 0.40);
    float lit = loops + spicules;
    float share = lit / max(lit + halo, 0.0001);
    vec3 colour = mix(hot, hAlpha, clamp(share, 0.0, 1.0));

    gl_FragColor = vec4(colour * glow, 1.0);
  }
`;

/** Generates the surface once, six faces of it, and hands back the cube. */
function useBakedSurface() {
  const gl = useThree((state) => state.gl);
  const [surface, setSurface] = useState<THREE.CubeTexture | null>(null);

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(SURFACE_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      // Intensity and masks, not colour. Pushing them through a colour space
      // on the way in and back out again would bend all three.
      colorSpace: THREE.NoColorSpace,
    });

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(5, 64, 48);
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      // The default blend multiplies what a shader writes by its own alpha and
      // mixes it into what was there. Right for a translucent surface, wrong
      // here, where the channels are three separate fields.
      blending: THREE.NoBlending,
    });
    scene.add(new THREE.Mesh(geometry, material));

    new THREE.CubeCamera(0.1, 20, target).update(gl, scene);

    geometry.dispose();
    material.dispose();
    setSurface(target.texture);

    return () => {
      setSurface(null);
      target.dispose();
    };
  }, [gl]);

  return surface;
}

/**
 * Generates the magnetic field once and hands back the cube.
 *
 * No mipmaps, and not only because the field is too smooth to alias. This one
 * is read from inside a loop, and a cube fetch in non-uniform control flow has
 * no defined derivative to pick a mip level from — so a mipmapped sampler there
 * is undefined behaviour that happens to work on some drivers.
 */
function useBakedField() {
  const gl = useThree((state) => state.gl);
  const [field, setField] = useState<THREE.CubeTexture | null>(null);

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(FIELD_SIZE, {
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      colorSpace: THREE.NoColorSpace,
    });

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(5, 48, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: SURFACE_VERT,
      fragmentShader: FIELD_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    scene.add(new THREE.Mesh(geometry, material));

    new THREE.CubeCamera(0.1, 20, target).update(gl, scene);

    geometry.dispose();
    material.dispose();
    setField(target.texture);

    return () => {
      setField(null);
      target.dispose();
    };
  }, [gl]);

  return field;
}

/**
 * Sets the frame. Orthographic, because a sphere this close in perspective
 * has a limb that is not where the geometry says it is, and the whole picture
 * here is about the limb.
 */
function Frame() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const aspect = size.width / Math.max(size.height, 1);
    // Landscape is bound by height, portrait by width.
    const halfHeight =
      aspect < 1 ? FRAME_NARROW / Math.max(aspect, 0.4) : FRAME;
    ortho.left = -halfHeight * aspect;
    ortho.right = halfHeight * aspect;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

function Star({
  pointer,
  drift,
  onReady,
}: {
  pointer: React.RefObject<{ x: number; y: number }>;
  drift: boolean;
  onReady: () => void;
}) {
  const surface = useBakedSurface();
  const field = useBakedField();
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const intro = useRef(0);
  const announced = useRef(false);

  // Reused every frame rather than allocated: this runs sixty times a second.
  const scratch = useMemo(
    () => ({ turn: new THREE.Quaternion(), look: new THREE.Vector3() }),
    [],
  );

  // Rebuilt when the bake lands, so the material is compiled with the cube
  // already bound. Handing a shader a null samplerCube and filling it in
  // afterwards leaves it sampling the empty texture three substituted at
  // compile time — which reads back as zero, and a sun whose every channel is
  // zero is a black disc with a corona around it.
  const photosphere = useMemo(
    () => ({ uSurface: { value: surface }, uTime: { value: 0 } }),
    [surface],
  );
  // Same reasoning as the photosphere: built around the texture so the program
  // is compiled with it bound.
  const shell = useMemo(
    () => ({
      uField: { value: field },
      uTime: { value: 0 },
      uRay: { value: new THREE.Vector3(0, 0, -1) },
    }),
    [field],
  );

  useFrame((state, delta) => {
    // Nothing moves and nothing counts until both bakes exist, so the swell
    // starts from the first frame that has something to swell.
    if (!surface || !field) return;
    if (!announced.current) {
      announced.current = true;
      onReady();
    }

    const t = state.clock.elapsedTime;
    photosphere.uTime.value = t;
    shell.uTime.value = t;

    // Turning under its own surface, which is the one motion that says this is
    // a sphere and not a picture of one. A quarter of a degree a second: the
    // real thing takes about a month, and this is already a lie by a factor of
    // thirty thousand — any faster and it reads as a spinning ball.
    //
    // The atmosphere is inside this group, so it turns with the surface rather
    // than hanging in front of it. That is most of the difference between a
    // corona and a sticker of one.
    const turning = spin.current;
    if (turning) {
      turning.rotation.y = t * 0.02;

      // The march happens in the star's own frame, so the ray has to be carried
      // into it. Done here, once, rather than as a matrix multiply per sample:
      // the camera is orthographic, so every pixel shares one ray direction.
      turning.updateWorldMatrix(true, false);
      state.camera.getWorldDirection(scratch.look);
      turning.getWorldQuaternion(scratch.turn);
      shell.uRay.value
        .copy(scratch.look)
        .applyQuaternion(scratch.turn.invert())
        .normalize();
    }

    const node = group.current;
    if (!node) return;

    intro.current = Math.min(1, intro.current + delta / INTRO_SECONDS);
    const swell = INTRO_FROM + (1 - INTRO_FROM) * ease(intro.current);

    const step = Math.min(1, delta * EASE);
    const wantedX = drift
      ? Math.sin(t * 0.09) * SWAY * 0.5
      : -(pointer.current?.y ?? 0) * SWAY;
    const wantedY = drift
      ? Math.sin(t * 0.06) * SWAY * 0.7
      : (pointer.current?.x ?? 0) * SWAY;
    node.rotation.x += (wantedX - node.rotation.x) * step;
    node.rotation.y += (wantedY - node.rotation.y) * step;
    node.scale.setScalar(swell);
  });

  if (!surface || !field) return null;

  // The sphere is dense because its silhouette is the whole picture and it is
  // drawn a thousand pixels across; a coarser one shows flats on the limb.
  return (
    <group ref={group} scale={INTRO_FROM}>
      {/* Surface and atmosphere together, because they are one object and they
          turn as one. */}
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[1, 192, 128]} />
          <shaderMaterial
            uniforms={photosphere}
            vertexShader={PHOTOSPHERE_VERT}
            fragmentShader={PHOTOSPHERE_FRAG}
            toneMapped={false}
          />
        </mesh>

        {/* The volume the atmosphere is marched inside. Front faces only: the
            fragment is where the ray enters, and it walks in from there. */}
        <mesh>
          <sphereGeometry args={[REACH, 64, 48]} />
          <shaderMaterial
            uniforms={shell}
            vertexShader={SHELL_VERT}
            fragmentShader={SHELL_FRAG}
            side={THREE.FrontSide}
            transparent
            depthWrite={false}
            toneMapped={false}
            // Straight addition rather than three's additive preset, which
            // multiplies by alpha on the way in and clips anything brighter
            // than one. Light adds; it does not average.
            blending={THREE.CustomBlending}
            blendSrc={THREE.OneFactor}
            blendDst={THREE.OneFactor}
          />
        </mesh>
      </group>
    </group>
  );
}

export default function StarScene({
  drift = false,
  onReady,
}: {
  drift?: boolean;
  /** Fired on the first frame that has a surface to draw. */
  onReady?: () => void;
}) {
  const pointer = useRef({ x: 0, y: 0 });
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    if (drift) return;
    const onMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [drift]);

  return (
    <Canvas
      frameloop="never"
      // The surface is baked, so a frame is cheap enough to spend the pixels
      // on sharpness instead. Capped rather than uncapped: past this the disc
      // is already sampled well above what the strands carry.
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      orthographic
      camera={{ position: [0, 0, 4], near: 0.1, far: 20 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence />
      <Frame />
      <Star
        pointer={pointer}
        drift={drift}
        onReady={() => ready.current?.()}
      />
    </Canvas>
  );
}
