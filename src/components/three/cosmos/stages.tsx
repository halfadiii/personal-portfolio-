"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  clamp01,
  fbm3,
  gauss,
  makePoints,
  mixColour,
  put,
  rng,
  smoothstep,
} from "./shared";

/**
 * The eight stages of the story, in the order they happened.
 *
 * Each one is a self-contained scene that knows two numbers: how far through
 * its own span the scroll is, and how visible it should be. It never knows
 * about its neighbours — the director fades them across each other — so a
 * stage can be reordered, retimed or cut without touching the others.
 *
 * They are all generated. There is not a photograph or a model file anywhere in
 * here, which is a deliberate constraint rather than a limitation: a JPEG of a
 * nebula is a megabyte that can only ever be seen from the angle it was shot
 * from, and a generated one costs nothing to send and can be flown through.
 */

export type StageProps = {
  /** 0 to 1 across this stage's own span of the scroll. */
  localRef: React.RefObject<number>;
  /** How much of this stage is showing. The director owns the crossfade. */
  opacityRef: React.RefObject<number>;
  /** Cursor over the section in -1..1, and whether there is one. */
  pointerRef: React.RefObject<{ x: number; y: number; on: number }>;
};

/** Shared per-frame bookkeeping: opacity, clock, and a little pointer lean. */
function useStage(
  material: THREE.ShaderMaterial | THREE.ShaderMaterial[],
  { localRef, opacityRef, pointerRef }: StageProps,
  onFrame?: (local: number, time: number, lean: { x: number; y: number }) => void,
) {
  const lean = useRef({ x: 0, y: 0 });
  const clock = useRef(0);

  useFrame((_, delta) => {
    clock.current += delta;
    const materials = Array.isArray(material) ? material : [material];
    const opacity = opacityRef.current ?? 0;
    for (const m of materials) {
      m.uniforms.uOpacity.value = opacity;
      m.uniforms.uTime.value = clock.current;
    }

    // The pointer never snaps. Everything on this site that follows a cursor
    // eases toward it, so that a fast flick reads as weight rather than as a
    // jump — and here it is moving whole galaxies.
    const pointer = pointerRef.current;
    const settle = 1 - Math.exp(-3.4 * delta);
    lean.current.x += (pointer.x * pointer.on - lean.current.x) * settle;
    lean.current.y += (pointer.y * pointer.on - lean.current.y) * settle;

    onFrame?.(clamp01(localRef.current ?? 0), clock.current, lean.current);
  });

  return lean;
}

/* =========================================================================
   01 — First light.  "100 million years after the Big Bang, the Age of
   Stars begins."  Cold hydrogen collapsing, and the first stars lighting
   the inside of the cloud they were born in.
   ========================================================================= */

