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
 * How far the craft's centre sits above whatever it is standing on.
 *
 * Its own nozzle, and nothing more. Measured off the geometry above rather than
 * chosen: the body runs to -0.05, the fins to -0.058, and the nozzle is the
 * lowest thing on it at -0.072. The plume reaches -0.138, but a plume is not
 * landing gear and by touchdown there is no thrust behind it.
 *
 * Two errors were stacked here. The height was a single 0.44 chosen to clear
 * the *largest* planet, so on the other six the craft rested a quarter of a
 * unit over the surface, which is sixty per cent of one of those planets' own
 * diameter. And 0.44 was itself the flame's reach rather than the hull's, so
 * even on the large one it hovered another 0.068. Per planet, and to the
 * nozzle, it stands on the ground.
 *
 * It is the clearance *in the picture*, though, not in the world — see
 * `standoff` below for why those stop being the same thing as soon as the
 * camera climbs.
 */
const TAIL_CLEAR = 0.072;

/**
 * The least of the pole that a view is allowed to keep.
 *
 * A guard, not a tuning knob. `standoff` divides by this, so a camera looking
 * exactly down a planet's axis would otherwise ask for an infinite one. No
 * framing on this site comes near it: the shallowest is 0.66.
 */
const POLE_MIN = 0.35;

/**
 * How high the craft's centre rides over a planet of radius `size`, given how
 * much of the pole the camera can still see.
 *
 * The craft parks on the planet's north pole, and a pole is the one place on a
 * sphere that a camera looking down at it cannot show you. `pole` is how much
 * of an offset along that axis survives the projection: 1 with the camera level
 * with the orbit plane, 0 with it straight overhead. Everything on this ring is
 * seen from above, so it is never 1 — and the clearance has to be solved in the
 * picture rather than in the world, or the craft is drawn inside the disc it is
 * standing on.
 *
 * Solved so the *foot* lands on the *drawn* edge: the nozzle sits `size / pole`
 * out, which projects to exactly `size`, which is the silhouette. Add the
 * nozzle back and that is where the centre goes.
 *
 * At `pole = 1` this returns `size + TAIL_CLEAR` — the old constant, exactly —
 * so the edge-on case is unchanged and the world-space landing it describes is
 * still what a level camera would see. Everything else is the same landing,
 * held at the same apparent height as the view tips over.
 *
 * How far the craft's centre reaches, as a fraction of the planet's drawn
 * radius. Under 1 is a craft inside the outline it is supposed to be standing
 * on, which is what "it doesn't land on the planet" was:
 *
 *                        pole   before   after
 *   1600x900  featured   0.814   1.010   1.195
 *   1600x900  the six    0.814   1.107   1.293
 *    786x1764 featured   0.741   0.919   1.178   <- inside the disc
 *    786x1764 the six    0.741   1.008   1.267
 *     393x700 featured   0.658   0.816   1.158   <- and worse on a real phone
 *     393x700 the six    0.658   0.895   1.237
 *
 * The foot lands at exactly 1.000 in all six, which is the whole design: it is
 * one number now instead of six, and it is the number that means "on the edge".
 *
 * The featured planet fails first because it is the largest, and it is the one
 * at the front on load — so the worst case on the site was the first thing a
 * phone visitor saw. A wide screen was never right either, only close enough:
 * 1.010 is the craft's centre a hundredth of a radius past the limb, with its
 * feet already a fifth of the way inside.
 */
function standoff(size: number, pole: number) {
  return size / Math.max(POLE_MIN, pole) + TAIL_CLEAR;
}

/** Where the coast hands over to the landing burn. */
const TOUCH_FROM = 0.62;
/** Length of that burn, as a fraction of the transfer. */
const BURN = 1 - TOUCH_FROM;
/*
 * The sweep is spread over rather more of the flight than the coast uses.
 *
 * It only matters that the ease is still climbing where the coast stops, so
 * the burn is handed a craft that is genuinely still moving sideways and has
 * to deal with it. That is the whole scenario.
 */
const SWEEP_SPAN = 0.86;
/** How much of the cruise height the coast gives back before the burn. */
const SETTLE = 0.3;
/*
 * How much of the burn is spent killing the sideways motion.
 *
 * Cross-range first, then straight down — which is both what a real descent
 * does and what the version before this was reaching for. The difference is
 * that the horizontal profile here reaches its end with zero velocity *and*
 * zero acceleration, so stopping it is free. The old one stopped a bulge that
 * was still moving at nearly three units a second, and that is the corner.
 */
