"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Project } from "@/content";
import { Cadence } from "./Cadence";
import { ProjectOrbit } from "./ProjectOrbit";
import { Sunlight } from "./Sunlight";
import { useOnScreen } from "./useOnScreen";

/**
 * The hero scene: a star at the centre, the projects orbiting it, a galaxy
 * behind. Drag anywhere to turn the ring like a wheel.
 *
 * There is not a single three.js light in here. Everything that is lit works
 * out for itself how much of the star it can see, from the star's real world
 * position — which is why the terminators, the ring shadows, and the shading
 * on the name above all agree with each other and all move together when the
 * camera leans.
 *
 * Angle lives in a ref, not in state — a drag would otherwise re-render React
 * on every pointer move. React only hears about the project at the front, which
 * changes a handful of times per turn.
 */
const DRAG = {
  /** Radians of rotation per pixel dragged. */
  sensitivity: 0.0062,
  /** Fraction of velocity kept per frame after release. */
  friction: 0.94,
  /** Below this the wheel is treated as stopped. */
  restVelocity: 0.00025,
  /** Idle drift, so the ring is never completely still. */
  idleVelocity: 0.0012,
  /** Pixels of movement before a press counts as a drag, not a click. */
  slop: 4,
};

const ZERO = new THREE.Vector2();

/** How close the camera stops to a planet it has flown in to, in world units. */
const CLOSE_DISTANCE = 1.45;
/** Seconds for the whole fly-in, and for the way back out. */
const FLY_SECONDS = 1.05;

/**
 * How to frame a ring in a window of a given shape.
 *
 * The scene was composed in landscape, where a ring three and a half units
 * across sits comfortably in a 40° lens. Turn the same shot on its side and
 * the ring is twice as wide as the frame — which is the whole reason the hero
 * used to refuse to draw below 900px. It is a framing problem, and framing is
 * something you can solve.
 *
 * Three things move together as the window gets taller than it is wide. The
 * lens opens up, because a longer one would have to stand so far back that a
 * planet is four pixels. The ring draws in, because a smaller circle of the
 * same planets is a system you can still read rather than a wide arc with the
 * ends cut off. And the camera climbs, because the ring is nearly edge-on from
 * down here and a portrait frame has height to spend on seeing into it.
 *
 * The distance is then solved rather than chosen: whatever the lens and the
 * ring end up as, stand back exactly far enough that the ring plus the widest
 * planet on it fills `fill` of the frame. At a laptop's proportions this
 * returns 8.62 units, which is the 8.6 the shot was hand-set to — so nothing
 * about the wide view changes, and everything narrower is the same photograph
 * taken from where it fits.
 */
const WIDE = {
  fov: 40,
  radius: 3.45,
  fill: 0.7,
  eye: 1.0,
  look: 0.35,
  edge: 0.55,
};
/*
 * Portrait.
 *
 * `radius` and `fill` both went up here, and they do different jobs. `fill` is
 * how much of the frame the ring *plus its clearance* is asked to occupy, and
 * at 0.94 it was leaving a twentieth of the width empty on top of the
 * clearance itself. `radius` is what actually decides how big the circle looks:
 * the distance is solved from it, so a wider ring against the same clearance is
 * a larger fraction of the frame — 2.35 against a 0.9 reserve put the orbit
 * path at 68 per cent of the half-width, and everything past that was air.
 *
 * The reserve stays at 0.9 because it is not slack. Planets are the same
 * absolute size whatever the ring does, and a featured one with a ring reaches
 * 2.7 of its own radii, or 0.81 — so 0.9 is that plus a little, and cutting it
 * would clip the ring off a planet every time one came round the side.
 *
 * The camera also climbs further. A portrait frame has height to spend and the
 * ring is nearly edge-on from low down; opening it out uses the vertical space
 * the old shot was leaving empty above and below a thin band.
 */
const TALL = {
  fov: 62,
  radius: 3.05,
  fill: 1.0,
  eye: 4.5,
  look: 0.55,
  edge: 0.9,
};
/** Aspect at which the shot starts turning, and where it has fully turned. */
const FROM = 1.25;
const TO = 0.6;