export function FirstLight(props: StageProps) {
  const group = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Points>(null);

  /*
   * The cloud.
   *
   * Getting this to read as gas rather than as confetti is entirely a question
   * of how the sprites are sized against how bright they are. Small bright ones
   * stay separate however many you draw — the eye resolves each one and what it
   * sees is dots. Large dim ones overlap, and because the blend is additive
   * their overlaps integrate: ten faint sprites on top of each other are one
   * bright patch, and the patches join up into billows with no edges anywhere.
   *
   * So these are five times the size and a fifth of the brightness of what the
   * stars in the same scene are drawn at, and there are more of them.
   */
  const cloud = useMemo(() => {
    const random = rng(20240904);
    const COUNT = 14000;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const deep = new THREE.Color("#2a0616");
    const warm = new THREE.Color("#c81f45");
    const hot = new THREE.Color("#ff9ec0");

    let written = 0;
    /*
     * Rejection sampling against a noise field.
     *
     * Scattering uniformly and colouring by density gives an even fog; only
     * accepting where the field is already dense gives billows with empty lanes
     * between them, which is what a collapsing cloud looks like.
     *
     * Two octaves and a generous acceptance, both for the same reason: this
     * loop runs on the main thread the moment the stage mounts, and at four
     * octaves with a tight threshold it was rejecting most of half a million
     * candidates and cost a third of a second of frozen page. Two octaves is
     * still billows — the third and fourth were detail below the size of the
     * sprites drawn on top of them.
     */
    let guard = 0;
    while (written < COUNT && guard < COUNT * 12) {
      guard++;
      const x = (random() * 2 - 1) * 4.2;
      const y = (random() * 2 - 1) * 2.7;
      const z = (random() * 2 - 1) * 2.7;

      const d = fbm3(x * 0.55 + 11, y * 0.55, z * 0.55, 2);
      const toCentre = Math.sqrt(x * x + y * y * 1.6 + z * z);
      const fall = 1 - smoothstep(1.2, 4.1, toCentre);
      const density = d * fall;
      if (random() > density * 3.1) continue;

      const heat = clamp01(density * 1.5 + (1 - smoothstep(0.0, 2.2, toCentre)) * 0.7);
      const colour = (
        heat < 0.5
          ? mixColour(deep, warm, heat * 2)
          : mixColour(warm, hot, (heat - 0.5) * 2)
      ).clone().multiplyScalar(0.14 + heat * 0.1);

      put(
        written,
        positions,
        colours,
        sizes,
        x,
        y,
        z,
        colour,
        0.5 + random() * 0.85 + heat * 0.4,
      );
      written++;
    }

    return makePoints(positions, colours, sizes, { twinkle: 0.05 });
  }, []);

  // The first stars. Few, hot, and violently bright — nothing had polluted the
  // gas with metals yet, so they were enormous and blue-white.
  const firstStars = useMemo(() => {
    const random = rng(77341);
    const COUNT = 26;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const white = new THREE.Color("#fff4ff");
    for (let i = 0; i < COUNT; i++) {
      put(
        i,
        positions,
        colours,
        sizes,
        gauss(random) * 1.7,
        gauss(random) * 1.0,
        gauss(random) * 1.4,
        white,
        0.22 + random() * 0.4,
      );
    }
    return makePoints(positions, colours, sizes, { twinkle: 0.12 });
  }, []);

  useStage([cloud.material, firstStars.material], props, (local, time, lean) => {
    if (group.current) {
      group.current.rotation.y = time * 0.012 + lean.x * 0.16;
      group.current.rotation.x = lean.y * 0.1;
      // Drifting in over the stage, so the cloud is always arriving.
      group.current.position.z = -1.2 + local * 2.4;
    }
    // The stars switch on across the first third and then stay lit.
    if (stars.current) {
      const material = stars.current.material as THREE.ShaderMaterial;
      material.uniforms.uScale.value = smoothstep(0.05, 0.55, local) * 1.0;
    }
  });

  return (
    <group ref={group}>
      <points geometry={cloud.geometry} material={cloud.material} />
      <points
        ref={stars}
        geometry={firstStars.geometry}
        material={firstStars.material}
      />
    </group>
  );
}

/* =========================================================================
   02 — The cosmic web.  "proto galaxies connected by a cosmic web of gas
   and dust... dark matter guides infant galaxies into clusters that span
   millions of light years."
   ========================================================================= */

export function CosmicWeb(props: StageProps) {
  const group = useRef<THREE.Group>(null);

  const web = useMemo(() => {
    const random = rng(5150);
    const NODES = 90;
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < NODES; i++) {
      nodes.push(
        new THREE.Vector3(
          gauss(random) * 3.2,
          gauss(random) * 2.0,
          gauss(random) * 2.6,
        ),
      );
    }

    // Every node joins its nearest few. That is the whole structure: the web is
    // not drawn, it is what is left when matter falls toward whatever is
    // closest, and filaments are the paths between the places it fell.
    const links: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < NODES; i++) {
      const order = nodes
        .map((n, j) => ({ j, d: nodes[i].distanceTo(n) }))
        .filter((e) => e.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { j, d } of order) {
        if (j > i && d < 2.4) links.push([nodes[i], nodes[j]]);
      }
    }

    const PER_LINK = 60;
    const COUNT = links.length * PER_LINK + NODES * 90;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const cold = new THREE.Color("#1b2a7a");
    const warm = new THREE.Color("#6f7dff");
    const bright = new THREE.Color("#cfd8ff");

    let i = 0;
    for (const [a, b] of links) {
      for (let k = 0; k < PER_LINK; k++) {
        const t = k / PER_LINK;
        // Thin in the middle, thick at the ends: a filament is a funnel into
        // the halo at each end, not a rod.
        const waist = 0.06 + Math.abs(t - 0.5) * 0.5;
        put(
          i++,
          positions,
          colours,
          sizes,
          a.x + (b.x - a.x) * t + gauss(random) * waist,
          a.y + (b.y - a.y) * t + gauss(random) * waist,
          a.z + (b.z - a.z) * t + gauss(random) * waist,
          mixColour(cold, warm, random() * 0.8),
          0.055 + random() * 0.09,
        );
      }
    }

    for (const n of nodes) {
      const mass = 0.4 + random() * 0.8;
      for (let k = 0; k < 90; k++) {
        const r = Math.abs(gauss(random)) * 0.18 * mass;
        const a = random() * Math.PI * 2;
        const b = Math.acos(random() * 2 - 1);
        put(
          i++,
          positions,
          colours,
          sizes,
          n.x + r * Math.sin(b) * Math.cos(a),
          n.y + r * Math.sin(b) * Math.sin(a),
          n.z + r * Math.cos(b),
          mixColour(warm, bright, 1 - r / (0.18 * mass)),
          0.07 + random() * 0.16 * mass,
        );
      }
    }

    return makePoints(positions, colours, sizes, { twinkle: 0.08 });
  }, []);

  useStage(web.material, props, (local, time, lean) => {
    if (!group.current) return;
    group.current.rotation.y = -0.5 + local * 0.9 + time * 0.01 + lean.x * 0.22;
    group.current.rotation.x = 0.12 + lean.y * 0.14;
    // Pulling back through the stage, so the web keeps opening out.
    group.current.scale.setScalar(1.5 - local * 0.55);
  });

  return <points ref={group} geometry={web.geometry} material={web.material} />;
}

