"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Cadence } from "./Cadence";
import {
  STATIONS,
  WEB,
  rowsFor,
  type Frame,
  type Station,
} from "@/lib/print-inspection";

/**
 * The EXT705 press, built from the line diagram: paper roll, printer, overhead
 * camera on its gantry, the operator's workstation, and the printed web
 * lifting away over the turn rollers.
 *
 * The thing worth getting right here is that tickets come off this press in a
 * bunch, not one at a time. Seven abreast across the width of the web, three
 * rows to a camera frame, twenty-one Q-blocks in a single bitmap. So the web
 * is a continuous ribbon with a contiguous grid of tickets printed on it, and
 * the strobe fires once per *frame* — which is exactly what the count gate is
 * counting when it insists on 21.
 *
 * Everything that moves is driven off one number, `travel`. The roll unwinds
 * at the rate the web is leaving it, the nip rollers and turn rollers spin at
 * the rate the web over them demands, and the tickets never slide relative to
 * the web they are printed on, because they are placed from the same figure.
 */

/* ------------------------------------------------------------------ layout */

/** Across the web: seven columns, and the pitch between them. */
const COL_PITCH = 0.5;
const WEB_HALF = (WEB.columns * COL_PITCH) / 2 + 0.11;
/** Along the web: one row of seven per this many units. */
const ROW_PITCH = 1.1;
/** One ticket, in world units: narrow across the web, long along it. */
const TICKET_ACROSS = 0.42;
const TICKET_ALONG = 0.95;

const WEB_FROM = -7.55;
const WEB_END = 9.6;

/** Where the web lifts over the turn rollers on its way out. */
const ARCH_FROM = 5.6;
const ARCH_TO = 9.4;
const ARCH_RISE = 1.45;

const at = (id: string) => STATIONS.find((s) => s.id === id)!;
const ROLL_AT = at("unwind").x;
const PRESS_AT = at("press").x;
const CAMERA_AT = at("camera").x;
const DESK_AT = at("engine").x;

/** Where the web comes out of the printer already printed. */
const PRINTED_AT = PRESS_AT + 1.15;

/** Frames alive on the web at once, and the instance budget that implies. */
const MAX_FRAMES = 8;
const MAX_TICKETS = MAX_FRAMES * WEB.columns * WEB.rowsFull;

/**
 * How much slower than life this runs.
 *
 * The line did three frames a second. At three a second a frame crosses this
 * whole scene in a shade over a second and there is nothing to look at, so the
 * press here runs at a seventh of that. Only the wall clock is scaled: the
 * verdicts, the counts and the latency figures quoted on the page are the
 * measured ones.
 */
const SLOWDOWN = 7;

/** Height of the web at a point along the run. Flat, then the exit arch. */
function webY(x: number): number {
  if (x <= ARCH_FROM) return 0;
  const t = Math.min(1, (x - ARCH_FROM) / (ARCH_TO - ARCH_FROM));
  return ARCH_RISE * t * t * (3 - 2 * t);
}

/** The web's slope there, so anything printed on it lies flat against it. */
function webPitch(x: number): number {
  if (x <= ARCH_FROM || x >= ARCH_TO) return 0;
  const span = ARCH_TO - ARCH_FROM;
  const t = (x - ARCH_FROM) / span;
  return Math.atan((ARCH_RISE * 6 * t * (1 - t)) / span);
}

export type LineHandle = {
  /** Pulled in order; the press asks for one as a frame leaves the printer. */
  next: () => Frame;
  /** Called the instant a frame is judged, for the dashboard to catch up. */
  onJudged: (frame: Frame) => void;
  /** Seconds per frame on the real line. It ran at three a second. */
  interval: number;
  running: boolean;
};

/** Shared per-frame state the parts read to stay in step with each other. */
type Motion = {
  /** How far the web has travelled, in world units. Drives every rotation. */
  travel: number;
  /** Counts down after the strobe fires. */
  flash: number;
  /** The last verdict off the camera, for the screens and the lamps. */
  verdict: "OK" | "NG" | null;
  /** Seconds since that verdict landed, so the screen registers the change. */
  since: number;
};

const HITBOX: Record<
  string,
  { pos: [number, number, number]; size: [number, number, number] }
