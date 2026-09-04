"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The two visuals the scroll trail moves between.
 *
 * `Helix` is a double helix: two backbones and the base pairs between them. It
 * assembles out of eight loose filaments as the scroll advances. `Network` is
 * what the strand resolves into: nodes, dotted edges, and pulses travelling
 * along them. Loose material becoming structure, then structure carrying a
 * signal — which is the shape of the copy running beside it.
 *
 * Both are drawn as points with additive blending and a soft falloff in the
 * fragment shader. That is what gives the glow without a bloom pass, which on
 * this budget is the difference between a scene that runs on a laptop and one
 * that does not.
 */

/** Eight is a looks decision, not a measurement: enough strands to read as a
 *  tangle at this camera distance, few enough that the eye can follow them
 *  individually as they knit together. */
const FILAMENTS = 8;

/** Turns of the helix across the visible height. Together with RISE and
 *  RADIUS in the shader this holds B-DNA's real proportions: a pitch about
 *  1.7x the diameter, which is why it reads as DNA and not as a spring. */
const TURNS = 2.3;
/** Base pairs per turn in B-DNA. The rung count follows from it. */
const PAIRS_PER_TURN = 10.5;
const RUNGS = Math.round(TURNS * PAIRS_PER_TURN);
const RUNG_POINTS = 44;
const BACKBONE_POINTS = 1700;

/** Deterministic PRNG: the same shape on every load and every machine. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const GLOW_FRAG = /* glsl */ `
  varying vec3 vColour;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    // Tight core with a long tail — the shape a real glow has.
    float core = pow(1.0 - d * 2.0, 6.0);
    float halo = pow(1.0 - d * 2.0, 1.7);
    gl_FragColor = vec4(vColour, (core * 0.7 + halo * 0.5) * vAlpha);
  }
`;

const HELIX_VERT = /* glsl */ `
  attribute float aT;      // 0..1 along the axis
  attribute float aU;      // 0 on one backbone, 1 on the other, between on a rung
  attribute float aRung;   // 0 backbone, 1 base pair
  attribute float aFeed;   // which of the eight feeds this point arrived on
  attribute float aPhase;
  attribute float aSize;

  uniform float uTime;
  uniform float uSpin;     // accumulated rotation; the pointer biases its rate
  uniform float uPixelRatio;
  uniform float uProgress; // 0..1 scroll position within the trail
  uniform float uOpacity;
  uniform vec3  uPointer;  // x, y in -1..1, z = 1 while the pointer is present
  uniform vec3  uWarm;
  uniform vec3  uCool;
  uniform vec3  uPairA;
  uniform vec3  uPairB;

  varying vec3 vColour;
  varying float vAlpha;

  const float TAU = 6.2831853;
  const float RISE = 6.2;
  const float RADIUS = 0.82;
  // The two backbones sit about 140 degrees apart rather than opposite. That
  // asymmetry is the whole reason B-DNA has one wide groove and one narrow
  // one, and it is the single detail that separates a double helix from a
  // twisted ribbon.
  const float GROOVE = 2.44;

  /** Right-handed about +y, which is the handedness B-DNA actually has. */
  vec3 backbone(float t, float side) {
    float a = t * ${TURNS.toFixed(2)} * TAU + side * GROOVE + uSpin;
    return vec3(cos(a) * RADIUS, (t - 0.5) * RISE, -sin(a) * RADIUS);
  }

  /** Where this point sits before the strand assembles: one loop per feed. */
  vec3 loose(float t, float feed, float phase) {
    float a =
      t * ${TURNS.toFixed(2)} * TAU * 0.6 +
      feed * (TAU / ${FILAMENTS}.0) +
      uSpin * 0.65;
    float r = RADIUS * (1.6 + feed * 0.17) + sin(t * 7.0 + phase * TAU) * 0.12;
    return vec3(cos(a) * r, (t - 0.5) * RISE * 1.05, -sin(a) * r);
  }

  void main() {
    // The eight streams knit into one paired strand early in the trail, so the
    // helix itself is what is on screen while the copy is about the pipeline.
    float knit = smoothstep(0.0, 0.24, uProgress);

    vec3 formed = mix(backbone(aT, 0.0), backbone(aT, 1.0), aU);
    vec3 p = mix(loose(aT, aFeed, aPhase), formed, knit);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // A band that follows the cursor down the strand and lights what it
    // crosses — the poll passing over the rows it touches.
    float band =
      uPointer.z *
      (1.0 - smoothstep(0.0, 0.5, abs(p.y - uPointer.y * RISE * 0.5)));

    float twinkle = 0.6 + 0.4 * sin(uTime * 2.1 + aPhase * 6.0);
    // Base pairs only exist once there are two backbones to hang between, and
    // they zip up the strand rather than all appearing at once. This fades
    // alpha and not point size: a point scaled below a pixel simply vanishes.
    float pairIn = smoothstep(0.06 + aT * 0.12, 0.24 + aT * 0.12, uProgress);
    float present = mix(1.0, pairIn, aRung);

    gl_PointSize =
      aSize * uPixelRatio * twinkle * (1.0 + band * 1.4) * (34.0 / -mv.z);

    // Pale rungs against the warm backbones, so the ladder reads as separate
    // from the two spines it hangs between.
    vec3 rung = mix(uPairA, uPairB, abs(aU - 0.5) * 2.0);
    vec3 spine = mix(uCool, uWarm, smoothstep(0.15, 0.9, aT));
    vColour = mix(spine, rung, aRung);
    vColour = mix(vColour, uPairB, band * 0.7);

    vAlpha = twinkle * present * uOpacity * (1.0 + band * 0.8);
  }
`;