/* -------------------------------------------------------------------------
   A spiral galaxy, used twice: once in a pair that collide, once alone.
   ------------------------------------------------------------------------- */

function spiralGalaxy({
  seed,
  count,
  radius,
  arms = 2,
  twist = 2.4,
  thickness = 0.06,
  core = new THREE.Color("#ffe6b0"),
  arm = new THREE.Color("#9fc6ff"),
  hii = new THREE.Color("#ff7ba8"),
}: {
  seed: number;
  count: number;
  radius: number;
  arms?: number;
  twist?: number;
  thickness?: number;
  core?: THREE.Color;
  arm?: THREE.Color;
  hii?: THREE.Color;
}) {
  const random = rng(seed);
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Exponential disc: most of a galaxy's light is in the middle, and the
    // falloff is exponential rather than linear. Cubing a uniform is a cheap
    // way to that shape.
    const t = random();
    const r = radius * t * t * (0.35 + 0.65 * t);

    // Logarithmic spiral, blurred. The blur has to grow with radius or the
    // arms stay pencil-thin all the way out and read as drawn lines.
    const branch = Math.floor(random() * arms) * ((Math.PI * 2) / arms);
    const spread = 0.28 + (r / radius) * 0.55;
    const angle = branch + (r / radius) * twist * Math.PI + gauss(random) * spread;

    const bulge = 1 - smoothstep(0, radius * 0.28, r);
    const y = gauss(random) * (thickness * radius) * (0.4 + bulge * 2.4);

    let colour: THREE.Color;
    const roll = random();
    if (bulge > 0.45) {
      colour = mixColour(arm, core, bulge);
    } else if (roll > 0.955) {
      // The star-forming regions. Sparse, and the only pink in the picture.
      colour = hii;
    } else {
      colour = mixColour(arm, core, Math.max(0, 0.35 - r / radius));
    }

    /*
     * Dimmed where the disc is crowded.
     *
     * Additive blending sums whatever overlaps, and the bulge is both the
     * densest part of the galaxy and — before this — the part drawn with the
     * largest sprites. Those two multiply: the middle saturated to flat white
     * and every core came out as the same featureless diamond, which is the
     * shape a round sprite makes once it has clipped. Scaling brightness down
     * where the count goes up keeps the sum in range, so the core stays a
     * graded gold instead of a hole punched in the picture.
     */
    const crowd = (0.26 + 0.74 * (1 - bulge)) * (roll > 0.955 ? 1 : 0.8);

    put(
      i,
      positions,
      colours,
      sizes,
      Math.cos(angle) * r,
      y,
      Math.sin(angle) * r,
      colour.clone().multiplyScalar(crowd),
      (roll > 0.955 ? 0.2 : 0.06) + random() * 0.08 + bulge * 0.05,
    );
  }

  return makePoints(positions, colours, sizes, { twinkle: 0.06 });
}

/* =========================================================================
   03 — The merger.  "Gravity pulls these colossal systems together, locking
   them into a dance that lasts hundreds of millions of years."
   ========================================================================= */