const LAT_END = 0.7;
/** Gravity, world units per second squared. Sets how far it leans on the burn. */
const GRAVITY = 3.0;
/*
 * Where it turns round, and how fast it is allowed to.
 *
 * A booster flips over the top of its arc, not on the way down: by the time
 * the engine lights it is already pointing back along its own track. The rate
 * cap is the part that matters — a first-order chase is proportional, not
 * bounded, so handed a 173-degree step it starts at about two thousand degrees
 * a second, which reads as a glitch rather than as a manoeuvre.
 */
const FLIP_FROM = 0.42;
const MAX_TURN = (300 * Math.PI) / 180;
/** How hard the attitude chases its target, per second. */
const CHASE = 12;


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
  sizes,
  frontRef,
  sunRef,
}: {
  count: number;
  radius: number;
  /** Radius of each planet, in ring order. The craft stands on top of these. */
  sizes: number[];
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
    /** Pad height at each end of the current leg. They differ whenever the two
     *  planets do, which is most legs. */
    parkFrom: 0.44,
    parkTo: 0.44,
    /** The burn's initial conditions, read off the coast when a leg begins. */
    hold: new THREE.Vector3(),
    holdVel: new THREE.Vector3(),
    holdAcc: new THREE.Vector3(),
    pad: new THREE.Vector3(),
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

  /**
   * How much of the pole survives the projection: 1 when the camera is level
   * with the orbit plane, 0 when it is straight overhead. Written each frame,
   * read by `parkAt`.
   */
  const pole = useRef(1);

  /** How high the craft's centre rides over planet `i`. */
  const parkAt = useMemo(() => {
    return (i: number) => {
      const size = sizes[((i % sizes.length) + sizes.length) % sizes.length] ?? 0.3;
      return standoff(size, pole.current);
    };
  }, [sizes]);

  const scratch = useMemo(
    () => ({
      here: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      behind: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      aim: new THREE.Quaternion(),
      nozzle: new THREE.Vector3(),
      eye: new THREE.Vector3(),
      pad: new THREE.Vector3(),
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
        parkAt(flight.current.target) + ARRIVE_HEIGHT * (1 - drop),
        Math.cos(angle) * r,
      );
    };
  }, [parkAt, radius, step]);

  /**
   * The crossing, before the engine relights. Lift, arch, weave, drift down.
   *
   * Nothing in here is clamped. The old version ran its arch as
   * `sin(pi * min(1, c / 0.68))` so it could stop the sideways travel dead at
   * that point, and the slope of that at the clamp is -pi/0.68 rather than
   * zero — radial speed went from about -2.9 units per unit t to exactly 0
   * between one frame and the next. That is the corner. This is only ever
   * evaluated below `TOUCH_FROM`, which is inside `SWEEP_SPAN`, so there is no
   * clamp here for one to hide in.
   */
  const coastAt = useMemo(() => {
    return (t: number, into: THREE.Vector3) => {
      const state = flight.current;
      const c = Math.min(1, Math.max(0, t));

      const angle = state.fromAngle + state.sweep * smoothstep(0, SWEEP_SPAN, c);
      const arch = Math.sin(Math.PI * (c / SWEEP_SPAN));
      const weave = arch * state.lean;

      const r =
        radius +
        BULGE * arch +
        WEAVE_RADIAL * weave * Math.sin(c * Math.PI * 2.7 + state.phase);

      // Climbs off the pad and then gives a little of it back on the way over,
      // so the burn is handed a craft already descending rather than one
      // hanging at cruise height.
      const hold =
        smoothstep(0, 0.22, c) * (1 - SETTLE * smoothstep(0.34, 1.0, c));
      /* Drifts from the pad it left to the pad it is going to, because those
         are different heights whenever the two planets are different sizes.
         Anchored at c = 0 so there is no step as it lifts off, and the burn
         takes the last of it to `pad.y` regardless. */
      const y =
        state.parkFrom + (state.parkTo - state.parkFrom) * c +
        CLIMB * hold +
        WEAVE_VERTICAL *
          weave *
          Math.sin(c * Math.PI * 1.9 + state.phase * 1.7 + 1.1);

      return into.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
    };
  }, [radius]);

  /**
   * Read off the coast where the burn takes over: where, how fast, and turning
   * how hard. These three are the burn's initial conditions, and handing them
   * over is what makes the join smooth rather than something to be tuned.
   */
  const solveBurn = useMemo(() => {
    return () => {
      const state = flight.current;
      const e = 1e-3;
      coastAt(TOUCH_FROM, scratch.here);
      coastAt(TOUCH_FROM + e, scratch.ahead);
      coastAt(TOUCH_FROM - e, scratch.behind);

      state.hold.copy(scratch.here);
      state.holdVel
        .subVectors(scratch.ahead, scratch.behind)
        .multiplyScalar(1 / (2 * e));
      state.holdAcc
        .copy(scratch.ahead)
        .add(scratch.behind)
        .addScaledVector(scratch.here, -2)
        .multiplyScalar(1 / (e * e));

      const to = state.fromAngle + state.sweep;
      state.pad.set(Math.sin(to) * radius, state.parkTo, Math.cos(to) * radius);
    };
  }, [coastAt, radius, scratch]);

  /** Where the craft is at `t` along the current transfer. */
  const at = useMemo(() => {
    return (t: number, into: THREE.Vector3) => {
      const c = Math.min(1, Math.max(0, t));
      if (c <= TOUCH_FROM) return coastAt(c, into);

      const st = flight.current;
      const s = (c - TOUCH_FROM) / BURN;
      return into.set(
        burnAxis(s, LAT_END, st.hold.x, st.holdVel.x, st.holdAcc.x, st.pad.x).p,
        burnAxis(s, 1, st.hold.y, st.holdVel.y, st.holdAcc.y, st.pad.y).p,
        burnAxis(s, LAT_END, st.hold.z, st.holdVel.z, st.holdAcc.z, st.pad.z).p,
      );
    };
  }, [coastAt]);

  /** What the engine is doing at `t`, in world units per second squared. */
  const burnAccelAt = useMemo(() => {
    return (t: number, into: THREE.Vector3) => {
      const st = flight.current;
      const s = (Math.min(1, Math.max(TOUCH_FROM, t)) - TOUCH_FROM) / BURN;
      const k = 1 / (TRANSFER * TRANSFER);
      return into.set(
        burnAxis(s, LAT_END, st.hold.x, st.holdVel.x, st.holdAcc.x, st.pad.x).a * k,
        burnAxis(s, 1, st.hold.y, st.holdVel.y, st.holdAcc.y, st.pad.y).a * k,
        burnAxis(s, LAT_END, st.hold.z, st.holdVel.z, st.holdAcc.z, st.pad.z).a * k,
      );
    };
  }, []);

  const path = useMemo(() => makeTrail(TRAIL), []);
  const exhaust = useMemo(() => makeSparks(SPARKS), []);
  useEffect(
    () => () => {
      path.dispose();
      exhaust.dispose();
    },
    [path, exhaust],
  );

  useFrame((rendered, delta) => {
    const node = craft.current;
    if (!node) return;

    const state = flight.current;
    const arrival_ = arrival.current;
    const wanted = frontRef.current ?? 0;

    /*
     * How much of the pole the camera can see, at the pad it is heading for.
     *
     * Worked out in the ring's own frame rather than in world space, so `y` is
     * the orbit plane's normal by construction and the whole thing is one dot
     * product. The transform is a rotation and a translation, so the angle it
     * measures is the same angle either side of it.
     *
     * Aimed at the destination planet's centre rather than at the craft: it is
     * that planet's outline the foot has to land on, and reading it off the
     * craft would make the number move as the craft flew.
     */
    const frame = node.parent;
    if (frame) {
      frame.updateWorldMatrix(true, false);
      scratch.eye.copy(rendered.camera.position);
      frame.worldToLocal(scratch.eye);
      const aim = wanted * step;
      scratch.pad
        .set(Math.sin(aim) * radius, 0, Math.cos(aim) * radius)
        .sub(scratch.eye)
        .normalize();
      pole.current = Math.sqrt(Math.max(0, 1 - scratch.pad.y * scratch.pad.y));
    }

    if (state.target === -1) {
      // First frame: start parked over whatever is already at the front.
      state.target = wanted;
      state.fromAngle = wanted * step;
      state.sweep = 0;
      state.t = 1;
      state.parkFrom = parkAt(wanted);
      state.parkTo = state.parkFrom;
      solveBurn();
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
      // Leaving from the height it is actually at, not from a nominal pad: it
      // may be departing mid-flight, halfway through somebody else's leg.
      state.parkFrom = scratch.here.y;
      state.parkTo = parkAt(wanted);
      state.target = wanted;
      state.t = 0;
      solveBurn();
    }

    /*
     * Parked, on whatever ring exists now.
     *
     * The pad is solved once, when a leg begins, and then held — which is right
     * for a craft in flight and wrong for one that has already landed, because
     * the ring it landed on can be re-measured underneath it. `HeroScene` opens
     * with `frameRing(16 / 9)` and corrects to the real viewport a frame later,
     * and a portrait viewport draws the ring in at 3.05 against that guess of
     * 3.45. The planets take their position from the prop every render and move.
     * A pad solved on the first frame did not, so the craft spent its first
     * landing four tenths of a unit outboard of the planet it was standing on:
     * past the limb, over open space, and only ever on the *first* landing,
     * because the next transfer re-solved it against the ring that was actually
     * there. Which is exactly how it was reported — the very first one, on a
     * phone, and never again.
     *
     * Re-derived rather than remembered. `to` is the angle it landed at, and
     * everything else about the pad follows from the geometry as it is now.
     */
    if (!arriving && state.t >= 1) {
      const to = state.fromAngle + state.sweep;
      state.parkTo = parkAt(state.target);
      state.parkFrom = state.parkTo;
      state.pad.set(
        Math.sin(to) * radius,
        state.parkTo,
        Math.cos(to) * radius,
      );
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
      /*
       * Nose-first across, engine-first down.
       *
       * The attitude is not a shape any more, it is where the thrust has to
       * point. On the crossing there is no thrust, so it flies along its own
       * velocity. Over the top of the arc it turns round — before the engine
       * lights, which is the order a booster does it in. From there it points
       * along thrust: retrograde and tilted back while the sideways speed is
       * being killed, and exactly vertical once that is gone, because the
       * horizontal part of the burn has finished and the only acceleration
       * left is the one holding it up.
       */
      if (state.t >= FLIP_FROM) {
        // Before the burn the target is the attitude the burn will want, so
        // the turn is finished by the time it is needed.
        burnAccelAt(Math.max(state.t, TOUCH_FROM), scratch.forward);
        scratch.forward.y += GRAVITY;
        if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
        scratch.forward.normalize();
      } else {
        at(Math.min(1, state.t + 0.02), scratch.ahead);
        at(Math.max(0, state.t - 0.02), scratch.behind);
        scratch.forward.subVectors(scratch.ahead, scratch.behind);
        if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
        else scratch.forward.normalize();
        // It still leaves the pad standing up: velocity off the pad is
        // vertical anyway, but the first frames of it are noisy.
        scratch.forward.lerp(scratch.up, 1 - smoothstep(0, 0.15, state.t));
        if (scratch.forward.lengthSq() < 1e-9) scratch.forward.copy(scratch.up);
        scratch.forward.normalize();
      }
    } else {
      // Parked: standing on its tail.
      scratch.forward.copy(scratch.up);
    }

    scratch.aim.setFromUnitVectors(scratch.up, scratch.forward);
    /*
     * Chased, but never faster than the vehicle could turn.
     *
     * The chase on its own is proportional: the further it has to go the
     * faster it starts, and the turn onto the burn is most of a half turn. Cap
     * it and the flip becomes a manoeuvre with a duration instead of a jump —
     * measured at 300 degrees a second, which is where the cap is.
     */
    const off = 2 * Math.acos(Math.min(1, Math.abs(node.quaternion.dot(scratch.aim))));
    const chase = 1 - Math.exp(-CHASE * delta);
    node.quaternion.slerp(
      scratch.aim,
      off > 1e-6 ? Math.min(chase, (MAX_TURN * delta) / off) : 1,
    );

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
          // Lights at the handoff and throttles down as the last of the speed
          // comes off, which is when it needs the least of it.
          smoothstep(TOUCH_FROM - 0.04, TOUCH_FROM + 0.04, state.t) *
            (1 - smoothstep(0.9, 1.0, state.t)) *
            0.95
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
/**
 * One axis of the landing burn: where it is, and what the engine is doing.
 *
 * A quintic Hermite, matched at both ends on position, velocity *and*
 * acceleration. The two extra conditions are not decoration. At the top they
 * let the burn inherit the coast's own curvature, so the join has no jerk in
 * it; at the bottom they force the acceleration to zero, which means thrust
 * there is doing nothing but holding the craft's weight — and since the craft
 * points along its thrust, that is what lets it touch down standing straight
 * rather than leaning.
 *
 * `end` is where this axis finishes. The horizontal ones stop early, at
 * `LAT_END`, and holding them after that costs nothing precisely because both
 * of their derivatives are already zero there. That is the whole fix: the old
 * path stopped its sideways travel with a clamp while it was still moving.
 */
function burnAxis(
  s: number,
  end: number,
  p0: number,
  v0: number,
  a0: number,
  p1: number,
) {
  const u = Math.min(1, s / end);
  const d = BURN * end;
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;

  const m0 = v0 * d;
  const c0 = a0 * d * d;

  const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
  const h1 = u - 6 * u3 + 8 * u4 - 3 * u5;
  const h2 = 0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5;
  const h3 = 10 * u3 - 15 * u4 + 6 * u5;

  const p = h0 * p0 + h1 * m0 + h2 * c0 + h3 * p1;

  if (s >= end) return { p, a: 0 };

  const d0 = -60 * u + 180 * u2 - 120 * u3;
  const d1 = -36 * u + 96 * u2 - 60 * u3;
  const d2 = 1 - 9 * u + 18 * u2 - 10 * u3;
  const d3 = 60 * u - 180 * u2 + 120 * u3;
  return { p, a: (d0 * p0 + d1 * m0 + d2 * c0 + d3 * p1) / (d * d) };
}

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
