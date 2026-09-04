"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The marker: a small craft parked over whichever project is at the front, and
 * a transfer burn whenever that changes.
 *
 * It lives inside the rotating ring, so it turns with the system and only ever
 * has to think about the arc between one planet and the next. The transfer is
 * the shape a real one is, in four parts: it lifts off vertically, pitches over
 * into the crossing, comes back upright over the destination, and lands on its
 * tail. The sideways travel is finished before the descent begins, so the last
 * stretch is a straight drop onto the pad rather than a diagonal skid into it.
 *
 * Three details make the landing read. Every horizontal term — the angle round
 * the ring, the outward bulge, and the weave — is finished before the descent
 * begins, so the final stretch changes nothing but height: it comes straight
 * down onto the pad instead of sliding in diagonally. The height profile has
 * zero gradient at touchdown, so it arrives at zero vertical speed rather than
 * hitting the ground at full descent rate. And attitude is *not* simply the
 * velocity vector — on final approach velocity points straight down, which
 * would drive the craft nose-first into the planet, so it is upright before
 * the descent starts and comes down tail-first under its own retro burn.
 *
 * On top of that arch it weaves. Two out-of-phase waves, one in radius and one
 * in height, at frequencies that do not divide into each other, so the path
 * never doubles back on a shape it has already flown. Their phase and sign are
 * drawn from which planet it is heading for, so the same two planets always
 * give the same flight and no two legs of a lap look alike. Both waves are
 * windowed by the same arch, which is what keeps the ends clean: whatever it
 * does in the middle, it arrives on the orbit, level, pointing the right way.
 *
 * Behind it, two things. A ribbon of the path it has actually flown, fading
 * out over about two seconds, and the exhaust itself — particles emitted at
 * the nozzle and left behind, brightest during the burn. Both are one draw
 * call each, and both are shaded by the same star as everything else.
 */

/** Seconds for one transfer. Long enough that the descent is watchable. */
const TRANSFER = 2.7;
/** How far outside the orbit the path bows at the midpoint. */
const BULGE = 0.62;
/** How far above the orbit plane it climbs. */
const CLIMB = 0.62;
/** Amplitude of the weave, in world units, at the middle of a transfer. */
const WEAVE_RADIAL = 0.3;
const WEAVE_VERTICAL = 0.24;
/**
 * Where the craft parks, above the planet's centre. Clear of the largest
 * planet's radius plus the length of its own tail, so it stands on the surface
 * rather than sinking into it.
 */
const PARK_HEIGHT = 0.44;
/** Everything horizontal is done by this point; the rest is a vertical drop. */
const LATERAL_DONE = 0.68;
/**
 * Where the craft starts shedding altitude. Well before `LATERAL_DONE`, so it
 * is already most of the way down when the sideways travel stops: the final
 * vertical drop is a quarter of the cruise height, not the whole of it. A
 * craft that arrives over the pad still at cruise altitude and then falls the
 * entire way looks like an elevator, not a landing.
 */
const DESCENT_FROM = 0.26;

/**
 * The arrival from the loading screen.
 *
 * The craft on the preloader lights its engine as the count climbs and leaves
 * at 100; this is the other half of that. It waits above its pad — far enough
 * up to be outside the frame — until the overlay hands over, then comes down
 * on the same profile the transfers land on: `(1 - t)^3`, whose gradient is
 * zero at touchdown, so it settles onto the planet rather than arriving at it.
 *
 * It does not fall straight down the planet's own axis, which reads as a lift
 * rather than a landing. It comes in from behind and outside the orbit and
 * swings round onto the pad, bleeding the sideways travel off before the last
 * of the height — so the curve flattens into a vertical settle instead of a
 * diagonal skid, which is the same rule the transfers land by.
 *
 * It only happens when the loading sequence actually ran. A returning visitor
 * who never saw a rocket leave should not watch one drop out of the sky.
 */