export function Merger(props: StageProps) {
  const left = useRef<THREE.Points>(null);
  const right = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);

  const a = useMemo(
    () => spiralGalaxy({ seed: 8811, count: 14000, radius: 1.5, twist: 2.2 }),
    [],
  );
  const b = useMemo(
    () =>
      spiralGalaxy({
        seed: 4242,
        count: 14000,
        radius: 1.25,
        arms: 2,
        twist: 2.9,
      }),
    [],
  );

  // The tails. In a real encounter these are stars flung out by the tide long
  // before the discs touch, and they are most of what makes a merger legible —
  // two discs passing without them just looks like two discs.
  const tails = useMemo(() => {
    const random = rng(9090);
    const COUNT = 4200;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const pale = new THREE.Color("#8fb3e8");
    for (let i = 0; i < COUNT; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const t = random();
      // A wide arc sweeping away from each disc and curling back.
      const angle = side * (0.6 + t * 2.9);
      const r = 1.4 + t * 4.6;
      put(
        i,
        positions,
        colours,
        sizes,
        side * 1.9 + Math.cos(angle) * r * 0.55 + gauss(random) * 0.22,
        gauss(random) * 0.18 * (1 + t * 2),
        Math.sin(angle) * r * 0.42 + gauss(random) * 0.22,
        pale,
        0.05 + random() * 0.08,
      );
    }
    return makePoints(positions, colours, sizes);
  }, []);

  useStage(
    [a.material, b.material, tails.material],
    props,
    (local, time, lean) => {
      // The approach. Eased, because two galaxies falling together accelerate.
      const closing = smoothstep(0, 1, local);
      const gap = 2.6 * (1 - closing * 0.94);

      if (left.current) {
        left.current.position.x = -gap;
        left.current.rotation.y = time * 0.09 + local * 1.4;
        left.current.rotation.x = 0.42;
        left.current.rotation.z = local * 0.6;
      }
      if (right.current) {
        right.current.position.x = gap;
        right.current.rotation.y = -time * 0.11 - local * 1.7;
        right.current.rotation.x = -0.3;
        right.current.rotation.z = -local * 0.8;
      }
      if (group.current) {
        group.current.rotation.y = -0.3 + local * 0.5 + lean.x * 0.2;
        group.current.rotation.x = 0.1 + lean.y * 0.13;
        group.current.scale.setScalar(0.92 + closing * 0.24);
      }
      // The tails only exist once the tide has had time to raise them.
      tails.material.uniforms.uScale.value = smoothstep(0.12, 0.7, local);
    },
  );

  return (
    <group ref={group}>
      <points ref={left} geometry={a.geometry} material={a.material} />
      <points ref={right} geometry={b.geometry} material={b.material} />
      <points geometry={tails.geometry} material={tails.material} />
    </group>
  );
}

/* =========================================================================
   04 — Peak star formation.  "forging new suns over 10 times faster than
   today... most stars that will ever exist form during this time."
   ========================================================================= */

export function PeakFormation(props: StageProps) {
  const galaxy = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);

  const disc = useMemo(
    () =>
      spiralGalaxy({
        seed: 31415,
        count: 30000,
        radius: 2.6,
        arms: 2,
        twist: 2.6,
        thickness: 0.045,
      }),
    [],
  );

  useStage(disc.material, props, (local, time, lean) => {
    if (galaxy.current) {
      galaxy.current.rotation.y = time * 0.05 + local * 0.8;
    }
    if (group.current) {
      // Tipping from nearly edge-on toward a three-quarter view, which is the
      // move that turns a smear of light into a structure with arms in it.
      group.current.rotation.x = 1.15 - local * 0.62 + lean.y * 0.12;
      group.current.rotation.z = -0.24 + lean.x * 0.14;
      group.current.position.z = -0.6 + local * 1.1;
    }
    // The burst: everything gets brighter and bluer through the middle of the
    // stage, then settles.
    disc.material.uniforms.uScale.value =
      0.85 + Math.sin(clamp01(local) * Math.PI) * 0.45;
  });

  return (
    <group ref={group}>
      <points ref={galaxy} geometry={disc.geometry} material={disc.material} />
    </group>
  );
}

/* =========================================================================
   05 — Black holes.  "the dark engines at the hearts of galaxies... jets of
   particles erupt from their cores at nearly the speed of light."
   ========================================================================= */