/**
 * Builds one Points geometry holding both backbones and every base pair.
 *
 * `aU` does the work: 0 puts a point on one backbone, 1 on the other, and
 * anything between lands it on the rung that spans them — so the shader places
 * all three with a single `mix` and no branching.
 */
function buildHelix() {
  const random = seeded(1312);

  const ts: number[] = [];
  const us: number[] = [];
  const rungs: number[] = [];
  const feeds: number[] = [];
  const phases: number[] = [];
  const sizes: number[] = [];

  const push = (t: number, u: number, rung: number, size: number) => {
    ts.push(t);
    us.push(u);
    rungs.push(rung);
    // Each point still belongs to one of the eight feeds; that is what it
    // flies in from before the strand assembles.
    feeds.push(Math.floor(random() * FILAMENTS));
    phases.push(random());
    sizes.push(size);
  };

  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < BACKBONE_POINTS; i += 1) {
      const bright = random();
      push(i / (BACKBONE_POINTS - 1), side, 0, 1.1 + bright * bright * 3.0);
    }
  }

  for (let r = 0; r < RUNGS; r += 1) {
    // Inset from the ends so the ladder does not run off the backbones.
    const t = (r + 0.5) / RUNGS;
    for (let k = 0; k < RUNG_POINTS; k += 1) {
      const u = k / (RUNG_POINTS - 1);
      // Thinner at the middle of the pair, which is where the bases meet.
      const taper = 0.62 + Math.abs(u - 0.5) * 1.2;
      push(t, u, 1, (1.15 + random() * 1.15) * taper);
    }
  }

  const geometry = new THREE.BufferGeometry();
  // Every position is computed in the vertex shader; this only sets the count.
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(ts.length * 3), 3),
  );
  geometry.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  geometry.setAttribute("aU", new THREE.Float32BufferAttribute(us, 1));
  geometry.setAttribute("aRung", new THREE.Float32BufferAttribute(rungs, 1));
  geometry.setAttribute("aFeed", new THREE.Float32BufferAttribute(feeds, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  // The shader places every point, so the bounds cannot be derived.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  return geometry;
}

export function Helix({
  progressRef,
  opacityRef,
  pointerRef,
}: {
  progressRef: React.RefObject<number>;
  opacityRef: React.RefObject<number>;
  /** x/y in -1..1 over the section, and whether a pointer is on it at all. */
  pointerRef?: React.RefObject<{ x: number; y: number; on: number }>;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const smooth = useRef({ x: 0, y: 0, on: 0 });

  const geometry = useMemo(buildHelix, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uPixelRatio: {
        value:
          typeof window === "undefined"
            ? 1
            : Math.min(window.devicePixelRatio, 2),
      },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uPointer: { value: new THREE.Vector3() },
      uWarm: { value: new THREE.Color("#ff8a3d") },
      uCool: { value: new THREE.Color("#ffd9a8") },
      uPairA: { value: new THREE.Color("#fff1da") },
      uPairB: { value: new THREE.Color("#ffb168") },
    }),
    [],
  );

  useFrame((_, delta) => {
    const m = material.current;
    const target = pointerRef?.current ?? { x: 0, y: 0, on: 0 };
    // Ease toward the cursor rather than tracking it: a pointer sample per
    // frame is noisy, and the strand should feel weighted.
    const k = 1 - Math.exp(-5 * delta);
    smooth.current.x += (target.x - smooth.current.x) * k;
    smooth.current.y += (target.y - smooth.current.y) * k;
    smooth.current.on += (target.on - smooth.current.on) * k;

    if (m) {
      m.uniforms.uTime.value += delta;
      // Moving the cursor left or right winds the strand faster or backwards,
      // which is the part a visitor discovers by accident and then plays with.
      m.uniforms.uSpin.value +=
        delta * (0.17 + smooth.current.x * smooth.current.on * 0.85);
      m.uniforms.uProgress.value = progressRef.current ?? 0;
      m.uniforms.uOpacity.value = opacityRef.current ?? 1;
      m.uniforms.uPointer.value.set(
        smooth.current.x,
        smooth.current.y,
        smooth.current.on,
      );
      m.visible = (opacityRef.current ?? 1) > 0.01;
    }

    if (group.current) {
      // A slow lean, so the strand reads as an object rather than a texture,
      // tipped a little toward wherever the cursor is.
      group.current.rotation.z =
        Math.sin((performance.now() / 1000) * 0.13) * 0.07 +
        smooth.current.x * smooth.current.on * 0.14;
      group.current.rotation.x = -smooth.current.y * smooth.current.on * 0.12;
    }
  });

  return (
    <group ref={group}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={HELIX_VERT}
          fragmentShader={GLOW_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

const NETWORK_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute float aKind;   // 0 edge dot, 1 node, 2 travelling pulse
  attribute float aEdgeT;  // position along its edge, for pulses
  attribute vec3 aFrom;
  attribute vec3 aTo;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform vec3 uNode;
  uniform vec3 uEdge;

  varying vec3 vColour;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float alpha = 1.0;
    float size = aSize;
    vec3 colour = uEdge;

    if (aKind > 1.5) {
      // A pulse running from one node to the next, looping on its own phase.
      float travel = fract(uTime * 0.22 + aPhase);
      p = mix(aFrom, aTo, travel);
      // Fade in and out at the ends so it does not pop.
      alpha = smoothstep(0.0, 0.12, travel) * (1.0 - smoothstep(0.86, 1.0, travel));
      colour = uNode;
      size *= 2.4;
    } else if (aKind > 0.5) {
      colour = uNode;
      alpha = 0.75 + 0.25 * sin(uTime * 1.6 + aPhase * 4.0);
      // Nodes drift a little, which keeps the graph from looking printed.
      p += vec3(
        sin(uTime * 0.28 + aPhase * 3.0),
        cos(uTime * 0.23 + aPhase * 2.0),
        sin(uTime * 0.19 + aPhase)
      ) * 0.055;
    } else {
      alpha = 0.42 + 0.18 * sin(uTime * 1.1 + aEdgeT * 9.0 + aPhase);
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * (34.0 / -mv.z);

    vColour = colour;
    vAlpha = alpha * uOpacity;
  }
`;

export function Network({
  opacityRef,
  nodes = 34,
}: {
  opacityRef: React.RefObject<number>;
  nodes?: number;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);

  const geometry = useMemo(() => buildNetwork(nodes), [nodes]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: {
        value:
          typeof window === "undefined"
            ? 1
            : Math.min(window.devicePixelRatio, 2),
      },
      uOpacity: { value: 0 },
      uNode: { value: new THREE.Color("#5fe3a1") },
      uEdge: { value: new THREE.Color("#7fd8c0") },
    }),
    [],
  );

  useFrame((_, delta) => {
    const m = material.current;
    if (m) {
      m.uniforms.uTime.value += delta;
      m.uniforms.uOpacity.value = opacityRef.current ?? 0;
      m.visible = (opacityRef.current ?? 0) > 0.01;
    }
    if (group.current) group.current.rotation.y += delta * 0.035;
  });

  return (
    <group ref={group}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={NETWORK_VERT}
          fragmentShader={GLOW_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/**
 * Nodes, the dots that draw each edge, and one pulse per edge — all in a single
 * Points geometry, because one draw call is worth a slightly awkward layout.
 */
function buildNetwork(nodeCount: number): THREE.BufferGeometry {
  const random = seeded(90210);

  const points: number[] = [];
  const phases: number[] = [];
  const sizes: number[] = [];
  const kinds: number[] = [];
  const edgeTs: number[] = [];
  const froms: number[] = [];
  const tos: number[] = [];

  const push = (
    p: THREE.Vector3,
    kind: number,
    size: number,
    edgeT = 0,
    from = p,
    to = p,
  ) => {
    points.push(p.x, p.y, p.z);
    phases.push(random());
    sizes.push(size);
    kinds.push(kind);
    edgeTs.push(edgeT);
    froms.push(from.x, from.y, from.z);
    tos.push(to.x, to.y, to.z);
  };

  // Nodes scattered through a flattened volume, so the graph has depth but
  // still reads as a constellation rather than a cloud.
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < nodeCount; i++) {
    positions.push(
      new THREE.Vector3(
        (random() - 0.5) * 6.6,
        (random() - 0.5) * 4.0,
        (random() - 0.5) * 2.6,
      ),
    );
  }

  for (const p of positions) push(p, 1, 7.5 + random() * 6.5);

  // Connect each node to its two nearest neighbours: enough structure to read
  // as a graph, sparse enough to stay legible.
  const seen = new Set<string>();
  for (let i = 0; i < positions.length; i++) {
    const order = positions
      .map((p, j) => ({ j, d: positions[i].distanceTo(p) }))
      .filter((entry) => entry.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);

    for (const { j } of order) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const from = positions[i];
      const to = positions[j];
      const dots = Math.max(6, Math.round(from.distanceTo(to) * 7));
      for (let k = 1; k < dots; k++) {
        const t = k / dots;
        push(new THREE.Vector3().lerpVectors(from, to, t), 0, 1.7, t);
      }
      push(from.clone(), 2, 3.2, 0, from, to);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aKind", new THREE.Float32BufferAttribute(kinds, 1));
  geometry.setAttribute("aEdgeT", new THREE.Float32BufferAttribute(edgeTs, 1));
  geometry.setAttribute("aFrom", new THREE.Float32BufferAttribute(froms, 3));
  geometry.setAttribute("aTo", new THREE.Float32BufferAttribute(tos, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 9);
  return geometry;
}