const ARRIVE_HEIGHT = 6.4;
const ARRIVE_SECONDS = 2.1;
/** How far round the ring, and how far outside it, the approach begins. */
const ARRIVE_SWEEP = 0.62;
const ARRIVE_OUT = 1.35;
/** Where the curve straightens out and the last of the descent is vertical. */
const ARRIVE_LATERAL_DONE = 0.82;

/** Positions kept in the path ribbon and the exhaust cloud. */
const TRAIL = 160;
const SPARKS = 220;
/** Seconds a piece of exhaust stays visible. */
const SPARK_LIFE = 2.1;

const HULL_VERT = /* glsl */ `
  attribute float aTint;
  varying float vTint;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  void main() {
    vTint = aTint;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HULL_FRAG = /* glsl */ `
  varying float vTint;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  uniform vec3 uStar;
  uniform vec3 uHull;
  uniform vec3 uAccent;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 L = normalize(uStar - vWorld);

    // Lit by the same star as the planets, so the craft never looks pasted on.
    float day = smoothstep(-0.25, 0.45, dot(n, L));
    // A tight specular, which is what makes a small object read as metal.
    vec3 h = normalize(L + normalize(vViewW));
    float spec = pow(max(dot(n, h), 0.0), 48.0) * 0.7;
    // And a cold bounce from the far side, so the shadow side is not a hole.
    float fill = 0.10 + 0.10 * max(0.0, dot(n, -L));

    vec3 base = mix(uHull, uAccent, vTint);
    gl_FragColor = vec4(base * (fill + day) + vec3(spec), 1.0);
  }
`;

const FLAME_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uThrust;

  void main() {
    // v runs from the nozzle to the tip of the cone.
    float along = 1.0 - vUv.y;
    float flicker = 0.85 + 0.15 * sin(uTime * 41.0 + vUv.y * 22.0);
    float body = pow(1.0 - along, 1.7) * flicker;
    // White at the throat, orange down the plume.
    vec3 colour = mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.42, 0.10), along);
    gl_FragColor = vec4(colour, body * uThrust * 1.5);
  }
`;