export function BlackHole(props: StageProps) {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Points>(null);
  const arch = useRef<THREE.Points>(null);

  /** The disc itself, lying flat and seen nearly edge-on. */
  const plate = useMemo(() => {
    const random = rng(6161);
    const COUNT = 20000;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const inner = new THREE.Color("#ffffff");
    const mid = new THREE.Color("#bfe4ff");
    const outer = new THREE.Color("#2f7fd8");

    for (let i = 0; i < COUNT; i++) {
      const t = Math.pow(random(), 0.55);
      const r = 0.66 + t * 1.75;
      const angle = random() * Math.PI * 2;

      /*
       * Doppler beaming.
       *
       * The disc orbits at a fair fraction of the speed of light, so the side
       * sweeping toward the viewer is boosted and blueshifted and the side
       * going away is dimmed. It is the reason a real image of one of these is
       * lopsided rather than symmetrical, and leaving it out is most of what
       * makes a drawn one look drawn.
       */
      const beaming = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(angle));
      const heat = (1 - t) * beaming;
      const colour =
        heat > 0.5
          ? mixColour(mid, inner, (heat - 0.5) * 2.2)
          : mixColour(outer, mid, heat * 1.8);

      put(
        i,
        positions,
        colours,
        sizes,
        Math.cos(angle) * r,
        gauss(random) * 0.022 * (0.35 + t),
        Math.sin(angle) * r,
        colour.clone().multiplyScalar(0.42 * (0.45 + beaming)),
        0.045 + random() * 0.06,
      );
    }
    return makePoints(positions, colours, sizes);
  }, []);

  /**
   * The disc's own far side, lensed over the top and under the bottom.
   *
   * A narrow band and not a second copy of the whole disc — which is what this
   * was, and a full annulus turned to face the camera is not an arch, it is a
   * dinner plate held up in front of the hole. What actually arrives over the
   * top is the light from a thin range of radii just outside the shadow, so
   * that is what gets drawn, and it is weighted to the top and bottom because
   * at the sides the disc itself is in front of it.
   */
  const lensed = useMemo(() => {
    const random = rng(3232);
    const COUNT = 9000;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const inner = new THREE.Color("#ffffff");
    const mid = new THREE.Color("#cfe9ff");

    for (let i = 0; i < COUNT; i++) {
      const t = Math.pow(random(), 0.7);
      const r = 0.6 + t * 0.42;
      const angle = random() * Math.PI * 2;
      // Bright over the top and under the bottom, gone at the sides.
      const arc = Math.pow(Math.abs(Math.sin(angle)), 1.5);
      if (random() > arc * 0.95 + 0.05) continue;

      put(
        i,
        positions,
        colours,
        sizes,
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        gauss(random) * 0.02,
        mixColour(mid, inner, (1 - t) * arc).clone().multiplyScalar(0.5 * arc),
        0.04 + random() * 0.05,
      );
    }
    return makePoints(positions, colours, sizes);
  }, []);

  /** The last orbit light can hold before it falls in. Thin, and very bright. */
  const photonRing = useMemo(() => {
    const random = rng(818);
    const COUNT = 2600;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const white = new THREE.Color("#eaf4ff");
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const r = 0.575 + gauss(random) * 0.006;
      put(
        i,
        positions,
        colours,
        sizes,
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        0,
        white,
        0.035 + random() * 0.02,
      );
    }
    return makePoints(positions, colours, sizes);
  }, []);

  const jets = useMemo(() => {
    const random = rng(2727);
    const COUNT = 3000;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const hot = new THREE.Color("#dff0ff");
    const cool = new THREE.Color("#3a6fd0");
    for (let i = 0; i < COUNT; i++) {
      const up = i % 2 === 0 ? 1 : -1;
      const t = Math.pow(random(), 0.7);
      const h = t * 6.0;
      // Collimated near the hole, spreading with distance.
      const spread = 0.03 + t * t * 0.42;
      put(
        i,
        positions,
        colours,
        sizes,
        gauss(random) * spread,
        up * h,
        gauss(random) * spread,
        mixColour(hot, cool, t).clone().multiplyScalar(0.55),
        0.03 + random() * 0.06 * (1 - t * 0.6),
      );
    }
    return makePoints(positions, colours, sizes);
  }, []);

  useStage(
    [plate.material, lensed.material, photonRing.material, jets.material],
    props,
    (local, time, lean) => {
      if (disc.current) disc.current.rotation.y = time * 0.5;
      if (arch.current) arch.current.rotation.z = time * 0.28;
      if (group.current) {
        // Shallow, and staying shallow. The disc lies in the ground plane, so
        // zero is edge-on and a right angle is face-on — the way round this was
        // first written turned the whole stage into a ball of dots.
        group.current.rotation.x = 0.14 + local * 0.18 + lean.y * 0.07;
        group.current.rotation.z = 0.08 + lean.x * 0.09;
        group.current.position.z = -0.5 + local * 1.1;
      }
      // The jets arrive in the second half, once the hole has grown into it.
      jets.material.uniforms.uScale.value = smoothstep(0.35, 0.85, local);
    },
  );

  return (
    <group ref={group} scale={0.92}>
      <points ref={disc} geometry={plate.geometry} material={plate.material} />

      {/* Square to the camera rather than to the disc: this and the photon
          ring are both silhouettes, and a silhouette does not tilt with the
          thing behind it. The counter-rotation cancels the group's tilt. */}
      <group rotation={[-0.14, 0, 0]}>
        <points ref={arch} geometry={lensed.geometry} material={lensed.material} />
        <points geometry={photonRing.geometry} material={photonRing.material} />
      </group>

      <points geometry={jets.geometry} material={jets.material} />
    </group>
  );
}

