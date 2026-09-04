"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";
import {
  BlackHole,
  CosmicWeb,
  FirstLight,
  Merger,
  PeakFormation,
  ProtoDisc,
  Supernova,
  YoungEarth,
  type StageProps,
} from "./cosmos/stages";
import { clamp01, gauss, makePoints, put, rng, smoothstep } from "./cosmos/shared";

/**
 * Thirteen billion years, told down the side of a scroll.
 *
 * The section this sits in is a pinned viewport with the copy on the left and
 * this on the right, and the only thing it hands over is a number: how far
 * through the section the reader has scrolled. Everything here is a function of
 * that number, which is what makes it a story rather than an animation — it
 * runs forwards when you scroll down, backwards when you scroll up, and stops
 * where you stop.
 *
 * ## How it is put together
 *
 * Eight stages, each owning a slice of the scroll and overlapping its
 * neighbours at the seams so nothing ever pops. A stage is mounted a little
 * before its slice and unmounted a little after, so at most two exist at once:
 * building every one of them up front would be a hundred and forty thousand
 * particles resident for a section most visitors scroll past.
 *
 * Behind all of them, one star field that never leaves. It is the reason the
 * cuts read as the same universe seen at different times rather than as eight
 * separate pictures — there is always something in the frame that did not
 * change.
 */

/**
 * What the pinned section hands a scene. Scroll position and the pointer arrive
 * as refs rather than props for the reason they always do here: neither may
 * cause a render, and both change every frame.
 */
export type CosmosSceneProps = {
  /** 0..1 across the whole pinned section. */
  progressRef: React.RefObject<number>;
  /** Cursor over the section in -1..1, and whether there is one. */
  pointerRef: React.RefObject<{ x: number; y: number; on: number }>;
  /** False once the section has been scrolled past; stops the render loop. */
  running: boolean;
};

/** Age of the universe now, in billions of years. Everything counts back from it. */
const NOW = 13.8;

type Chapter = {
  key: string;
  Stage: React.ComponentType<StageProps>;
  /** Age of the universe at the start and end of this stage, in Gyr. */
  from: number;
  to: number;
  epoch: string;
};

/**
 * The order of events, and when they happened.
 *
 * The ages are the real ones. First stars a couple of hundred million years in,
 * the peak of star formation around three billion, the Sun and the Earth about
 * nine — which is the fact that makes the whole sequence worth telling, because
 * it puts everything on this page in the last third of it.
 */
const CHAPTERS: Chapter[] = [
  { key: "first-light", Stage: FirstLight, from: 0.2, to: 0.9, epoch: "First light" },
  { key: "cosmic-web", Stage: CosmicWeb, from: 0.9, to: 1.7, epoch: "The cosmic web" },
  { key: "merger", Stage: Merger, from: 1.7, to: 2.8, epoch: "Galaxies collide" },
  { key: "peak", Stage: PeakFormation, from: 2.8, to: 4.0, epoch: "Peak star formation" },
  { key: "black-hole", Stage: BlackHole, from: 4.0, to: 5.6, epoch: "Black holes" },
  { key: "supernova", Stage: Supernova, from: 5.6, to: 7.6, epoch: "Death and rebirth" },
  { key: "proto-disc", Stage: ProtoDisc, from: 7.6, to: 9.2, epoch: "A new system" },
  { key: "earth", Stage: YoungEarth, from: 9.2, to: 9.8, epoch: "Earth and Moon" },
];

/** How far either side of a seam the two stages are both on screen. */
const SEAM = 0.045;
/** How far outside its own slice a stage stays built. */
const KEEP = 0.09;

const SPAN = 1 / CHAPTERS.length;

function windowFor(i: number) {
  return { start: i * SPAN, end: (i + 1) * SPAN };
}