export type Framing = {
  fov: number;
  radius: number;
  distance: number;
  eye: number;
  /** Height of the point the camera aims at, which is what sits at the centre
   *  of the frame. Dropping it tips the camera down and lifts the ring up the
   *  screen, out from behind the panel a portrait layout puts beneath it. */
  look: number;
};

export function frameRing(aspect: number): Framing {
  const t = Math.min(1, Math.max(0, (FROM - aspect) / (FROM - TO)));
  const mix = (a: number, b: number) => a + (b - a) * t;
  const fov = mix(WIDE.fov, TALL.fov);
  const radius = mix(WIDE.radius, TALL.radius);
  const fill = mix(WIDE.fill, TALL.fill);
  const eye = mix(WIDE.eye, TALL.eye);
  const look = mix(WIDE.look, TALL.look);
  // Clearance past the ring for whatever is sitting on it. A ringed planet
  // reaches 2.7 of its own radii, which is what used to clip off the side.
  const edge = mix(WIDE.edge, TALL.edge);

  // Half the frame, in tangents, at one unit away.
  const halfHeight = Math.tan((fov * Math.PI) / 360);
  const halfWidth = halfHeight * Math.max(aspect, 0.0001);
  const distance = (radius + edge) / halfWidth / fill;

  return { fov, radius, distance, eye, look };
}

/**
 * Cubic in-out: zero velocity at both ends.
 *
 * This is the whole reason the move is driven by elapsed time rather than by
 * an exponential decay. Decay is trivial to write and frame-rate independent,
 * but it is at *maximum* speed on its first frame and then crawls — so it
 * leaves on a jerk and never quite arrives. A tween with a shaped curve starts
 * from rest, accelerates, and settles.
 */
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type HeroSceneProps = {
  projects: Project[];
  /** Index the camera has flown in to, or null for the whole system. */
  focused: number | null;
  onFrontChange: (index: number) => void;
  onSelect: (index: number) => void;
  /** Called when a drag starts, so a focused project lets go of the camera. */
  onDismiss: () => void;
  /** Set by the parent's keyboard controls; consumed and cleared each frame. */
  stepRef: React.RefObject<number>;
};