/* =========================================================================
   06 — Death and rebirth.  "about 1% have enough mass to collapse and
   violently explode... seeding space with the ingredients for life."
   ========================================================================= */

export function Supernova(props: StageProps) {
  const shell = useRef<THREE.Points>(null);
  const flash = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);

  const remnant = useMemo(() => {
    const random = rng(1848);
    const COUNT = 16000;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const core = new THREE.Color("#fff0d0");
    const mid = new THREE.Color("#ff6a2a");
    const edge = new THREE.Color("#8e1430");

    for (let i = 0; i < COUNT; i++) {
      // On a shell, roughened. A supernova remnant is not a smooth bubble: it
      // is Rayleigh–Taylor fingers, because the fast ejecta is running into
      // slower gas and the boundary between them is unstable.
      const a = random() * Math.PI * 2;
      const b = Math.acos(random() * 2 - 1);
      let x = Math.sin(b) * Math.cos(a);
      let y = Math.sin(b) * Math.sin(a);
      let z = Math.cos(b);

      const rough = fbm3(x * 2.6 + 4, y * 2.6, z * 2.6, 3);
      const r = 0.72 + rough * 0.55 + Math.abs(gauss(random)) * 0.06;
      x *= r;
      y *= r;
      z *= r;

      const heat = clamp01(1.35 - r);
      const colour =
        heat > 0.5
          ? mixColour(mid, core, (heat - 0.5) * 2)
          : mixColour(edge, mid, heat * 2);

      put(i, positions, colours, sizes, x, y, z, colour, 0.055 + random() * 0.11);
    }
    return makePoints(positions, colours, sizes, { twinkle: 0.1 });
  }, []);

  // The flash itself: one very bright thing, briefly.
  const spark = useMemo(() => {
    const positions = new Float32Array(3);
    const colours = new Float32Array(3);
    const sizes = new Float32Array(1);
    put(0, positions, colours, sizes, 0, 0, 0, new THREE.Color("#ffffff"), 9);
    return makePoints(positions, colours, sizes);
  }, []);

  useStage(
    [remnant.material, spark.material],
    props,
    (local, time, lean) => {
      // The flash peaks almost immediately and is gone; the shell it threw
      // keeps going for the rest of the stage.
      const burst = Math.exp(-Math.pow((local - 0.1) / 0.075, 2));
      spark.material.uniforms.uScale.value = burst * 1.6;

      const expansion = smoothstep(0.04, 1, local);
      if (shell.current) {
        shell.current.scale.setScalar(0.12 + expansion * 3.1);
        shell.current.rotation.y = time * 0.03;
      }
      // Thinning as it grows, which is conservation of the stuff in it.
      remnant.material.uniforms.uScale.value = 0.5 + (1 - expansion) * 1.3;

      if (group.current) {
        group.current.rotation.y = lean.x * 0.2;
        group.current.rotation.x = lean.y * 0.16;
      }
      if (flash.current) flash.current.visible = burst > 0.002;
    },
  );

  return (
    <group ref={group}>
      <points ref={shell} geometry={remnant.geometry} material={remnant.material} />
      <points ref={flash} geometry={spark.geometry} material={spark.material} />
    </group>
  );
}

/* =========================================================================
   07 — A new system.  "a nearby supernova sends a shock wave that triggers
   the collapse of the cloud... leading to the formation of a new star."
   ========================================================================= */