> = {
  unwind: { pos: [0, 1.9, 0], size: [3.4, 3.6, 4.4] },
  press: { pos: [0, 1.05, 0], size: [3.0, 2.7, 4.8] },
  camera: { pos: [0, 1.95, 0], size: [2.4, 4.3, 4.9] },
  engine: { pos: [0, 1.15, 3.9], size: [4.6, 3.1, 2.8] },
  web: { pos: [0, 1.25, 0], size: [2.8, 2.0, 4.4] },
};

export default function PrintLine({
  handleRef,
  onStation,
  active,
}: {
  handleRef: React.RefObject<LineHandle>;
  onStation: (id: string | null) => void;
  active: string | null;
}) {
  const motion = useRef<Motion>({
    travel: 0,
    flash: 0,
    verdict: null,
    since: 99,
  });

  return (
    <Canvas
      dpr={[1, 1.5]}
      // Every edge on this machine is a straight line, so multisampling is the
      // one thing here worth paying for.
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [-1.2, 9.6, 22.4], fov: 34 }}
      frameloop="never"
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      onPointerMissed={() => onStation(null)}
    >
      <Cadence />

      <Framing />

      {/* The page behind this is black, so the machine has to carry its own
          separation: a strong key from the front-right, a cool fill from
          behind, and enough ambient that a steel frame is not a silhouette. */}
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#cfe0ff", "#1a1f24", 0.55]} />
      <directionalLight position={[8, 15, 13]} intensity={1.25} />
      <directionalLight
        position={[-12, 8, -7]}
        intensity={0.42}
        color="#8fb4ff"
      />

      <Clock motion={motion} handleRef={handleRef} />

      <Web motion={motion} />
      <Frames handleRef={handleRef} motion={motion} />

      <PaperRoll motion={motion} active={active} />
      <Printer motion={motion} active={active} />
      <CameraGantry motion={motion} active={active} />
      <Workstation motion={motion} active={active} />
      <TurnRollers motion={motion} active={active} />

      <Markers onStation={onStation} active={active} />
    </Canvas>
  );
}

/** Points the default camera along the run. */
function Framing() {
  const camera = useThree((s) => s.camera);
  camera.lookAt(0.2, 0.9, 0.5);
  return null;
}

/** Advances the shared clock once per frame, before anything reads it. */
function Clock({
  motion,
  handleRef,
}: {
  motion: React.RefObject<Motion>;
  handleRef: React.RefObject<LineHandle>;
}) {
  useFrame((_, delta) => {
    const m = motion.current;
    const handle = handleRef.current;
    if (handle?.running) m.travel += webSpeed(handle.interval) * delta;
    m.flash = Math.max(0, m.flash - delta);
    m.since += delta;
  });
  return null;
}

/** World units of web per second, from the rate the real line ran at. */
function webSpeed(interval: number): number {
  const perSecond = 1 / Math.max(0.001, interval);
  return (ROW_PITCH * WEB.rowsFull * perSecond) / SLOWDOWN;
}

/* ---------------------------------------------------------------- the web */

const STEEL = "#4d5862";
const DARK_STEEL = "#333c45";
const PAPER = "#d7d2c6";

/**
 * The web itself: one ribbon running the length of the machine, displaced to
 * follow the exit arch so nothing printed on it has to float.
 */
function Web({ motion }: { motion: React.RefObject<Motion> }) {
  const geometry = useMemo(() => {
    const length = WEB_END - WEB_FROM;
    const geo = new THREE.PlaneGeometry(length, WEB_HALF * 2, 140, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((WEB_FROM + WEB_END) / 2, 0, 0);
    const position = geo.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      position.setY(i, webY(position.getX(i)));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // The lead-in: off the front of the reel, down to the first idler. It has
  // to *descend* to the right — tilted the other way it climbs back through
  // the flat run and the two surfaces fight for the same pixels.
  const leadIn = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1.62, WEB_HALF * 2);
    geo.rotateX(-Math.PI / 2);
    geo.rotateZ(-0.72);
    geo.translate(ROLL_AT + 1.02, 0.63, 0);
    return geo;
  }, []);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={PAPER}
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={leadIn}>
        <meshStandardMaterial
          color={PAPER}
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Deck motion={motion} />
    </group>
  );
}