const PATH_VERT = /* glsl */ `
  attribute float aAge;
  varying float vFade;
  void main() {
    vFade = 1.0 - smoothstep(0.0, 2.0, aAge);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PATH_FRAG = /* glsl */ `
  varying float vFade;
  void main() {
    if (vFade <= 0.001) discard;
    gl_FragColor = vec4(1.0, 0.72, 0.42, vFade * 0.55);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aAge;
  attribute float aSeed;
  uniform float uPixelRatio;
  uniform float uLife;
  varying float vFade;
  varying float vHeat;

  void main() {
    float life = clamp(aAge / uLife, 0.0, 1.0);
    vFade = 1.0 - life;
    // Cools as it disperses, the way a real plume does.
    vHeat = pow(1.0 - life, 2.6);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Expanding as it cools, and gone by the end.
    float size = (1.4 + aSeed * 1.6) * (0.5 + life * 2.2) * vFade;
    gl_PointSize = size * uPixelRatio * (46.0 / -mv.z);
  }
`;

const SPARK_FRAG = /* glsl */ `
  varying float vFade;
  varying float vHeat;
  void main() {
    if (vFade <= 0.001) discard;
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float falloff = pow(1.0 - d * 2.0, 2.0);
    vec3 colour = mix(vec3(1.0, 0.45, 0.16), vec3(1.0, 0.95, 0.85), vHeat);
    gl_FragColor = vec4(colour, falloff * vFade * 0.6);
  }
`;

export function Rocket({
  count,
  radius,
  frontRef,
  sunRef,
}: {
  count: number;
  radius: number;
  /** Index of the planet currently at the front, written by the orbit. */
  frontRef: React.RefObject<number>;
  sunRef: React.RefObject<THREE.Vector3>;
}) {
  const craft = useRef<THREE.Group>(null);
  const hullMaterial = useRef<THREE.ShaderMaterial>(null);
  const flame = useRef<THREE.Mesh>(null);
  const flameMaterial = useRef<THREE.ShaderMaterial>(null);

  const step = (Math.PI * 2) / count;

  const hull = useMemo(buildCraft, []);
  useEffect(() => () => hull.dispose(), [hull]);

  const hullUniforms = useMemo(
    () => ({
      uStar: { value: new THREE.Vector3() },
      uHull: { value: new THREE.Color("#e9edf2") },
      uAccent: { value: new THREE.Color("#ff8a3d") },
    }),
    [],
  );

  const flameUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uThrust: { value: 0 } }),
    [],
  );

  // Flight state. None of it belongs in React: it changes every frame and
  // nothing outside this component reads it.
  const flight = useRef({
    fromAngle: 0,
    sweep: 0,
    t: 1,
    target: -1,
    /** Phase and sign of the weave, fixed per destination. */
    phase: 0,
    lean: 1,
  });

  /** The descent out of the loading screen. `wanted` is read on the first
   *  frame; `released` waits for the overlay to say it has gone. */
  const arrival = useRef({ wanted: false, released: false, t: 0 });

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.rocket === "away") {
      arrival.current.released = true;
      return;
    }
    const watch = new MutationObserver(() => {
      if (root.dataset.rocket !== "away") return;
      arrival.current.released = true;
      watch.disconnect();
    });
    watch.observe(root, { attributes: true, attributeFilter: ["data-rocket"] });
    return () => watch.disconnect();
  }, []);

  const scratch = useMemo(
    () => ({
      here: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      behind: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      aim: new THREE.Quaternion(),
      nozzle: new THREE.Vector3(),
    }),
    [],
  );

  /** Where the craft is at `t` along the approach out of the loading screen. */
  const arriveAt = useMemo(() => {
    return (t: number, into: THREE.Vector3) => {
      const c = Math.min(1, Math.max(0, t));
      // Horizontal first and finished early; height carries on to the end.
      const lateral = smoothstep(0, ARRIVE_LATERAL_DONE, c);
      const angle = flight.current.target * step - ARRIVE_SWEEP * (1 - lateral);
      const r = radius + ARRIVE_OUT * (1 - lateral);
      // Flat at both ends: it leaves the hold at zero speed and arrives at the
      // pad at zero speed, so there is no jolt at either join.
      const drop = smoothstep(0, 1, c);
      return into.set(
        Math.sin(angle) * r,
        PARK_HEIGHT + ARRIVE_HEIGHT * (1 - drop),
        Math.cos(angle) * r,
      );
    };
  }, [radius, step]);

  /** Where the craft is at `t` along the current transfer. */
  const at = useMemo(() => {
    return (t: number, into: THREE.Vector3) => {
      const state = flight.current;
      const c = Math.min(1, Math.max(0, t));

      // Everything horizontal happens in the first stretch and is complete
      // before the descent starts: the angle round the ring finishes here...
      const angle =
        state.fromAngle + state.sweep * smoothstep(0, LATERAL_DONE, c);

      // ...and so does the outward bulge, which is what used to leave it half
      // a unit outside the orbit at the top of the descent and bring it in
      // sideways. One arch over the crossing only, zero at both of its ends.
      const cross = Math.sin(
        Math.PI * Math.min(1, Math.max(0, c / LATERAL_DONE)),
      );
      const weave = cross * state.lean;

      const r =
        radius +
        BULGE * cross +
        WEAVE_RADIAL * weave * Math.sin(c * Math.PI * 2.7 + state.phase);

      // Height is the only thing still moving at the end. Up quickly, hold,
      // then settle — and `smoothstep` is flat at both ends, so the descent
      // begins from a hover and arrives at zero vertical speed, which is the
      // whole difference between landing and hitting the ground.
      const rise = smoothstep(0, 0.22, c);
      const drop = smoothstep(DESCENT_FROM, 1.0, c);
      const y =
        PARK_HEIGHT +
        CLIMB * rise * (1 - drop) +
        WEAVE_VERTICAL *
          weave *
          Math.sin(c * Math.PI * 1.9 + state.phase * 1.7 + 1.1);

      return into.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
    };
  }, [radius]);

  const path = useMemo(() => makeTrail(TRAIL), []);
  const exhaust = useMemo(() => makeSparks(SPARKS), []);
  useEffect(
    () => () => {
      path.dispose();
      exhaust.dispose();
    },
    [path, exhaust],
  );

  useFrame((_, delta) => {
    const node = craft.current;
    if (!node) return;

    const state = flight.current;
    const arrival_ = arrival.current;
    const wanted = frontRef.current ?? 0;

    if (state.target === -1) {
      // First frame: start parked over whatever is already at the front.
      state.target = wanted;
      state.fromAngle = wanted * step;
      state.sweep = 0;
      state.t = 1;
      // Unless the loading screen is still up, in which case this craft has
      // not landed yet — it is the one that just left the pad up there.
      arrival_.wanted = document.documentElement.dataset.preloader === "on";
    }

    const arriving = arrival_.wanted && arrival_.t < 1;

    // The pad is fixed the moment the descent begins. If the carousel moves on
    // while it is coming down it lands anyway and flies the leg afterwards,
    // rather than sliding sideways through its own approach.
    if (!arriving && wanted !== state.target) {
      // Leave from wherever it actually is, not from the planet it left.
      at(state.t, scratch.here);
      state.fromAngle = Math.atan2(scratch.here.x, scratch.here.z);
      state.sweep = shortestTurn(state.fromAngle, wanted * step);
      // Fixed by destination rather than random, so a given leg always flies
      // the same way and the system stays deterministic.
      state.phase = (wanted * 2.399963) % (Math.PI * 2);
      state.lean = wanted % 2 === 0 ? 1 : -1;
      state.target = wanted;
      state.t = 0;
    }

    if (arriving) {
      if (arrival_.released) {
        arrival_.t = Math.min(1, arrival_.t + delta / ARRIVE_SECONDS);
      }
      arriveAt(arrival_.t, scratch.here);
    } else {
      state.t = Math.min(1, state.t + delta / TRANSFER);
      at(state.t, scratch.here);
    }
    node.position.copy(scratch.here);

    const flying = !arriving && state.t < 1;
    /** Under power: leaves a plume and a trail behind it. */
    const burning = flying || (arriving && arrival_.released);

    if (arriving && arrival_.released) {
      // Tail-first down the approach: the craft points *against* its own
      // velocity, because the engine is what is holding the descent back. The
      // lerp to vertical is only a stabiliser — velocity goes to zero at
      // touchdown, and a direction derived from nothing is a direction that
      // spins.
      arriveAt(Math.min(1, arrival_.t + 0.02), scratch.ahead);
      arriveAt(Math.max(0, arrival_.t - 0.02), scratch.behind);
      scratch.forward.subVectors(scratch.behind, scratch.ahead);
      if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
      else scratch.forward.normalize();
      scratch.forward.lerp(
        scratch.up,
        smoothstep(ARRIVE_LATERAL_DONE - 0.3, ARRIVE_LATERAL_DONE, arrival_.t),
      );
      if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
      scratch.forward.normalize();
    } else if (flying) {
      // Along the path it is actually flying...
      at(Math.min(1, state.t + 0.02), scratch.ahead);
      at(Math.max(0, state.t - 0.02), scratch.behind);
      scratch.forward.subVectors(scratch.ahead, scratch.behind);
      if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
      else scratch.forward.normalize();

      // ...except at the two ends. It leaves the pad vertically and returns to
      // vertical for the descent, because velocity on final approach points
      // straight down and flying that attitude means landing on the nose.
      const upright = Math.max(
        1 - smoothstep(0, 0.15, state.t),
        // Fully vertical by the time the descent starts, so the whole drop is
        // flown tail-down rather than rotating on the way in.
        smoothstep(LATERAL_DONE - 0.18, LATERAL_DONE, state.t),
      );
      scratch.forward.lerp(scratch.up, upright);
      if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
      scratch.forward.normalize();
    } else {
      // Parked: standing on its tail.
      scratch.forward.copy(scratch.up);
    }

    scratch.aim.setFromUnitVectors(scratch.up, scratch.forward);
    node.quaternion.slerp(scratch.aim, 1 - Math.exp(-9 * delta));

    // Hard off the pad, nothing through the coast, then a retro burn that
    // holds the descent back and cuts at touchdown.
    const thrust = arriving
      ? // Falling free out of the sky, then a hard retro burn that takes the
        // speed off and cuts the instant it is down.
        arrival_.released
        ? 0.04 +
          smoothstep(0.18, 0.58, arrival_.t) *
            (1 - smoothstep(0.93, 1.0, arrival_.t)) *
            1.05
        : 0
      : flying
        ? 0.05 +
          Math.exp(-state.t * 6.5) * 0.95 +
          smoothstep(LATERAL_DONE - 0.1, LATERAL_DONE + 0.08, state.t) *
            (1 - smoothstep(0.96, 1.0, state.t)) *
            0.85
        : 0.05;

    if (hullMaterial.current) {
      hullMaterial.current.uniforms.uStar.value.copy(sunRef.current);
    }
    if (flameMaterial.current) {
      flameMaterial.current.uniforms.uTime.value += delta;
      flameMaterial.current.uniforms.uThrust.value = thrust;
    }
    if (flame.current) {
      flame.current.scale.set(1, 0.6 + thrust * 2.4, 1);
    }

    // The nozzle sits a little behind the centre of mass.
    scratch.nozzle
      .set(0, -0.075, 0)
      .applyQuaternion(node.quaternion)
      .add(scratch.here);

    path.push(scratch.here, delta, burning);
    exhaust.emit(scratch.nozzle, scratch.forward, delta, thrust, burning);
  });

  return (
    <group>
      <group ref={craft}>
        <mesh geometry={hull} frustumCulled={false}>
          <shaderMaterial
            ref={hullMaterial}
            uniforms={hullUniforms}
            vertexShader={HULL_VERT}
            fragmentShader={HULL_FRAG}
            toneMapped={false}
          />
        </mesh>

        {/* The plume. Anchored at the nozzle and grown downward, so thrust
            reads as length rather than as brightness alone. */}
        <mesh ref={flame} position={[0, -0.093, 0]} frustumCulled={false}>
          <coneGeometry args={[0.017, 0.09, 12, 1, true]} />
          <shaderMaterial
            ref={flameMaterial}
            uniforms={flameUniforms}
            vertexShader={FLAME_VERT}
            fragmentShader={FLAME_FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Built in JS rather than as JSX: `<line>` is also an SVG element, and
          the two JSX namespaces collide. */}
      <primitive object={path.object} />
      <primitive object={exhaust.object} />
    </group>
  );
}

/** Hermite ramp between two edges, flat at both ends. */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Signed angle from `a` to `b`, taking whichever way round is shorter. */
function shortestTurn(a: number, b: number) {
  let turn = (b - a) % (Math.PI * 2);
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  return turn;
}

/**
 * The craft: a fuselage, a nose, a nozzle, and three fins, merged into one
 * geometry. `aTint` marks which parts are painted rather than hull, so a
 * single material can do both without a second draw call.
 */
function buildCraft(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const tag = (geometry: THREE.BufferGeometry, tint: number) => {
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute(
      "aTint",
      new THREE.BufferAttribute(new Float32Array(count).fill(tint), 1),
    );
    parts.push(geometry);
  };

  const body = new THREE.CylinderGeometry(0.019, 0.023, 0.1, 14, 1);
  tag(body, 0);

  const nose = new THREE.ConeGeometry(0.019, 0.052, 14);
  nose.translate(0, 0.076, 0);
  tag(nose, 1);

  // A painted band, which is most of what makes a small object read as built.
  const band = new THREE.CylinderGeometry(0.0235, 0.0235, 0.016, 14, 1);
  band.translate(0, 0.018, 0);
  tag(band, 1);

  const nozzle = new THREE.CylinderGeometry(0.0235, 0.014, 0.022, 14, 1, true);
  nozzle.translate(0, -0.061, 0);
  tag(nozzle, 0);

  for (let i = 0; i < 3; i += 1) {
    const fin = new THREE.BoxGeometry(0.004, 0.036, 0.03);
    fin.translate(0, -0.04, 0.026);
    fin.rotateY((i / 3) * Math.PI * 2);
    tag(fin, 1);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("rocket geometry failed to merge");
  merged.computeVertexNormals();
  return merged;
}

/** The flown path, as a ring buffer drawn oldest-to-newest. */
function makeTrail(size: number) {
  const positions = new Float32Array(size * 3);
  const ages = new Float32Array(size).fill(99);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAge", new THREE.BufferAttribute(ages, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const material = new THREE.ShaderMaterial({
    vertexShader: PATH_VERT,
    fragmentShader: PATH_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const object = new THREE.Line(geometry, material);
  object.frustumCulled = false;

  let head = 0;
  let since = 0;

  return {
    object,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    push(point: THREE.Vector3, delta: number, flying: boolean) {
      for (let i = 0; i < size; i += 1) ages[i] += delta;

      since += delta;
      // One sample every 25ms is plenty for a line this short, and it keeps
      // the ribbon the same length whatever the frame rate is.
      if (flying && since >= 0.025) {
        since = 0;
        positions[head * 3] = point.x;
        positions[head * 3 + 1] = point.y;
        positions[head * 3 + 2] = point.z;
        ages[head] = 0;
        // The next slot is the oldest; park it on top of the newest so the
        // ring buffer's seam is a zero-length segment rather than a chord
        // straight across the scene.
        head = (head + 1) % size;
        positions[head * 3] = point.x;
        positions[head * 3 + 1] = point.y;
        positions[head * 3 + 2] = point.z;
        ages[head] = 99;
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAge.needsUpdate = true;
    },
  };
}

/** Exhaust: emitted at the nozzle, left behind in world space, fading. */
function makeSparks(size: number) {
  const positions = new Float32Array(size * 3);
  const ages = new Float32Array(size).fill(99);
  const seeds = new Float32Array(size);
  for (let i = 0; i < size; i += 1) seeds[i] = Math.random();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aAge", new THREE.BufferAttribute(ages, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: {
        value:
          typeof window === "undefined"
            ? 1
            : Math.min(window.devicePixelRatio, 2),
      },
      uLife: { value: SPARK_LIFE },
    },
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;

  let head = 0;
  let owed = 0;

  return {
    object,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    emit(
      point: THREE.Vector3,
      forward: THREE.Vector3,
      delta: number,
      thrust: number,
      flying: boolean,
    ) {
      for (let i = 0; i < size; i += 1) ages[i] += delta;

      owed += delta * (flying ? 130 * thrust : 6);
      while (owed >= 1) {
        owed -= 1;
        // Scattered backwards out of the nozzle, then left where it was: the
        // plume is stationary and the craft flies away from it.
        const spread = 0.012;
        positions[head * 3] =
          point.x - forward.x * 0.01 + (Math.random() - 0.5) * spread;
        positions[head * 3 + 1] =
          point.y - forward.y * 0.01 + (Math.random() - 0.5) * spread;
        positions[head * 3 + 2] =
          point.z - forward.z * 0.01 + (Math.random() - 0.5) * spread;
        ages[head] = 0;
        head = (head + 1) % size;
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAge.needsUpdate = true;
    },
  };
}