export default function HeroScene({
  projects,
  focused,
  onFrontChange,
  onSelect,
  onDismiss,
  stepRef,
}: HeroSceneProps) {
  const angleRef = useRef(0);
  // Where the wheel is easing to, if anywhere. Lifted out of the rig so a
  // click can hand it a destination instead of teleporting the ring.
  const targetRef = useRef<number | null>(null);
  // Written by `Sun`, read by every surface the light reaches and by the DOM.
  const sunRef = useRef(new THREE.Vector3(0, 0.55, 0));
  // Written by the orbit: where the planet at the front is, in world space.
  const focusRef = useRef(new THREE.Vector3(0, -0.6, 3.2));
  // Read per frame by the rig; prop changes must not wait on a render.
  const focusedRef = useRef(false);
  focusedRef.current = focused !== null;
  const velocityRef = useRef(0);
  const pointerRef = useRef(new THREE.Vector2(0, 0));
  const draggingRef = useRef(false);
  const [ready, setReady] = useState(false);
  // Recomputed only when the window changes shape, which is a resize or a
  // phone turning over — not something that belongs in the frame loop.
  const [framing, setFraming] = useState<Framing>(() => frameRing(16 / 9));

  const step = (Math.PI * 2) / projects.length;

  // Pointer bookkeeping lives on the wrapper, not the canvas, so a drag that
  // leaves the canvas still turns the wheel.
  const { ref: wrapper, onScreen } = useOnScreen<HTMLDivElement>();

  // Held in a ref so the pointer listeners never need rebinding.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    const node = wrapper.current;
    if (!node) return;

    let pointerId: number | null = null;
    let lastX = 0;
    let travelled = 0;
    let captured = false;

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      lastX = event.clientX;
      travelled = 0;
      captured = false;
      draggingRef.current = true;
      velocityRef.current = 0;
      node.dataset.dragging = "true";
    };

    const move = (event: PointerEvent) => {
      const bounds = node.getBoundingClientRect();
      pointerRef.current.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      );

      if (pointerId !== event.pointerId || !draggingRef.current) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      travelled += Math.abs(dx);

      // Capture only once this is unmistakably a drag. Capturing on pointer
      // down retargets every later event to this wrapper, and the canvas is
      // inside it — so the scene never saw the pointer up and a click on a
      // planet never became a click at all.
      if (travelled > DRAG.slop && !captured) {
        captured = true;
        node.setPointerCapture(event.pointerId);
        // A real drag, not the wobble inside a click: let go of any project
        // the camera has flown in to and give the whole system back.
        dismiss.current();
      }
      angleRef.current += dx * DRAG.sensitivity;
      velocityRef.current = dx * DRAG.sensitivity;
    };

    const up = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      draggingRef.current = false;
      delete node.dataset.dragging;
      if (captured && node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }
      captured = false;
      // A press that barely moved was a click on a planet, not a throw.
      if (travelled < DRAG.slop) velocityRef.current = 0;
    };

    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move, { passive: true });
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);

    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      document.body.style.removeProperty("cursor");
    };
  }, [wrapper]);

  const handleSelect = useCallback(
    (index: number) => {
      // Bring the clicked planet to the front by the shortest route.
      const current = angleRef.current;
      const target = -index * step;
      const turns = Math.round((current - target) / (Math.PI * 2));
      velocityRef.current = 0;
      // Eased, not assigned. Writing the angle directly snapped the whole ring
      // round in a single frame, which is most of what made the fly-in look
      // broken: the camera moved smoothly past a scene that had already jumped.
      targetRef.current = target + turns * Math.PI * 2;
      onSelect(index);
    },
    [onSelect, step],
  );

  return (
    <div
      ref={wrapper}
      /* The fade at the foot of it is in globals.css — see [data-hero-canvas]. */
      data-hero-canvas
      className="absolute inset-0 touch-pan-y select-none data-[dragging]:cursor-grabbing"
      // Decorative: the same projects are listed as real controls beside it.
      aria-hidden
    >
      <Canvas
        // Nothing draws on its own: `Cadence` owns when, and how often.
        frameloop="never"
        dpr={[1, 1.5]}
        gl={{
          // Off. Multisampling costs about a third of the frame here and buys
          // almost nothing: this scene is glows, points, and spheres whose
          // limbs already fade out through their own atmosphere term. The one
          // place it earns its keep is the subway map, which is line art, and
          // that keeps it.
          antialias: false,
          powerPreference: "high-performance",
          alpha: true,
        }}
        camera={{ position: [0, WIDE.eye, 8.6], fov: WIDE.fov }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          setReady(true);
        }}
      >
        <Cadence running={onScreen} />
        <Frame onChange={setFraming} />

        <Rig
          framing={framing}
          focusRef={focusRef}
          focusedRef={focusedRef}
          angleRef={angleRef}
          targetRef={targetRef}
          velocityRef={velocityRef}
          draggingRef={draggingRef}
          pointerRef={pointerRef}
          stepRef={stepRef}
          step={step}
        />

        {/* The sky is behind the whole document now and this canvas draws on
            transparent, so it shows through rather than being drawn twice. */}
        <ProjectOrbit
          projects={projects}
          radius={framing.radius}
          angleRef={angleRef}
          sunRef={sunRef}
          pointerRef={pointerRef}
          focusRef={focusRef}
          onFront={onFrontChange}
          onSelect={handleSelect}
        />

        <Sunlight sunRef={sunRef} />
      </Canvas>

      {!ready ? (
        <div className="absolute inset-0 grid place-items-center">
          <p className="label-mono">Loading the orbit…</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Watches the window's shape and hands the scene a shot that fits it.
 *
 * Inside the canvas because the size it has to answer to is the canvas's, not
 * the window's — the hero is one column of a page that has its own opinions
 * about how wide things are.
 */
function Frame({ onChange }: { onChange: (framing: Framing) => void }) {
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const next = frameRing(size.width / Math.max(1, size.height));
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = next.fov;
      camera.updateProjectionMatrix();
    }
    onChange(next);
  }, [size.width, size.height, camera, onChange]);

  return null;
}

/**
 * Per-frame integration: inertia after a throw, an idle drift when untouched,
 * and any pending keyboard step eased in.
 */