export function ProtoDisc(props: StageProps) {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Points>(null);

  const dust = useMemo(() => {
    const random = rng(4004);
    const COUNT = 22000;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const hot = new THREE.Color("#fff3d2");
    const warm = new THREE.Color("#ff9a3c");
    const cold = new THREE.Color("#6b1420");

    for (let i = 0; i < COUNT; i++) {
      const t = Math.pow(random(), 0.55);
      const r = 0.28 + t * 3.1;

      // Two gaps, where something has already finished forming and swept its
      // orbit clear. They are the reason a real image of one of these looks
      // like a record rather than a smear.
      const gapA = Math.exp(-Math.pow((r - 1.25) / 0.13, 2));
      const gapB = Math.exp(-Math.pow((r - 2.15) / 0.1, 2));
      if (random() < (gapA + gapB) * 0.85) continue;

      const angle = random() * Math.PI * 2;
      // Flaring: the disc is thin inside and puffs up further out, because the
      // gas further out is less tightly held.
      const flare = 0.03 + Math.pow(t, 1.6) * 0.34;

      const heat = clamp01(1.15 - t * 1.35);
      const colour =
        heat > 0.5
          ? mixColour(warm, hot, (heat - 0.5) * 2)
          : mixColour(cold, warm, heat * 2);

      put(
        i,
        positions,
        colours,
        sizes,
        Math.cos(angle) * r,
        gauss(random) * flare,
        Math.sin(angle) * r,
        colour,
        0.055 + random() * 0.1 + heat * 0.1,
      );
    }
    return makePoints(positions, colours, sizes);
  }, []);

  const star = useMemo(() => {
    const positions = new Float32Array(3);
    const colours = new Float32Array(3);
    const sizes = new Float32Array(1);
    put(0, positions, colours, sizes, 0, 0, 0, new THREE.Color("#fff6e0"), 5.5);
    return makePoints(positions, colours, sizes);
  }, []);

  useStage([dust.material, star.material], props, (local, time, lean) => {
    if (disc.current) disc.current.rotation.y = time * 0.16;
    if (group.current) {
      // Settling from a steep look down onto the disc to a shallower one, so
      // the gaps open up and then flatten into a rim.
      group.current.rotation.x = 1.02 - local * 0.44 + lean.y * 0.12;
      group.current.rotation.z = 0.1 + lean.x * 0.13;
      group.current.position.z = -0.8 + local * 1.2;
    }
    // The star lights up as the disc drains into it.
    star.material.uniforms.uScale.value = 0.35 + smoothstep(0, 1, local) * 0.9;
  });

  return (
    <group ref={group}>
      <points ref={disc} geometry={dust.geometry} material={dust.material} />
      <points geometry={star.geometry} material={star.material} />
    </group>
  );
}

/* =========================================================================
   08 — A battered young Earth.  "bombarded by asteroid impacts, the young
   earth is a molten hell."
   ========================================================================= */

const EARTH_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  void main() {
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uSun;
  uniform float uHeat;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vLocal;
  varying vec3 vNormalW;

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
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
          mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
          mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      if (i >= octaves) break;
      s += noise3(p) * a;
      p *= 2.07;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec3 n = normalize(vLocal);

    // The crust: cooled basalt, dark and rough.
    float rock = fbm(n * 5.2, 4);
    vec3 crust = mix(vec3(0.055, 0.043, 0.042), vec3(0.15, 0.12, 0.11), rock);

    // The cracks. A ridge through the noise gives long connected fissures
    // rather than blobs — which is right, because that is what a cooling
    // surface does: it fractures along lines, and the lines join up.
    float ridge = 1.0 - abs(fbm(n * 3.1 + vec3(9.0), 4) - 0.45) * 4.2;
    float fissure = pow(clamp(ridge, 0.0, 1.0), 2.4);

    // A slower second set, so the surface is not one uniform web.
    float deep = pow(clamp(1.0 - abs(fbm(n * 1.35, 3) - 0.44) * 5.0, 0.0, 1.0), 3.0);

    float glow = clamp(fissure * 0.85 + deep * 0.75, 0.0, 1.0) * uHeat;
    // Breathing, slowly, so the lava is not a painted texture.
    glow *= 0.75 + 0.25 * sin(uTime * 0.4 + rock * 12.0);

    vec3 lava = mix(vec3(0.85, 0.13, 0.02), vec3(1.0, 0.72, 0.28), glow);

    float day = clamp(dot(normalize(vNormalW), normalize(uSun)), 0.0, 1.0);
    // Never fully dark: a planet this hot lights its own night side.
    vec3 colour = crust * (0.06 + day * 1.05) + lava * glow * 1.7;

    gl_FragColor = vec4(colour, uOpacity);
  }