export default function CosmosScene({
  progressRef,
  pointerRef,
  running,
}: CosmosSceneProps) {
  const captionRef = useRef<HTMLDivElement>(null);
  // Which stages are worth having built. Changes a handful of times across the
  // whole section, so it is allowed to be state.
  const [live, setLive] = useState<boolean[]>(() =>
    CHAPTERS.map((_, i) => i === 0),
  );

  const locals = useMemo(() => CHAPTERS.map(() => ({ current: 0 })), []);
  const opacities = useMemo(() => CHAPTERS.map(() => ({ current: 0 })), []);

  return (
    <>
      <Canvas
        frameloop="never"
        dpr={[1, 1.5]}
        // Every mark in here is a point sprite or a sphere whose edge is
        // already soft. Multisampling would cost a third of the frame and
        // change nothing.
        gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
        camera={{ position: [0, 0, 7.4], fov: 46 }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Cadence running={running} />
        <Fit />

        <Director
          progressRef={progressRef}
          pointerRef={pointerRef}
          locals={locals}
          opacities={opacities}
          captionRef={captionRef}
          onLive={setLive}
        />

        <Starfield pointerRef={pointerRef} />

        {CHAPTERS.map(({ key, Stage }, i) =>
          live[i] ? (
            <Stage
              key={key}
              localRef={locals[i]}
              opacityRef={opacities[i]}
              pointerRef={pointerRef}
            />
          ) : null,
        )}
      </Canvas>

      {/*
        The readout, which is the one piece of this that is text.

        Written from inside the frame loop rather than from React state: the age
        changes on every frame of a scroll, and putting that through a render
        would re-run the whole section's tree a hundred times a second to change
        four characters.
      */}
      <div
        ref={captionRef}
        className="label-mono text-steel pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center gap-4 pb-5 sm:flex"
      />
    </>
  );
}

/** Scales the whole story to whatever frame it has been given. */
function Fit() {
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    if (camera instanceof THREE.PerspectiveCamera) {
      // Narrower frames stand further back rather than cropping, so a phone
      // sees the whole of every stage instead of the middle of it.
      camera.position.z = aspect < 1 ? 7.4 / Math.max(aspect, 0.42) : 7.4;
      camera.updateProjectionMatrix();
    }
  }, [size.width, size.height, camera]);

  return null;
}

/**
 * Everything that has to happen once a frame: where the story is, which stages
 * are showing, and where the camera is standing.
 */
/**
 * How far to push the story off centre, in world units.
 *
 * The copy occupies the left of this section on anything wide enough to put
 * them side by side, so a scene centred in the viewport is a scene centred
 * underneath the text. This slides it into the half that is actually empty.
 * Below the breakpoint the copy stacks over the full width and there is no
 * empty half to slide into, so it stays where it is.
 */
function offsetFor(width: number, height: number, cameraZ: number, fov: number) {
  if (width < 1024) return 0;
  const halfHeight = cameraZ * Math.tan((fov * Math.PI) / 360);
  const halfWidth = halfHeight * (width / Math.max(1, height));
  // A little right of centre of the right-hand half.
  return halfWidth * 0.36;
}