/** The bed the flat run sits on, its rails, its legs, and the lead-in idlers. */
function Deck({ motion }: { motion: React.RefObject<Motion> }) {
  const span = ARCH_FROM - WEB_FROM + 0.6;
  const centre = (WEB_FROM + ARCH_FROM) / 2;

  return (
    <group>
      <mesh position={[centre, -0.12, 0]}>
        <boxGeometry args={[span, 0.16, WEB_HALF * 2 + 0.5]} />
        <meshStandardMaterial color={DARK_STEEL} roughness={0.85} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh key={side} position={[centre, -0.02, side * (WEB_HALF + 0.28)]}>
          <boxGeometry args={[span, 0.2, 0.14]} />
          <meshStandardMaterial
            color={STEEL}
            roughness={0.5}
            metalness={0.45}
          />
        </mesh>
      ))}

      {[WEB_FROM + 0.5, PRESS_AT, CAMERA_AT + 1.6, ARCH_FROM - 0.4].map((x) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${x}-${side}`}
            position={[x, -1.2, side * (WEB_HALF + 0.18)]}
          >
            <boxGeometry args={[0.16, 2.0, 0.16]} />
            <meshStandardMaterial color={DARK_STEEL} roughness={0.75} />
          </mesh>
        )),
      )}

      {/* The two idlers the web comes down onto, as on the diagram. */}
      {[ROLL_AT + 1.78, ROLL_AT + 2.6].map((x) => (
        <Roller
          key={x}
          motion={motion}
          position={[x, 0.15, 0]}
          radius={0.2}
          length={WEB_HALF * 2 + 0.2}
        />
      ))}
    </group>
  );
}

/* --------------------------------------------------------------- the parts */

/**
 * One roller, lying across the web and turning at the rate the web over it
 * demands.
 *
 * A cylinder's own axis is +Y, so it needs a quarter turn about X to lie
 * across the run; the spin then has to happen about world Z, and about the
 * roller's *own* centre rather than the scene's, which is what the wrapping
 * group is for. The stripe is not decoration either: a smooth grey cylinder
 * turning on its axis is indistinguishable from a stationary one.
 */
function Roller({
  motion,
  position,
  radius,
  length,
  color = "#69747f",
}: {
  motion: React.RefObject<Motion>;
  position: [number, number, number];
  radius: number;
  length: number;
  color?: string;
}) {
  const spin = useRef<THREE.Group>(null);
  useFrame(() => {
    if (spin.current) spin.current.rotation.z = -motion.current.travel / radius;
  });

  return (
    <group position={position}>
      <group ref={spin}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[radius, radius, length, 24]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[radius * 0.99, 0, 0]}>
          <boxGeometry args={[radius * 0.14, radius * 0.5, length * 0.98]} />
          <meshStandardMaterial color="#2b333a" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** The reel, paying out at exactly the rate the web is taking it. */
function PaperRoll({
  motion,
  active,
}: {
  motion: React.RefObject<Motion>;
  active: string | null;
}) {
  const reel = useRef<THREE.Group>(null);
  const RADIUS = 1.35;
  const HALF = WEB_HALF + 0.05;
  const lit = active === "unwind";

  useFrame(() => {
    if (reel.current) reel.current.rotation.z = -motion.current.travel / RADIUS;
  });

  return (
    <group position={[ROLL_AT, 1.95, 0]}>
      <group ref={reel}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[RADIUS, RADIUS, HALF * 2, 44]} />
          <meshStandardMaterial color={PAPER} roughness={0.95} />
        </mesh>
        {/* End flanges, so the rotation is actually readable. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[0, 0, side * HALF]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[RADIUS + 0.09, RADIUS + 0.09, 0.07, 44]} />
            <meshStandardMaterial
              color={lit ? "#ffd9a8" : "#3b444d"}
              roughness={0.45}
              metalness={0.5}
            />
          </mesh>
        ))}
        {/* The seam where the web leaves the roll. Without it a smooth
            cylinder turning on its axis looks perfectly still. */}
        <mesh position={[RADIUS + 0.004, 0, 0]}>
          <boxGeometry args={[0.02, 0.1, HALF * 2 - 0.02]} />
          <meshStandardMaterial color="#a1988a" roughness={0.9} />
        </mesh>
      </group>

      {/* Spindle and stand. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, HALF * 2 + 1.0, 12]} />
        <meshStandardMaterial
          color="#69747f"
          roughness={0.35}
          metalness={0.7}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, -0.98, side * (HALF + 0.42)]}>
          <boxGeometry args={[0.5, 1.95, 0.22]} />
          <meshStandardMaterial color={DARK_STEEL} roughness={0.75} />
        </mesh>
      ))}
    </group>
  );
}

/** The printer: a body the web threads through, with nip rollers each side. */
function Printer({
  motion,
  active,
}: {
  motion: React.RefObject<Motion>;
  active: string | null;
}) {
  const carriage = useRef<THREE.Mesh>(null);
  const lit = active === "press";

  useFrame((state) => {
    if (carriage.current) {
      // The head sweeps the width of the web and back, continuously.
      carriage.current.position.z =
        Math.sin(state.clock.elapsedTime * 1.5) * (WEB_HALF - 0.3);
    }
  });

  return (
    <group position={[PRESS_AT, 0, 0]}>
      {/* Body, split above and below the web so the web runs through it. */}
      <mesh position={[0, 1.15, -0.16]}>
        <boxGeometry args={[2.3, 1.5, WEB_HALF * 2 + 0.7]} />
        <meshStandardMaterial
          color={lit ? "#ffd9a8" : "#525d68"}
          roughness={0.55}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0, -0.36, -0.16]}>
        <boxGeometry args={[2.3, 0.5, WEB_HALF * 2 + 0.7]} />
        <meshStandardMaterial color={DARK_STEEL} roughness={0.7} />
      </mesh>
      {/* The traversing head, visible in the gap. */}
      <mesh ref={carriage} position={[0, 0.5, 0]}>
        <boxGeometry args={[0.9, 0.34, 0.5]} />
        <meshStandardMaterial
          color="#6c7883"
          roughness={0.35}
          metalness={0.55}
        />
      </mesh>

      {[-1.35, 1.35].map((x) => (
        <Roller
          key={x}
          motion={motion}
          position={[x, -0.06, 0]}
          radius={0.24}
          length={WEB_HALF * 2 + 0.24}
        />
      ))}
    </group>
  );
}

/**
 * The overhead camera: two posts, a top beam, the head hanging off it, and the
 * strobe cone it throws down onto the web once per frame.
 */
function CameraGantry({
  motion,
  active,
}: {
  motion: React.RefObject<Motion>;
  active: string | null;
}) {
  const cone = useRef<THREE.MeshBasicMaterial>(null);
  const pool = useRef<THREE.MeshBasicMaterial>(null);
  const lit = active === "camera";
  const HEIGHT = 3.5;
  const LENS_Y = 2.72;

  useFrame(() => {
    // A short, hard pulse when the strobe fires — not a smooth throb.
    const level = Math.min(1, motion.current.flash / 0.1);
    if (cone.current) cone.current.opacity = 0.05 + level * 0.24;
    if (pool.current) pool.current.opacity = 0.06 + level * 0.42;
  });

  return (
    <group position={[CAMERA_AT, 0, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, HEIGHT / 2, side * (WEB_HALF + 0.45)]}>
          <boxGeometry args={[0.2, HEIGHT, 0.2]} />
          <meshStandardMaterial
            color={STEEL}
            roughness={0.6}
            metalness={0.35}
          />
        </mesh>
      ))}
      <mesh position={[0, HEIGHT, 0]}>
        <boxGeometry args={[0.24, 0.2, WEB_HALF * 2 + 1.1]} />
        <meshStandardMaterial color={STEEL} roughness={0.6} metalness={0.35} />
      </mesh>

      {/* Head and lens, hanging off the beam over the middle of the web. */}
      <mesh position={[0, 3.0, 0]}>
        <boxGeometry args={[0.56, 0.5, 0.62]} />
        <meshStandardMaterial
          color={lit ? "#ffd9a8" : "#5a6572"}
          roughness={0.45}
          metalness={0.4}
        />
      </mesh>
      <mesh position={[0, LENS_Y, 0]}>
        <cylinderGeometry args={[0.17, 0.22, 0.3, 20]} />
        <meshStandardMaterial
          color="#0f1418"
          roughness={0.2}
          metalness={0.75}
        />
      </mesh>

      {/* What the camera sees, drawn as the light that shows it. */}
      <mesh position={[0, LENS_Y / 2 + 0.08, 0]}>
        <coneGeometry args={[WEB_HALF * 0.92, LENS_Y - 0.14, 28, 1, true]} />
        <meshBasicMaterial
          ref={cone}
          color="#fff4e0"
          transparent
          opacity={0.05}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[WEB_HALF * 0.92, 30]} />
        <meshBasicMaterial
          ref={pool}
          color="#fff4e0"
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * The desk: two screens reading GOOD and NO GOOD, a keyboard, the tower the
 * engine runs on, and the stack light `fx_router.py` drives.
 *
 * The screen matching the last verdict lights; the other goes quiet. That is
 * the whole operator interface, and it is the only place on the machine where
 * the answer is visible to a person.
 */
function Workstation({
  motion,
  active,
}: {
  motion: React.RefObject<Motion>;
  active: string | null;
}) {
  const good = useRef<THREE.MeshStandardMaterial>(null);
  const bad = useRef<THREE.MeshStandardMaterial>(null);
  const greenLamp = useRef<THREE.MeshStandardMaterial>(null);
  const redLamp = useRef<THREE.MeshStandardMaterial>(null);
  const lit = active === "engine";

  useFrame(() => {
    const m = motion.current;
    // Bright on the verdict, easing back to a resting glow — a screen that
    // does not settle reads as one that is being written to.
    const fresh = Math.max(0, 1 - m.since / 0.55);
    const isOk = m.verdict === "OK";
    const isNg = m.verdict === "NG";
    if (good.current)
      good.current.emissiveIntensity = isOk ? 0.5 + fresh * 1.5 : 0.09;
    if (bad.current)
      bad.current.emissiveIntensity = isNg ? 0.5 + fresh * 1.5 : 0.09;
    if (greenLamp.current)
      greenLamp.current.emissiveIntensity = isOk ? 1.1 : 0.08;
    if (redLamp.current) redLamp.current.emissiveIntensity = isNg ? 1.1 : 0.08;
  });

  return (
    <group position={[DESK_AT, 0, 3.9]}>
      {/* Desk. */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[4.0, 0.1, 1.9]} />
        <meshStandardMaterial
          color={lit ? "#ffd9a8" : "#5a5148"}
          roughness={0.8}
        />
      </mesh>
      {[-1.85, 1.85].map((x) => (
        <mesh key={x} position={[x, -0.28, 0]}>
          <boxGeometry args={[0.12, 1.15, 1.7]} />
          <meshStandardMaterial color={DARK_STEEL} roughness={0.8} />
        </mesh>
      ))}

      <Screen x={-0.95} tone="#3fbf7a" verdict="good" materialRef={good} />
      <Screen x={0.95} tone="#d84a3f" verdict="bad" materialRef={bad} />

      {/* Keyboard. */}
      <mesh position={[-0.3, 0.42, 0.55]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[1.15, 0.05, 0.42]} />
        <meshStandardMaterial color="#2a3138" roughness={0.7} />
      </mesh>

      {/* The tower the engine runs on. */}
      <mesh position={[2.5, -0.15, 0.1]}>
        <boxGeometry args={[0.7, 1.5, 1.35]} />
        <meshStandardMaterial
          color="#333b43"
          roughness={0.6}
          metalness={0.25}
        />
      </mesh>
      <mesh position={[2.5, 0.42, 0.79]}>
        <boxGeometry args={[0.42, 0.05, 0.02]} />
        <meshStandardMaterial
          color="#5fe3a1"
          emissive="#5fe3a1"
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* Stack light: green, red, and the yellow the router holds in reserve. */}
      <group position={[-2.35, 0, -0.5]}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.09, 0.12, 1.6, 12]} />
          <meshStandardMaterial color={DARK_STEEL} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.32, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.24, 18]} />
          <meshStandardMaterial
            ref={greenLamp}
            color="#5fe3a1"
            emissive="#5fe3a1"
            emissiveIntensity={0.08}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.24, 18]} />
          <meshStandardMaterial
            color="#ffd166"
            emissive="#ffd166"
            emissiveIntensity={0.05}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.84, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.24, 18]} />
          <meshStandardMaterial
            ref={redLamp}
            color="#ff6b5e"
            emissive="#ff6b5e"
            emissiveIntensity={0.08}
            roughness={0.35}
          />
        </mesh>
      </group>
    </group>
  );
}

/** One monitor, with its verdict mark built out of geometry rather than type. */
function Screen({
  x,
  tone,
  verdict,
  materialRef,
}: {
  x: number;
  tone: string;
  verdict: "good" | "bad";
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  return (
    <group position={[x, 1.15, -0.35]}>
      {/* Stand. */}
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[0.12, 0.4, 0.12]} />
        <meshStandardMaterial color="#2a3138" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.79, 0.05]}>
        <boxGeometry args={[0.6, 0.04, 0.36]} />
        <meshStandardMaterial color="#2a3138" roughness={0.7} />
      </mesh>
      {/* Bezel and panel. */}
      <mesh>
        <boxGeometry args={[1.5, 1.05, 0.09]} />
        <meshStandardMaterial color="#1d2429" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[1.36, 0.9]} />
        <meshStandardMaterial
          ref={materialRef}
          color={tone}
          emissive={tone}
          emissiveIntensity={0.5}
          roughness={0.4}
        />
      </mesh>

      {/* The mark on the panel: a tick, or a cross. */}
      {verdict === "good" ? (
        <group position={[0, 0, 0.056]}>
          {/* Two bars meeting at the low point of the tick. Rotating a
              vertical bar by a positive angle tips its top to the left, so
              the long arm — which rises to the right — takes a negative one. */}
          <mesh position={[-0.129, -0.03, 0]} rotation={[0, 0, 0.7]}>
            <planeGeometry args={[0.085, 0.34]} />
            <meshBasicMaterial color="#f2f6f4" />
          </mesh>
          <mesh position={[0.128, 0.112, 0]} rotation={[0, 0, -0.5]}>
            <planeGeometry args={[0.085, 0.62]} />
            <meshBasicMaterial color="#f2f6f4" />
          </mesh>
        </group>
      ) : (
        <group position={[0, 0, 0.056]}>
          {[0.78, -0.78].map((r) => (
            <mesh key={r} rotation={[0, 0, r]}>
              <planeGeometry args={[0.09, 0.6]} />
              <meshBasicMaterial color="#f6f0ef" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** The rollers the finished web lifts over on its way out. */
function TurnRollers({
  motion,
  active,
}: {
  motion: React.RefObject<Motion>;
  active: string | null;
}) {
  const lit = active === "web";
  const RADIUS = 0.26;
  const xs = [ARCH_FROM + 0.5, ARCH_FROM + 1.9, ARCH_FROM + 3.3];

  return (
    <group>
      {xs.map((x) => (
        <Roller
          key={x}
          motion={motion}
          position={[x, webY(x) - RADIUS - 0.02, 0]}
          radius={RADIUS}
          length={WEB_HALF * 2 + 0.3}
          color={lit ? "#ffd9a8" : "#69747f"}
        />
      ))}

      {/* The frame carrying them, on both sides of the web. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[ARCH_FROM + 1.9, 0.2, side * (WEB_HALF + 0.34)]}
          rotation={[0, 0, 0.34]}
        >
          <boxGeometry args={[4.4, 0.16, 0.14]} />
          <meshStandardMaterial
            color={STEEL}
            roughness={0.55}
            metalness={0.4}
          />
        </mesh>
      ))}
      {[ARCH_FROM + 0.5, ARCH_FROM + 3.3].map((x) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${x}-${side}`}
            position={[x, webY(x) / 2 - 0.9, side * (WEB_HALF + 0.34)]}
          >
            <boxGeometry args={[0.15, webY(x) + 1.8, 0.15]} />
            <meshStandardMaterial color={DARK_STEEL} roughness={0.75} />
          </mesh>
        )),
      )}
    </group>
  );
}