`;

const MOON_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uSun;
  uniform float uOpacity;
  varying vec3 vLocal;
  varying vec3 vNormalW;

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
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
          mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
          mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { s += noise3(p) * a; p *= 2.07; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 n = normalize(vLocal);
    float g = fbm(n * 7.0);
    vec3 rock = mix(vec3(0.20, 0.19, 0.185), vec3(0.44, 0.42, 0.40), g);
    // Still glowing in places: this thing was liquid an hour ago.
    float molten = pow(clamp(1.0 - abs(fbm(n * 2.4 + vec3(3.0)) - 0.46) * 5.5, 0.0, 1.0), 3.0);
    float day = clamp(dot(normalize(vNormalW), normalize(uSun)), 0.0, 1.0);
    vec3 colour = rock * (0.05 + day * 1.0) + vec3(1.0, 0.35, 0.08) * molten * 0.5;
    gl_FragColor = vec4(colour, uOpacity);
  }
`;

export function YoungEarth(props: StageProps) {
  const group = useRef<THREE.Group>(null);
  const earth = useRef<THREE.Mesh>(null);
  const moon = useRef<THREE.Group>(null);

  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: new THREE.Vector3(1, 0.28, 0.5).normalize() },
          uHeat: { value: 1 },
          uTime: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: EARTH_VERT,
        fragmentShader: EARTH_FRAG,
        toneMapped: false,
        transparent: true,
      }),
    [],
  );

  const moonMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: new THREE.Vector3(1, 0.28, 0.5).normalize() },
          uOpacity: { value: 0 },
        },
        vertexShader: EARTH_VERT,
        fragmentShader: MOON_FRAG,
        toneMapped: false,
        transparent: true,
      }),
    [],
  );

  // The debris still in orbit, and the sun it all formed around.
  const debris = useMemo(() => {
    const random = rng(1212);
    const COUNT = 2600;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const ember = new THREE.Color("#ff7a2a");
    const ash = new THREE.Color("#8a8f99");
    for (let i = 0; i < COUNT; i++) {
      const angle = random() * Math.PI * 2;
      const r = 1.5 + Math.abs(gauss(random)) * 1.5;
      put(
        i,
        positions,
        colours,
        sizes,
        Math.cos(angle) * r,
        gauss(random) * 0.22,
        Math.sin(angle) * r,
        mixColour(ember, ash, random()),
        0.035 + random() * 0.07,
      );
    }
    return makePoints(positions, colours, sizes, { twinkle: 0.14 });
  }, []);

  const sun = useMemo(() => {
    const positions = new Float32Array(3);
    const colours = new Float32Array(3);
    const sizes = new Float32Array(1);
    put(0, positions, colours, sizes, 7.5, 2.1, -5.5, new THREE.Color("#fff2dd"), 7);
    return makePoints(positions, colours, sizes);
  }, []);

  const opacity = props.opacityRef;

  useStage([debris.material, sun.material], props, (local, time, lean) => {
    const o = opacity.current ?? 0;
    // These two are shaded meshes rather than point clouds, so they do not
    // share the points' opacity uniform — and setting `material.opacity` does
    // nothing at all on a ShaderMaterial, because nothing in the shader reads
    // it. The alpha has to be a uniform the fragment actually writes.
    earthMaterial.uniforms.uOpacity.value = o;
    moonMaterial.uniforms.uOpacity.value = o;
    earthMaterial.uniforms.uTime.value = time;
    // Cooling across the stage, from a magma ocean to a crust with seams in it.
    earthMaterial.uniforms.uHeat.value = 1.15 - local * 0.55;

    if (earth.current) earth.current.rotation.y = time * 0.05;
    if (moon.current) {
      // Much closer than it is now, because it was: it has been receding ever
      // since it formed.
      const a = time * 0.12 + local * 1.6;
      moon.current.position.set(Math.cos(a) * 2.7, 0.5, Math.sin(a) * 2.7);
      moon.current.rotation.y = a;
    }
    if (group.current) {
      group.current.rotation.y = -0.4 + local * 0.5 + lean.x * 0.24;
      group.current.rotation.x = lean.y * 0.16;
      group.current.position.z = -1.1 + local * 1.4;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={earth} material={earthMaterial}>
        <sphereGeometry args={[1.25, 96, 64]} />
      </mesh>
      <group ref={moon}>
        <mesh material={moonMaterial}>
          <sphereGeometry args={[0.34, 48, 32]} />
        </mesh>
      </group>
      <points geometry={debris.geometry} material={debris.material} />
      <points geometry={sun.geometry} material={sun.material} />
    </group>
  );
}