function Director({
  progressRef,
  pointerRef,
  locals,
  opacities,
  captionRef,
  onLive,
}: {
  progressRef: React.RefObject<number>;
  pointerRef: CosmosSceneProps["pointerRef"];
  locals: { current: number }[];
  opacities: { current: number }[];
  captionRef: React.RefObject<HTMLDivElement | null>;
  onLive: (live: boolean[]) => void;
}) {
  const { camera } = useThree();
  const size = useThree((state) => state.size);
  const eased = useRef(0);
  const lean = useRef({ x: 0, y: 0 });
  const target = useMemo(() => new THREE.Vector3(), []);
  const shown = useRef("");
  const mounted = useRef<string>("0");

  useFrame((_, delta) => {
    const raw = clamp01(progressRef.current ?? 0);
    // Scroll is jumpy on a trackpad and jumpier on a wheel. Easing toward it
    // costs a frame of lag nobody can see and removes every step.
    eased.current += (raw - eased.current) * (1 - Math.exp(-6 * delta));
    const p = eased.current;

    // Which stage is nominally on, for the readout.
    let current = 0;
    const live: boolean[] = [];

    for (let i = 0; i < CHAPTERS.length; i++) {
      const { start, end } = windowFor(i);

      // In at the start, out at the end, and both edges softened — except the
      // outer two, which have nothing to hand over to.
      const rising = i === 0 ? 1 : smoothstep(start - SEAM, start + SEAM, p);
      const falling =
        i === CHAPTERS.length - 1 ? 1 : 1 - smoothstep(end - SEAM, end + SEAM, p);
      opacities[i].current = rising * falling;

      locals[i].current = clamp01((p - start) / (end - start));
      live.push(p > start - KEEP && p < end + KEEP);

      if (p >= start && p < end) current = i;
    }

    // Only tell React when the set actually changes.
    const key = live.map((on) => (on ? "1" : "0")).join("");
    if (key !== mounted.current) {
      mounted.current = key;
      onLive(live);
    }

    // The readout. Ages interpolate through the stage, so the number counts up
    // as the reader scrolls rather than stepping at each seam.
    const chapter = CHAPTERS[current];
    const age = chapter.from + (chapter.to - chapter.from) * locals[current].current;
    const label = `${format(age)} after the Big Bang · ${chapter.epoch} · ${(NOW - age).toFixed(1)} billion years ago`;
    if (label !== shown.current && captionRef.current) {
      shown.current = label;
      captionRef.current.textContent = label;
    }

    // The camera. Everything else in the story moves itself; this only leans,
    // and only a little — the stages are already turning under the pointer, and
    // two things answering one cursor at different rates reads as drift.
    const pointer = pointerRef.current;
    const settle = 1 - Math.exp(-3.6 * delta);
    lean.current.x += (pointer.x * pointer.on - lean.current.x) * settle;
    lean.current.y += (pointer.y * pointer.on - lean.current.y) * settle;

    // Moving the camera left is what puts the scene on the right.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 46;
    const shift = offsetFor(size.width, size.height, camera.position.z, fov);

    target.set(
      -shift + lean.current.x * 0.62,
      lean.current.y * 0.42,
      camera.position.z,
    );
    camera.position.x += (target.x - camera.position.x) * settle;
    camera.position.y += (target.y - camera.position.y) * settle;
    camera.lookAt(
      -shift + lean.current.x * 0.12,
      lean.current.y * 0.08,
      0,
    );
  });

  return null;
}

/** "475 million years" up to a billion, "1.7 billion" after it. */
function format(gyr: number): string {
  if (gyr < 1) return `${Math.round(gyr * 1000)} million years`;
  return `${gyr.toFixed(1)} billion years`;
}

/**
 * The one thing that never changes.
 *
 * Far enough back that nothing in any stage reaches it, and drifting slowly
 * against the pointer so it parallaxes behind everything in front of it.
 */
function Starfield({
  pointerRef,
}: {
  pointerRef: CosmosSceneProps["pointerRef"];
}) {
  const group = useRef<THREE.Group>(null);
  const lean = useRef({ x: 0, y: 0 });

  const field = useMemo(() => {
    const random = rng(31337);
    const COUNT = 2400;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const cool = new THREE.Color("#9fb6ff");
    const warm = new THREE.Color("#ffd9b0");
    for (let i = 0; i < COUNT; i++) {
      // On a shell rather than in a box, so none of them are near enough to
      // slide past the stages when the camera leans.
      const a = random() * Math.PI * 2;
      const b = Math.acos(random() * 2 - 1);
      const r = 26 + Math.abs(gauss(random)) * 5;
      const c = random() > 0.72 ? warm : cool;
      put(
        i,
        positions,
        colours,
        sizes,
        r * Math.sin(b) * Math.cos(a),
        r * Math.sin(b) * Math.sin(a),
        r * Math.cos(b),
        c,
        0.22 + random() * 0.72,
      );
    }
    return makePoints(positions, colours, sizes, { twinkle: 0.22 });
  }, []);

  useFrame((_, delta) => {
    field.material.uniforms.uTime.value += delta;
    field.material.uniforms.uOpacity.value = 0.6;
    const pointer = pointerRef.current;
    const settle = 1 - Math.exp(-2.4 * delta);
    lean.current.x += (pointer.x * pointer.on - lean.current.x) * settle;
    lean.current.y += (pointer.y * pointer.on - lean.current.y) * settle;
    if (group.current) {
      group.current.rotation.y = lean.current.x * 0.05;
      group.current.rotation.x = lean.current.y * 0.04;
    }
  });

  return (
    <group ref={group}>
      <points geometry={field.geometry} material={field.material} />
    </group>
  );
}
