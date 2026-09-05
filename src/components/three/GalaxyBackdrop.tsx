"use client";

import { Canvas } from "@react-three/fiber";
import { Cadence } from "./Cadence";
import { Nebula, Starfield } from "./Galaxy";
import { ShootingStars } from "./ShootingStars";

/**
 * The sky, behind everything.
 *
 * It used to belong to the two scenes that wanted it — the orbit and the
 * scroll trail — which meant the rest of the site sat on flat black and the
 * galaxy stopped at a section boundary. One fixed canvas behind the whole
 * document instead, and the scenes above it draw on transparent, so the sky
 * is continuous from the hero to the footer and is drawn once rather than
 * twice.
 *
 * Fixed rather than scrolling on purpose. Stars a page away are not going to
 * pass the window at the rate the type does, and parallaxing them would be a
 * hundred metres of movement to say the same thing.
 *
 * It costs one nebula sample, one point cloud and seven quads a frame, capped at 60 and
 * stopped when the tab is hidden. The nebula is a cube map baked once at
 * mount, so the expensive part happens once — see `Galaxy.tsx`.
 */
export default function GalaxyBackdrop() {
  return (
    <div
      aria-hidden
      /* Negative z so it sits under everything in the document but above the
         page background, which the body propagates to the canvas underneath.
         `pointer-events` off because it is scenery: every drag, scroll and tap
         belongs to whatever is on top of it. */
      className="pointer-events-none fixed inset-0 -z-10"
    >
      <Canvas
        frameloop="never"
        dpr={[1, 1.5]}
        gl={{
          // Points and a texture lookup. Nothing here has an edge to sample.
          antialias: false,
          powerPreference: "high-performance",
          alpha: true,
        }}
        camera={{ position: [0, 0, 0.1], fov: 55 }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Cadence />
        <Nebula intensity={1.15} />
        <Starfield count={3000} radius={40} seed={20260903} />
        <ShootingStars />
      </Canvas>
    </div>
  );
}
