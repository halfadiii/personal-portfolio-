import * as THREE from "three";

/**
 * Shared machinery for the cosmology scenes.
 *
 * Every stage in the story is built out of the same two things: a cloud of
 * point sprites, and a shader sphere. That is not a shortcut — it is what the
 * subject actually is. A nebula, a filament of the cosmic web, a spiral arm, an
 * accretion disc and a supernova remnant are all *distributions of glowing
 * material*, and the honest way to draw a distribution is to sample it. What
 * changes between stages is where the samples go and what colour they are.
 *
 * Everything additive, because light adds. Nothing here writes depth, and
 * nothing here needs to: emission has no front and back.
 */

/** A deterministic generator, so every visitor sees the same universe. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Normally distributed, by the polar method. Real clouds are not uniform. */
export function gauss(random: () => number): number {
  let u = 0;
  let v = 0;
  let d = 0;
  do {
    u = random() * 2 - 1;
    v = random() * 2 - 1;
    d = u * u + v * v;
  } while (d === 0 || d >= 1);
  return u * Math.sqrt((-2 * Math.log(d)) / d);
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Value noise on the CPU, for placing material rather than for shading it. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);

  const hash = (a: number, b: number, c: number) => {
    let h = a * 374761393 + b * 668265263 + c * 2147483647;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  };

  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;

  return lerp(
    lerp(
      lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u),
      lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u),
      v,
    ),
    lerp(
      lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u),
      lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u),
      v,
    ),
    w,
  );
}

export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * f, y * f, z * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/* -------------------------------------------------------------------------
   The point sprite.
   ------------------------------------------------------------------------- */

const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColour;
  attribute float aSeed;

  uniform float uTime;
  uniform float uScale;
  uniform float uPixels;
  uniform float uTwinkle;

  varying vec3 vColour;
  varying float vGlow;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // Twinkle is per-particle and slow. It is the difference between a field
    // of dots and a field of things that are burning.
    float flicker = 1.0 + uTwinkle * sin(uTime * 0.7 + aSeed * 37.0);

    // Attenuated by distance, which is what makes the depth read.
    gl_PointSize = aSize * uScale * flicker * (uPixels / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;

    vColour = aColour;
    vGlow = flicker;
  }
`;

const POINT_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uOpacity;

  varying vec3 vColour;
  varying float vGlow;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;

    // A tight core with a long tail, which is the shape a light source has
    // once it has been through a lens. One exponential rather than a power
    // chain: same curve, a fraction of the cost, and there are a lot of these.
    float a = exp(-r * 3.4) * (1.0 - r * r);

    gl_FragColor = vec4(vColour * a * vGlow * uOpacity, 1.0);
  }
`;

export type PointField = {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
};

/**
 * Builds a point cloud from parallel arrays.
 *
 * Straight addition rather than three's additive preset, which multiplies by
 * alpha on the way in and clips anything brighter than one. Overlapping
 * material has to be able to come out brighter than the material itself, or a
 * dense core looks exactly as bright as a thin edge.
 */
export function makePoints(
  positions: Float32Array,
  colours: Float32Array,
  sizes: Float32Array,
  { twinkle = 0.0 }: { twinkle?: number } = {},
): PointField {
  const count = sizes.length;
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColour", new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uScale: { value: 1 },
      uPixels: { value: 330 },
      uTwinkle: { value: twinkle },
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });

  return { geometry, material };
}

/** Writes one particle into the three parallel arrays. */
export function put(
  i: number,
  positions: Float32Array,
  colours: Float32Array,
  sizes: Float32Array,
  x: number,
  y: number,
  z: number,
  colour: THREE.Color,
  size: number,
) {
  positions[i * 3] = x;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = z;
  colours[i * 3] = colour.r;
  colours[i * 3 + 1] = colour.g;
  colours[i * 3 + 2] = colour.b;
  sizes[i] = size;
}

/** Somewhere between two colours, allocated once and reused. */
const scratch = new THREE.Color();
export function mixColour(a: THREE.Color, b: THREE.Color, t: number) {
  return scratch.copy(a).lerp(b, clamp01(t));
}
