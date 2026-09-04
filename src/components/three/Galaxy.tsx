"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The background: a nebula shell and two shells of stars.
 *
 * Procedural rather than a video. A galaxy clip good enough to sit behind the
 * hero is several megabytes, it cannot react to the drag, and it would undo the
 * §8 budget on its own. Noise on the GPU costs a few kilobytes, renders at any
 * resolution, and turns with the orbit.
 *
 * Kept cold and near-monochrome on purpose: §13 rules out gradient washes, so
 * the colour here is one desaturated blue lifting off black, not a purple sweep.
 *
 * The noise is evaluated once, into a cube map, and never again — see `Nebula`.
 */

const NEBULA_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  varying vec3 vDirection;
  uniform float uTime;
  uniform float uIntensity;

  // Value noise + fbm. Cheap, and smooth enough at this scale.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  // Two octaves, not five. This runs on every pixel of the sky behind
  // everything else, so its cost is the floor under the whole scene, and the
  // rest were finer than a background wash can show. With the single detail
  // octave below that is three noise lookups a pixel instead of ten.
  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 2; i++) {
      total += noise(p) * amplitude;
      p *= 2.02;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    vec3 p = vDirection * 2.4;
    // Two layers drifting at different rates: the clouds never quite repeat.
    float base = fbm(p + vec3(uTime * 0.012, 0.0, uTime * 0.008));
    // One octave of detail rather than a second full fbm.
    float detail = noise(p * 2.7 - vec3(0.0, uTime * 0.02, 0.0)) * 0.7;
    float density = pow(max(base * 0.75 + detail * 0.35 - 0.28, 0.0), 2.1);

    // A faint band across the sphere, so it reads as a galactic plane.
    float band = 1.0 - smoothstep(0.0, 0.55, abs(vDirection.y + 0.08));
    density *= 0.35 + band * 1.5;

    vec3 deep = vec3(0.035, 0.055, 0.09);
    vec3 lit = vec3(0.16, 0.21, 0.30);
    vec3 colour = mix(deep, lit, clamp(density * 1.6, 0.0, 1.0)) * density;

    gl_FragColor = vec4(colour * uIntensity, 1.0);
  }
`;

/** Sampling the baked sky. Three lines, where the bake is thirty. */
const SKY_FRAG = /* glsl */ `
  varying vec3 vDirection;
  uniform samplerCube uSky;

  void main() {
    gl_FragColor = vec4(textureCube(uSky, normalize(vDirection)).rgb, 1.0);
  }
`;

/** Faces of the baked sky, per side. */
const SKY_SIZE = 512;

/**
 * The sky, evaluated once.
 *
 * The noise above is the most expensive thing on the site by a distance: it
 * runs on every pixel behind everything else, so its cost is the floor under
 * the whole scene, and at three noise lookups a pixel that floor is high. It
 * is also, in any given second, completely static — the clouds drift at 0.012
 * units a second across a field 2.4 units wide, which is a shape that changes
 * over a minute and not over a frame.
 *
 * So it is rendered once into a cube map at mount and sampled from there
 * afterwards. What used to be twenty-four hash lookups a pixel every frame is
 * now one texture fetch, and the drift is a slow turn of the shell instead of
 * an evolving field — which at this scale is a distinction without a
 * difference, because there is no edge anywhere in it to tell you which one
 * you are looking at.
 *
 * The one-off cost is six faces at 512², about a third of the pixels it used
 * to draw in a single frame.
 */
function useBakedSky(intensity: number) {
  const gl = useThree((state) => state.gl);
  const [sky, setSky] = useState<THREE.CubeTexture | null>(null);

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(SKY_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // A throwaway scene holding one inside-out sphere, seen from a camera at
    // its centre: exactly what the shell used to be, rendered six times.
    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(5, 48, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: intensity } },
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    scene.add(new THREE.Mesh(geometry, material));

    new THREE.CubeCamera(0.1, 20, target).update(gl, scene);

    geometry.dispose();
    material.dispose();
    setSky(target.texture);

    return () => {
      setSky(null);
      target.dispose();
    };
  }, [gl, intensity]);

  return sky;
}

export function Nebula({ intensity = 1 }: { intensity?: number }) {
  const shell = useRef<THREE.Mesh>(null);
  const sky = useBakedSky(intensity);

  const uniforms = useMemo(() => ({ uSky: { value: sky } }), [sky]);

  // The drift, now that the field itself is fixed: a turn slow enough that
  // nothing appears to move and the sky is never twice in the same place.
  useFrame((_, delta) => {
    const node = shell.current;
    if (!node) return;
    node.rotation.y += delta * 0.004;
    node.rotation.x += delta * 0.0011;
  });

  if (!sky) return null;

  return (
    <mesh ref={shell} scale={[-1, 1, 1]} frustumCulled={false}>
      <sphereGeometry args={[60, 32, 24]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={NEBULA_VERT}
        fragmentShader={SKY_FRAG}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTint;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vTint;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Twinkle: each star on its own phase, none of them in step.
    float twinkle = 0.62 + 0.38 * sin(uTime * 1.1 + aPhase);
    gl_PointSize = aSize * uPixelRatio * twinkle * (24.0 / -mv.z);
    vAlpha = twinkle;
    vTint = aTint;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vTint;

  void main() {
    // Round, soft-edged point with a bright core — no texture needed.
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float falloff = pow(1.0 - d * 2.0, 2.2);
    vec3 warm = vec3(1.0, 0.98, 0.94);
    vec3 cool = vec3(0.72, 0.82, 1.0);
    vec3 colour = mix(cool, warm, vTint);
    gl_FragColor = vec4(colour, falloff * vAlpha);
  }
`;

/** Deterministic PRNG: the sky is the same on every load and every device. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function Starfield({
  count = 4200,
  radius = 42,
  seed = 20260901,
}: {
  count?: number;
  radius?: number;
  seed?: number;
}) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const random = seeded(seed);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const tints = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Even distribution over a spherical shell, thickened a little.
      const u = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const r = radius * (0.72 + random() * 0.28);
      const planar = Math.sqrt(1 - u * u);
      positions[i * 3] = r * planar * Math.cos(theta);
      // Flatten slightly toward a galactic plane.
      positions[i * 3 + 1] = r * u * 0.62;
      positions[i * 3 + 2] = r * planar * Math.sin(theta);

      const bright = random();
      sizes[i] = 0.6 + bright * bright * 3.4;
      phases[i] = random() * Math.PI * 2;
      tints[i] = random();
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    buffer.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    buffer.setAttribute("aTint", new THREE.BufferAttribute(tints, 1));
    return buffer;
  }, [count, radius, seed]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: {
        value:
          typeof window === "undefined"
            ? 1
            : Math.min(window.devicePixelRatio, 2),
      },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (material.current) material.current.uniforms.uTime.value += delta;
    if (points.current) points.current.rotation.y += delta * 0.006;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