function Rig({
  framing,
  focusRef,
  focusedRef,
  angleRef,
  targetRef,
  velocityRef,
  draggingRef,
  pointerRef,
  stepRef,
  step,
}: {
  framing: Framing;
  focusRef: React.RefObject<THREE.Vector3>;
  focusedRef: React.RefObject<boolean>;
  angleRef: React.RefObject<number>;
  targetRef: React.RefObject<number | null>;
  velocityRef: React.RefObject<number>;
  draggingRef: React.RefObject<boolean>;
  pointerRef: React.RefObject<THREE.Vector2>;
  stepRef: React.RefObject<number>;
  step: number;
}) {
  const { camera } = useThree();
  const aim = useMemo(
    () => ({
      home: new THREE.Vector3(),
      want: new THREE.Vector3(),
      look: new THREE.Vector3(),
      place: new THREE.Vector3(),
    }),
    [],
  );
  const lean = useRef({ x: 0, y: 0 });
  /**
   * How far along the fly-in the shot is, 0 wide and 1 close. Advanced by
   * elapsed time, so the move always takes the same length whatever the frame
   * rate, and reverses cleanly from wherever it had got to.
   */
  const flight = useRef(0);

  useFrame((_, delta) => {
    const frames = Math.min(delta * 60, 3);

    // A keyboard press queues one notch; the wheel eases to it.
    const pending = stepRef.current ?? 0;
    if (pending !== 0) {
      targetRef.current =
        (targetRef.current ?? angleRef.current) - pending * step;
      stepRef.current = 0;
      velocityRef.current = 0;
    }

    if (targetRef.current !== null) {
      const remaining = targetRef.current - angleRef.current;
      if (Math.abs(remaining) < 0.001) {
        angleRef.current = targetRef.current;
        targetRef.current = null;
      } else {
        angleRef.current += remaining * (1 - Math.exp(-4.2 * delta));
      }
    } else if (!draggingRef.current && !focusedRef.current) {
      // Held still while a project is being looked at. The drift would
      // otherwise carry the planet out from under the camera, and eventually
      // hand the front of the ring to its neighbour in the middle of the shot.
      const velocity = velocityRef.current ?? 0;
      if (Math.abs(velocity) > DRAG.restVelocity) {
        angleRef.current += velocity * frames;
        velocityRef.current = velocity * DRAG.friction ** frames;
      } else {
        velocityRef.current = 0;
        // Never fully still: a slow drift keeps the scene alive.
        angleRef.current += DRAG.idleVelocity * frames;
      }
    }

    // One smoother, and only one. The pointer lean eases on its own, the
    // approach eases on its own, and the camera is then placed exactly where
    // those two say it should be. Easing the camera *toward* an already-easing
    // target — which is what this did — stacks two exponentials in series and
    // turns every move into a slow start and a long mushy tail.
    const pointer = pointerRef.current ?? ZERO;
    const settle = 1 - Math.exp(-4.5 * delta);
    lean.current.x += (pointer.x - lean.current.x) * settle;
    lean.current.y += (pointer.y - lean.current.y) * settle;

    const towards = focusedRef.current ? 1 : -1;
    flight.current = Math.min(
      1,
      Math.max(0, flight.current + (towards * delta) / FLY_SECONDS),
    );
    const near = ease(flight.current);

    // The wide shot: the whole system, leaning with the pointer, from
    // wherever the ring actually fits.
    aim.home.set(
      lean.current.x * 0.5,
      framing.eye + lean.current.y * 0.3,
      framing.distance,
    );

    // The close shot: along the line from the wide position to the front of
    // the ring, stopping a fixed distance short of it.
    const focus = focusRef.current;
    aim.want.copy(aim.home).sub(focus);
    const reach = aim.want.length() || 1;
    aim.want.multiplyScalar(CLOSE_DISTANCE / reach).add(focus);
    aim.want.y += 0.34;

    aim.place.lerpVectors(aim.home, aim.want, near);
    aim.look.set(0, framing.look, 0).lerp(focus, near);

    camera.position.copy(aim.place);
    camera.lookAt(aim.look);
  });

  return null;
}
