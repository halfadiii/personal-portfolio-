"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";
import { Helix, Network } from "./TrailVisuals";

/**
 * The canvas behind the scroll trail.
 *
 * Scroll position arrives as a ref, never as state: a scroll handler that set
 * React state would re-render the tree on every wheel tick. The ref is read
 * once per frame inside `useFrame`, which is the only place it is needed.
 *
 * The two visuals cross over in the middle of the trail rather than switching:
 * for a stretch of the scroll both are on screen, the strand dissolving as the
 * graph resolves, which is the handover the copy is describing.
 */
export type TrailPointer = { x: number; y: number; on: number };

export type TrailSceneProps = {
  /** 0..1 across the whole pinned section. */
  progressRef: React.RefObject<number>;
  /** Cursor over the section in -1..1, and whether there is one. */
  pointerRef: React.RefObject<TrailPointer>;
  /** False once the section has been scrolled past; stops the render loop. */
  running: boolean;
};

/**
 * How wide the frame is, in world units, where the visuals sit.
 *
 * The camera is a 46° lens 7.4 units back and both visuals straddle the
 * origin, so this is just the frustum's width at that depth.
 */
const LENS = 2 * 7.4 * Math.tan((46 * Math.PI) / 360);
/** How far the graph reaches across. */
const NETWORK_SPAN = 6.6;
/**
 * Below this the graph is not drawn at all and the strand holds the whole
 * trail.
 *
 * A phone can frame the strand — it is a portrait shape — but the graph is a
 * wide one, and shrinking it to fit turns a legible constellation into a knot
 * in the middle of the screen. Rather than show a worse version of the second
 * visual, the section shows more of the first: the strand stays formed and the
 * camera keeps travelling down it while the copy moves on. `sm`, so this is
 * the same line every other phone-or-not decision on the site is made on.
 */
const NETWORK_MIN_WIDTH = 640;

type Fitted = { graph: number; network: boolean };

export default function TrailScene({
  progressRef,
  pointerRef,
  running,
}: TrailSceneProps) {
  const helixOpacity = useRef(1);
  const networkOpacity = useRef(0);
  const [fit, setFit] = useState<Fitted>({ graph: 1, network: true });

  return (
    <Canvas
      frameloop="never"
      dpr={[1, 1.5]}
      // Every mark in here is a point sprite, and multisampling does
      // nothing at all for those.
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        alpha: true,
      }}
      camera={{ position: [0, 0, 7.4], fov: 46 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence running={running} />
      <Fit onChange={setFit} />

      <Mix
        progressRef={progressRef}
        pointerRef={pointerRef}
        helixOpacity={helixOpacity}
        networkOpacity={networkOpacity}
        crossfade={fit.network}
      />

      <Helix
        progressRef={progressRef}
        opacityRef={helixOpacity}
        pointerRef={pointerRef}
      />
      {/* The strand is 1.6 units across and fits any frame that can hold its
          height. The graph is 6.6 and does not: in portrait it is nearly twice
          the width of the shot, and a network with its edges cut off reads as
          a mistake rather than as a crop. Where there is room for it at all it
          is drawn smaller — and because a node's size on screen comes from its
          distance rather than from this scale, the dots stay exactly as big as
          they were. Where there is not, it is not drawn. */}
      {fit.network ? (
        <group scale={fit.graph}>
          <Network opacityRef={networkOpacity} />
        </group>
      ) : null}
    </Canvas>
  );
}

/** Decides whether the graph is drawn, and how big, for this shape of window. */
function Fit({ onChange }: { onChange: (fitted: Fitted) => void }) {
  const size = useThree((state) => state.size);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    onChange({
      graph: Math.min(1, (LENS * aspect * 0.92) / NETWORK_SPAN),
      network: size.width >= NETWORK_MIN_WIDTH,
    });
  }, [size.width, size.height, onChange]);

  return null;
}

/** Derives each visual's opacity and moves the camera along the trail. */
function Mix({
  progressRef,
  pointerRef,
  helixOpacity,
  networkOpacity,
  crossfade,
}: {
  progressRef: React.RefObject<number>;
  pointerRef: React.RefObject<TrailPointer>;
  helixOpacity: React.RefObject<number>;
  networkOpacity: React.RefObject<number>;
  /** False where the graph is not drawn, so the strand never hands over. */
  crossfade: boolean;
}) {
  const { camera } = useThree();
  const eased = useRef(0);
  const look = useRef({ x: 0, y: 0 });
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const raw = progressRef.current ?? 0;
    // Scroll is jumpy on a trackpad; easing toward it keeps the motion smooth
    // without adding lag anyone notices.
    eased.current += (raw - eased.current) * (1 - Math.exp(-6 * delta));
    const p = eased.current;

    // Helix owns the first half, the network the second, overlapping across
    // the middle third so neither ever pops in — unless there is no network,
    // in which case the strand holds all six chapters and fades for nothing.
    helixOpacity.current = crossfade ? 1 - smoothstep(0.3, 0.62, p) : 1;
    networkOpacity.current = crossfade ? smoothstep(0.34, 0.68, p) : 0;

    // Pull back and drift as the trail advances, with a little parallax on
    // the cursor so the scene has depth to move around in.
    const pointer = pointerRef.current;
    const settle = 1 - Math.exp(-4 * delta);
    look.current.x += (pointer.x * pointer.on - look.current.x) * settle;
    look.current.y += (pointer.y * pointer.on - look.current.y) * settle;

    target.set(
      Math.sin(p * Math.PI) * 0.9 + look.current.x * 0.55,
      (0.5 - p) * 1.4 + look.current.y * 0.35,
      7.4 - Math.sin(p * Math.PI) * 1.4,
    );
    camera.position.lerp(target, 1 - Math.exp(-3 * delta));
    camera.lookAt(0, (0.5 - p) * 0.9, 0);
  });

  return null;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