/* --------------------------------------------------------------- the print */

const BLOCK_DARK = new THREE.Color("#1b1f23");
/** A block that failed visibility or density: the ink that was not laid down. */
const BLOCK_FAINT = new THREE.Color("#9ba3ab");
const WASH_OK = new THREE.Color("#5fe3a1");
const WASH_NG = new THREE.Color("#ff6b5e");

type Live = {
  record: Frame;
  rows: number;
  /** World x of the frame's leading edge. */
  x: number;
  judged: boolean;
  /** Which of its blocks are missing, when the count came up short. */
  missing: Set<number>;
  faint: boolean;
  skewed: boolean;
};

/**
 * The printed web: the tickets, their Q-blocks, and the verdict wash.
 *
 * Each frame carries a real recorded result, and the print is drawn from it
 * rather than decorated with it. A frame the count gate turned down is drawn
 * with blocks actually missing — as many as the engine came up short. One the
 * visibility or density gates turned down has blocks too faint to read, which
 * is the failure those two gates share. One the position gate turned down has
 * blocks off their cells. So the reason on the dashboard and the thing on the
 * web are the same fact.
 */
function Frames({
  handleRef,
  motion,
}: {
  handleRef: React.RefObject<LineHandle>;
  motion: React.RefObject<Motion>;
}) {
  const tickets = useRef<THREE.InstancedMesh>(null);
  const blocks = useRef<THREE.InstancedMesh>(null);
  const wash = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const flat = useMemo(
    () =>
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2,
      ),
    [],
  );
  const pitchQ = useMemo(() => new THREE.Quaternion(), []);
  const zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  const live = useRef<Live[]>([]);
  /** World x of the upstream edge of the newest frame on the web. */
  const tail = useRef(PRINTED_AT);

  /** Lays a quad flat on the web at (x, z), tilted to match the web there. */
  const place = (x: number, z: number, lift: number) => {
    pitchQ.setFromAxisAngle(zAxis, webPitch(x));
    dummy.position.set(x, webY(x) + lift, z);
    dummy.quaternion.multiplyQuaternions(pitchQ, flat);
  };

  useFrame((_, delta) => {
    const handle = handleRef.current;
    const ticketMesh = tickets.current;
    const blockMesh = blocks.current;
    const washMesh = wash.current;
    if (!handle || !ticketMesh || !blockMesh || !washMesh) return;

    if (handle.running) {
      const step = webSpeed(handle.interval) * delta;
      tail.current += step;
      for (const item of live.current) item.x += step;

      // A new frame is printed the moment there is web for it. Frames are
      // contiguous, because the press does not leave gaps between them.
      while (tail.current > PRINTED_AT && live.current.length < MAX_FRAMES) {
        const record = handle.next();
        const rows = rowsFor(record.big);
        const expected = rows * WEB.columns;

        // The count gate's failure, drawn: the blocks it did not find.
        const missing = new Set<number>();
        if (record.big < expected) {
          let seed = Number(record.serial) || 1;
          for (let n = 0; n < expected - record.big; n += 1) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            missing.add(seed % expected);
          }
        }

        live.current.push({
          record,
          rows,
          x: tail.current,
          judged: false,
          missing,
          // checks are count, visibility, density, position.
          faint: record.checks[1] === 0 || record.checks[2] === 0,
          skewed: record.checks[3] === 0,
        });
        tail.current -= rows * ROW_PITCH;
      }

      for (const item of live.current) {
        const centre = item.x - (item.rows * ROW_PITCH) / 2;
        if (!item.judged && centre >= CAMERA_AT) {
          item.judged = true;
          motion.current.flash = 0.1;
          motion.current.verdict = item.record.status;
          motion.current.since = 0;
          handle.onJudged(item.record);
        }
      }

      live.current = live.current.filter(
        (item) => item.x - item.rows * ROW_PITCH < WEB_END,
      );
    }

    // ---- draw ------------------------------------------------------------
    let t = 0;
    let w = 0;
    for (const item of live.current) {
      for (let row = 0; row < item.rows; row += 1) {
        const x = item.x - (row + 0.5) * ROW_PITCH;
        for (let col = 0; col < WEB.columns; col += 1) {
          if (t >= MAX_TICKETS) break;
          const z = (col - (WEB.columns - 1) / 2) * COL_PITCH;

          place(x, z, 0.008);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          ticketMesh.setMatrixAt(t, dummy.matrix);

          // The Q-block: one per ticket, up near its leading edge.
          const index = row * WEB.columns + col;
          const gone = item.missing.has(index);
          const drift = item.skewed ? ((index % 3) - 1) * 0.06 : 0;
          place(x + 0.33 + drift, z - 0.1 - drift, 0.016);
          const size = gone ? 0 : 1;
          dummy.scale.set(size, size, size);
          dummy.updateMatrix();
          blockMesh.setMatrixAt(t, dummy.matrix);
          blockMesh.setColorAt(
            t,
            item.judged && item.faint ? BLOCK_FAINT : BLOCK_DARK,
          );

          t += 1;
        }
      }

      // The verdict wash, once the camera has spoken for the frame.
      if (item.judged && w < MAX_FRAMES) {
        const mid = item.x - (item.rows * ROW_PITCH) / 2;
        place(mid, 0, 0.024);
        dummy.scale.set(item.rows / WEB.rowsFull, 1, 1);
        dummy.updateMatrix();
        washMesh.setMatrixAt(w, dummy.matrix);
        tint.copy(item.record.status === "OK" ? WASH_OK : WASH_NG);
        washMesh.setColorAt(w, tint);
        w += 1;
      }
    }

    ticketMesh.count = t;
    blockMesh.count = t;
    washMesh.count = w;
    ticketMesh.instanceMatrix.needsUpdate = true;
    blockMesh.instanceMatrix.needsUpdate = true;
    washMesh.instanceMatrix.needsUpdate = true;
    if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
    if (washMesh.instanceColor) washMesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={tickets}
        args={[undefined, undefined, MAX_TICKETS]}
        frustumCulled={false}
      >
        <planeGeometry args={[TICKET_ALONG, TICKET_ACROSS]} />
        <meshStandardMaterial color="#efece4" roughness={0.95} />
      </instancedMesh>

      <instancedMesh
        ref={blocks}
        args={[undefined, undefined, MAX_TICKETS]}
        frustumCulled={false}
      >
        <planeGeometry args={[0.07, 0.15]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh
        ref={wash}
        args={[undefined, undefined, MAX_FRAMES]}
        frustumCulled={false}
      >
        <planeGeometry
          args={[ROW_PITCH * WEB.rowsFull, WEB.columns * COL_PITCH]}
        />
        <meshBasicMaterial transparent opacity={0.17} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

/* ----------------------------------------------------------------- markers */

/**
 * The named parts.
 *
 * Each station gets an invisible box over the machinery it covers. Hovering it
 * names the part; clicking opens the full explanation. The name follows the
 * pointer in rather than sitting there permanently, because five labels on
 * screen at once is a diagram, not a machine.
 */
function Markers({
  onStation,
  active,
}: {
  onStation: (id: string | null) => void;
  active: string | null;
}) {
  return (
    <group>
      {STATIONS.map((station, index) => (
        <Marker
          key={station.id}
          station={station}
          index={index}
          active={active}
          onStation={onStation}
        />
      ))}
    </group>
  );
}

function Marker({
  station,
  index,
  active,
  onStation,
}: {
  station: Station;
  index: number;
  active: string | null;
  onStation: (id: string | null) => void;
}) {
  const label = useRef<HTMLDivElement>(null);
  const isOpen = active === station.id;
  const box = HITBOX[station.id];
  const top = box.pos[1] + box.size[1] / 2 + 0.35;

  const show = (on: boolean) => {
    if (label.current) label.current.dataset.on = on || isOpen ? "1" : "0";
    document.body.style.cursor = on ? "pointer" : "";
  };

  return (
    <group position={[station.x, 0, 0]}>
      <mesh
        position={box.pos}
        onPointerOver={(event) => {
          event.stopPropagation();
          show(true);
        }}
        onPointerOut={() => show(false)}
        onClick={(event) => {
          event.stopPropagation();
          onStation(isOpen ? null : station.id);
        }}
      >
        <boxGeometry args={box.size} />
        {/* Invisible, but not `visible={false}` — the raycaster skips those
            entirely, so a hidden hit volume would never be picked. Writing no
            colour and no depth leaves it pickable and leaves no mark. */}
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>

      <Html position={[0, top + 0.45, box.pos[2]]} center distanceFactor={16}>
        <div
          ref={label}
          data-on={isOpen ? "1" : "0"}
          className="ease-brief pointer-events-none flex flex-col items-center gap-1 transition-opacity duration-[var(--dur-ui)] data-[on='0']:opacity-0 data-[on='1']:opacity-100"
        >
          <span className="label-mono border-signal bg-void text-signal border px-2 py-1 whitespace-nowrap">
            {index + 1} · {station.title}
          </span>
        </div>
      </Html>

      {/* A permanent dot, so a visitor knows there is something to hover. */}
      <Html position={[0, top, box.pos[2]]} center distanceFactor={16}>
        <span
          aria-hidden
          className={
            "block h-1.5 w-1.5 rounded-full " +
            (isOpen ? "bg-signal" : "bg-steel")
          }
        />
      </Html>
    </group>
  );
}
