"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { L_LINE, LINE_LENGTH_KM, type Train } from "@/lib/subway-sim";
import { Cadence } from "./Cadence";

/**
 * The line, its stations, and the trains running it, in 3D.
 *
 * Train positions come from the simulation, never from this file: the scene
 * reads a ref every frame and moves what it is told to. That keeps the physics
 * in one place and means the scene can be unmounted without losing the run.
 */
export type SceneHandle = {
  trains: Train[];
  /** Station index the metrics panel is watching, highlighted on the line. */
  focus: number;
  /** Train the prediction table is following, lit differently. */
  watched: string | null;
};

const CARS_PER_TRAIN = 4;
const CAR_LENGTH = 0.42;
const CAR_GAP = 0.06;

/**
 * The route as a gently meandering curve rather than a straight rod — a real
 * line bends, and the bends are what make the train read as articulated.
 */
function useLineCurve() {
  return useMemo(() => {
    const points = L_LINE.map((station, i) => {
      const t = station.km / LINE_LENGTH_KM;
      // A fixed wander, seeded by index, so the shape never changes.
      const wobble = Math.sin(i * 1.27) * 0.9 + Math.sin(i * 0.41) * 0.5;
      return new THREE.Vector3(
        (t - 0.5) * 22,
        Math.sin(i * 0.63) * 0.35,
        wobble,
      );
    });
    return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
  }, []);
}

export default function SubwayScene({
  handleRef,
}: {
  handleRef: React.RefObject<SceneHandle>;
}) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [0, 7.2, 12.5], fov: 42 }}
      frameloop="never"
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} />
      <directionalLight
        position={[-8, 4, -6]}
        intensity={0.45}
        color="#8fb4ff"
      />

      <Line handleRef={handleRef} />
    </Canvas>
  );
}

function Line({ handleRef }: { handleRef: React.RefObject<SceneHandle> }) {
  const curve = useLineCurve();
  const group = useRef<THREE.Group>(null);

  const trackGeometry = useMemo(() => {
    const points = curve.getPoints(600);
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [curve]);

  const stationPositions = useMemo(
    () =>
      L_LINE.map((station) =>
        curve.getPointAt(Math.min(0.9999, station.km / LINE_LENGTH_KM)),
      ),
    [curve],
  );

  useFrame((state, delta) => {
    if (!group.current) return;
    // A slow orbit, so the line is read as an object in space.
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.07) * 0.12;
    void delta;
  });

  return (
    <group ref={group} rotation={[0.12, 0, 0]}>
      <primitive object={new THREE.Line(trackGeometry, TRACK_MATERIAL)} />

      {stationPositions.map((position, i) => (
        <StationMarker
          key={L_LINE[i].id}
          index={i}
          position={position}
          handleRef={handleRef}
        />
      ))}

      <Trains curve={curve} handleRef={handleRef} />
    </group>
  );
}

const TRACK_MATERIAL = new THREE.LineBasicMaterial({
  color: "#2f3438",
  transparent: true,
  opacity: 0.95,
});

function StationMarker({
  index,
  position,
  handleRef,
}: {
  index: number;
  position: THREE.Vector3;
  handleRef: React.RefObject<SceneHandle>;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const focused = handleRef.current?.focus === index;
    const target = focused ? 1.9 : 1;
    for (const node of [ring.current, core.current]) {
      if (!node) continue;
      const current = node.scale.x;
      node.scale.setScalar(
        current + (target - current) * (1 - Math.exp(-8 * delta)),
      );
    }
    if (ring.current && focused) {
      const pulse = 0.35 + 0.25 * Math.sin(state.clock.elapsedTime * 3);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    } else if (ring.current) {
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.18;
    }
  });

  return (
    <group position={position}>
      <mesh ref={core}>
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshBasicMaterial color="#fafaf7" toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.14, 0.2, 32]} />
        <meshBasicMaterial
          color="#fafaf7"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * One instanced group per train slot, reused as trains enter and leave service.
 * Ten slots is more than the line ever holds at these headways.
 */
const SLOTS = 10;

function Trains({
  curve,
  handleRef,
}: {
  curve: THREE.CatmullRomCurve3;
  handleRef: React.RefObject<SceneHandle>;
}) {
  const slots = useRef<(THREE.Group | null)[]>([]);

  useFrame(() => {
    const state = handleRef.current;
    if (!state) return;

    for (let i = 0; i < SLOTS; i += 1) {
      const node = slots.current[i];
      if (!node) continue;
      const train = state.trains[i];

      if (!train) {
        node.visible = false;
        continue;
      }

      node.visible = true;
      const watched = train.id === state.watched;

      // Each car sits a little behind the one in front, so the train bends
      // through the curves instead of sliding as one rigid block.
      node.children.forEach((car, carIndex) => {
        const offsetKm =
          (carIndex * (CAR_LENGTH + CAR_GAP) * LINE_LENGTH_KM) / 22;
        const km = Math.max(0, train.km - offsetKm);
        const t = Math.min(0.9999, Math.max(0, km / LINE_LENGTH_KM));

        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        car.position.copy(point);
        car.position.y += 0.12;
        car.lookAt(point.clone().add(tangent));

        const body = car.children[0] as THREE.Mesh | undefined;
        if (body) {
          const material = body.material as THREE.MeshStandardMaterial;
          material.emissiveIntensity = watched ? 0.85 : 0.18;
        }
      });
    }
  });

  return (
    <>
      {Array.from({ length: SLOTS }, (_, slot) => (
        <group
          key={slot}
          visible={false}
          ref={(node) => {
            slots.current[slot] = node;
          }}
        >
          {Array.from({ length: CARS_PER_TRAIN }, (_, car) => (
            <TrainCar key={car} leading={car === 0} />
          ))}
        </group>
      ))}
    </>
  );
}

/** One car: body, roof band, window strip, and a headlight on the lead car. */
function TrainCar({ leading }: { leading: boolean }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.24, 0.2, CAR_LENGTH]} />
        <meshStandardMaterial
          color="#c9ced2"
          emissive="#ffb46b"
          emissiveIntensity={0.18}
          metalness={0.55}
          roughness={0.38}
        />
      </mesh>

      {/* Window strip down each side, so the car reads as a carriage. */}
      {[-0.126, 0.126].map((x) => (
        <mesh key={x} position={[x, 0.035, 0]}>
          <boxGeometry args={[0.005, 0.07, CAR_LENGTH * 0.82]} />
          <meshBasicMaterial color="#9fd8ff" toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[0, 0.105, 0]}>
        <boxGeometry args={[0.2, 0.012, CAR_LENGTH * 0.9]} />
        <meshStandardMaterial color="#6f767c" metalness={0.7} roughness={0.5} />
      </mesh>

      {leading ? (
        <mesh position={[0, 0.01, CAR_LENGTH / 2 + 0.008]}>
          <boxGeometry args={[0.11, 0.045, 0.01]} />
          <meshBasicMaterial color="#fff3d6" toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}
