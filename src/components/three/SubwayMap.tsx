"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Fleet, SubwayMapData } from "@/lib/subway-map";
import { Cadence } from "./Cadence";

/**
 * The network in 3D: real shapes, real stations, real colours.
 *
 * Everything that repeats is instanced. 496 stations and a few hundred trains
 * would be hundreds of draw calls as separate meshes; as two `InstancedMesh`
 * objects they are two, which is what keeps this at frame rate on a laptop.
 *
 * Train positions are read from the fleet on every frame through a ref. React
 * never re-renders while they move; it only hears about a hover or a click.
 */
export type MapSelection =
  { kind: "train"; id: string } | { kind: "station"; index: number } | null;

export type MapHandle = {
  fleet: Fleet | null;
  /** Route ids to draw; empty means all of them. Ids, not short names: the
   *  42 St, Franklin Av, and Rockaway Park shuttles are all signed "S". */
  visible: Set<string>;
  labels: boolean;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export default function SubwayMap({
  data,
  handleRef,
  onSelect,
  onHover,
  selection,
  running,
}: {
  data: SubwayMapData;
  handleRef: React.RefObject<MapHandle>;
  onSelect: (selection: MapSelection) => void;
  onHover: (selection: MapSelection) => void;
  selection: MapSelection;
  /** False once the map has been scrolled past; stops the render loop. */
  running: boolean;
}) {
  const focus = useMemo<[number, number, number]>(() => {
    const xs = data.stations.map((station) => station.x);
    const zs = data.stations.map((station) => station.z);
    return [median(xs), 0, median(zs)];
  }, [data]);

  return (
    <Canvas
      frameloop="never"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [-28, 34, 44], fov: 38, far: 600 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      onPointerMissed={() => onSelect(null)}
    >
      <Cadence running={running} />

      <ambientLight intensity={0.7} />
      <directionalLight position={[40, 80, 30]} intensity={1.15} />
      <directionalLight
        position={[-50, 30, -40]}
        intensity={0.4}
        color="#8fb4ff"
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={18}
        maxDistance={190}
        maxPolarAngle={Math.PI / 2.15}
        target={focus}
        // The wheel belongs to the map while the pointer is over it: the
        // controls call `preventDefault` on it, and the container carries
        // `data-lenis-prevent-wheel` so smooth scroll leaves it alone too.
        zoomSpeed={0.85}
        // Zoom toward whatever is under the cursor, the way a map should.
        zoomToCursor
      />
      <TouchScroll />

      <Ground />
      <Routes data={data} handleRef={handleRef} selection={selection} />
      <Stations
        data={data}
        handleRef={handleRef}
        onSelect={onSelect}
        onHover={onHover}
        selection={selection}
      />
      <Trains
        data={data}
        handleRef={handleRef}
        onSelect={onSelect}
        onHover={onHover}
        selection={selection}
      />
      <StationLabels data={data} handleRef={handleRef} />
      <IntroCamera focus={focus} />
    </Canvas>
  );
}

/**
 * Gives the page its vertical gestures back.
 *
 * `OrbitControls` writes `touch-action: none` straight onto the canvas so that
 * a drag orbits instead of scrolling. On a desktop that is right — the pointer
 * has a wheel and the page has other places to be scrolled from. On a phone it
 * makes a map that fills most of the screen into something you cannot get
 * past: every finger stroke inside it belongs to the camera, and the document
 * beneath it is unreachable.
 *
 * `pan-y` splits the gesture by direction. Up and down is the document's and
 * the browser handles it natively; across is the controls' and orbits the map;
 * two fingers pinch to zoom, because a pinch is not a pan. What is lost is
 * tilting the camera with one finger, which is worth less than being able to
 * read the rest of the page.
 *
 * This has to run after the controls have mounted, hence a component of its
 * own placed after them rather than a class on the wrapper — an inline style
 * beats a stylesheet, and theirs is inline.
 */
function TouchScroll() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) return;
    const canvas = gl.domElement;

    // The canvas is not the only thing that has to allow it. `touch-action` is
    // resolved by walking up from whatever was touched, and any ancestor
    // saying `none` on the way ends the matter — the renderer puts one on its
    // own container. So this clears every `none` between the canvas and the
    // box that already says `pan-y`.
    const chain: HTMLElement[] = [];
    let node: HTMLElement | null = canvas;
    for (let i = 0; node && i < 6; i += 1) {
      if (getComputedStyle(node).touchAction === "pan-y") break;
      chain.push(node);
      node = node.parentElement;
    }

    const apply = () => {
      for (const el of chain) {
        if (el.style.touchAction !== "pan-y") el.style.touchAction = "pan-y";
      }
    };
    apply();

    // The controls re-assert their own value whenever they reconnect, so this
    // watches rather than setting it once and hoping.
    const observer = new MutationObserver(apply);
    for (const el of chain) {
      observer.observe(el, { attributes: true, attributeFilter: ["style"] });
    }
    return () => {
      observer.disconnect();
      for (const el of chain) el.style.touchAction = "";
    };
  }, [gl]);

  return null;
}

/** A dark surface with a faint grid, so the lines have something to sit on. */
function Ground() {
  return (
    <group position={[0, -0.35, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial color="#07090a" roughness={1} metalness={0} />
      </mesh>
      <gridHelper
        args={[260, 52, "#161a1d", "#101315"]}
        position={[0, 0.01, 0]}
      />
    </group>
  );
}

/** One tube per route shape, following the agency's own geometry. */
function Routes({
  data,
  handleRef,
  selection,
}: {
  data: SubwayMapData;
  handleRef: React.RefObject<MapHandle>;
  selection: MapSelection;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  const tubes = useMemo(
    () =>
      data.lines.map((line) => {
        const count = line.points.length / 2;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < count; i += 1) {
          points.push(
            new THREE.Vector3(line.points[i * 2], 0, line.points[i * 2 + 1]),
          );
        }
        const curve = new THREE.CatmullRomCurve3(
          points,
          false,
          "catmullrom",
          0.3,
        );
        const segments = Math.min(900, Math.max(64, count * 4));
        return new THREE.TubeGeometry(curve, segments, 0.16, 6, false);
      }),
    [data],
  );

  useEffect(() => () => tubes.forEach((tube) => tube.dispose()), [tubes]);

  useFrame((_, delta) => {
    const state = handleRef.current;
    if (!state) return;

    const selectedLine =
      selection?.kind === "train"
        ? data.lines.findIndex((line) =>
            state.fleet?.vehicles.some(
              (v) => v.id === selection.id && data.lines[v.line] === line,
            ),
          )
        : -1;

    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const line = data.lines[i];
      const shown = state.visible.size === 0 || state.visible.has(line.routeId);
      const dimmed = selectedLine >= 0 && selectedLine !== i;

      mesh.visible = shown;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const target = dimmed ? 0.18 : 1;
      material.opacity +=
        (target - material.opacity) * (1 - Math.exp(-6 * delta));
      material.emissiveIntensity = dimmed ? 0.05 : 0.35;
    });
  });

  return (
    <>
      {data.lines.map((line, i) => (
        <mesh
          key={line.shapeId}
          geometry={tubes[i]}
          ref={(node) => {
            meshes.current[i] = node;
          }}
        >
          <meshStandardMaterial
            color={line.color}
            emissive={line.color}
            emissiveIntensity={0.35}
            transparent
            opacity={1}
            roughness={0.45}
            metalness={0.1}
          />
        </mesh>
      ))}
    </>
  );
}

const STATION_COLOR = new THREE.Color("#fafaf7");
const STATION_HOVER = new THREE.Color("#ffd9a8");

function Stations({
  data,
  handleRef,
  onSelect,
  onHover,
  selection,
}: {
  data: SubwayMapData;
  handleRef: React.RefObject<MapHandle>;
  onSelect: (selection: MapSelection) => void;
  onHover: (selection: MapSelection) => void;
  selection: MapSelection;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef(-1);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const node = mesh.current;
    if (!node) return;
    data.stations.forEach((station, i) => {
      dummy.position.set(station.x, 0, station.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      node.setColorAt(i, STATION_COLOR);
    });
    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  }, [data, dummy]);

  useFrame(() => {
    const node = mesh.current;
    if (!node) return;
    const selected = selection?.kind === "station" ? selection.index : -1;
    const visible = handleRef.current?.visible;

    data.stations.forEach((station, i) => {
      // Filtering to a few lines should leave their stations, not all 496.
      const shown =
        !visible ||
        visible.size === 0 ||
        station.routes.some((id) => visible.has(id));
      const lit = shown && (i === hovered.current || i === selected);

      dummy.position.set(station.x, lit ? 0.22 : 0, station.z);
      dummy.scale.setScalar(shown ? (lit ? 2.4 : 1) : 0);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      node.setColorAt(i, lit ? STATION_HOVER : STATION_COLOR);
    });
    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, data.stations.length]}
      onPointerMove={(event) => {
        event.stopPropagation();
        const id = event.instanceId ?? -1;
        if (id !== hovered.current) {
          hovered.current = id;
          onHover(id >= 0 ? { kind: "station", index: id } : null);
        }
      }}
      onPointerOut={() => {
        hovered.current = -1;
        onHover(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.instanceId !== undefined) {
          onSelect({ kind: "station", index: event.instanceId });
        }
      }}
    >
      <cylinderGeometry args={[0.16, 0.16, 0.16, 10]} />
      <meshStandardMaterial
        emissive="#fafaf7"
        emissiveIntensity={0.55}
        roughness={0.4}
      />
    </instancedMesh>
  );
}

function Trains({
  data,
  handleRef,
  onSelect,
  onHover,
  selection,
}: {
  data: SubwayMapData;
  handleRef: React.RefObject<MapHandle>;
  onSelect: (selection: MapSelection) => void;
  onHover: (selection: MapSelection) => void;
  selection: MapSelection;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colour = useMemo(() => new THREE.Color(), []);
  const hovered = useRef(-1);
  const CAPACITY = 420;

  // One curve per line, sampled to place a train and point it the right way.
  const curves = useMemo(
    () =>
      data.lines.map((line) => {
        const count = line.points.length / 2;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < count; i += 1) {
          points.push(
            new THREE.Vector3(line.points[i * 2], 0, line.points[i * 2 + 1]),
          );
        }
        return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.3);
      }),
    [data],
  );

  useFrame(() => {
    const node = mesh.current;
    const state = handleRef.current;
    if (!node || !state?.fleet) return;

    const vehicles = state.fleet.vehicles;
    let drawn = 0;

    for (let i = 0; i < vehicles.length && drawn < CAPACITY; i += 1) {
      const vehicle = vehicles[i];
      const line = data.lines[vehicle.line];
      if (state.visible.size > 0 && !state.visible.has(line.routeId)) continue;

      const curve = curves[vehicle.line];
      const t = Math.min(0.9999, Math.max(0.0001, vehicle.t));
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);

      dummy.position.set(point.x, 0.28, point.z);
      dummy.lookAt(point.x + tangent.x, 0.28, point.z + tangent.z);
      const lit =
        drawn === hovered.current ||
        (selection?.kind === "train" && selection.id === vehicle.id);
      dummy.scale.setScalar(lit ? 1.6 : 1);
      dummy.updateMatrix();

      node.setMatrixAt(drawn, dummy.matrix);
      colour.set(line.color);
      if (lit) colour.lerp(new THREE.Color("#ffffff"), 0.55);
      node.setColorAt(drawn, colour);
      // Map the drawn slot back to the vehicle for raycasting.
      slotToVehicle[drawn] = vehicle.id;
      drawn += 1;
    }

    node.count = drawn;
    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  });

  const slotToVehicle = useMemo<string[]>(() => [], []);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, CAPACITY]}
      frustumCulled={false}
      onPointerMove={(event) => {
        event.stopPropagation();
        const id = event.instanceId ?? -1;
        if (id !== hovered.current) {
          hovered.current = id;
          const vehicleId = slotToVehicle[id];
          onHover(vehicleId ? { kind: "train", id: vehicleId } : null);
        }
      }}
      onPointerOut={() => {
        hovered.current = -1;
        onHover(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        const vehicleId = slotToVehicle[event.instanceId ?? -1];
        if (vehicleId) onSelect({ kind: "train", id: vehicleId });
      }}
    >
      <boxGeometry args={[0.34, 0.22, 0.95]} />
      <meshStandardMaterial
        roughness={0.35}
        metalness={0.35}
        emissiveIntensity={0.4}
      />
    </instancedMesh>
  );
}

/**
 * Station names, but only close in and only for what is on screen — 496 labels
 * at once is unreadable and costs more than the rest of the scene together.
 */
function StationLabels({
  data,
  handleRef,
}: {
  data: SubwayMapData;
  handleRef: React.RefObject<MapHandle>;
}) {
  const { camera, size } = useThree();
  const [shown, setShown] = useState<number[]>([]);
  const since = useRef(0);

  useFrame((_, delta) => {
    since.current += delta;
    if (since.current < 0.4) return;
    since.current = 0;

    if (!handleRef.current?.labels || camera.position.length() > 62) {
      if (shown.length) setShown([]);
      return;
    }

    const near: { index: number; d: number }[] = [];
    for (let i = 0; i < data.stations.length; i += 1) {
      const station = data.stations[i];
      const dx = station.x - camera.position.x;
      const dz = station.z - camera.position.z;
      const d = dx * dx + dz * dz;
      if (d < 1500) near.push({ index: i, d });
    }
    near.sort((a, b) => a.d - b.d);
    // Twenty-two labels is a readable scatter on a laptop and a solid sheet of
    // type on a phone, so the cap follows the canvas.
    const cap = size.width < 480 ? 8 : 22;
    const next = near.slice(0, cap).map((entry) => entry.index);

    if (next.join() !== shown.join()) setShown(next);
  });

  return (
    <>
      {shown.map((index) => {
        const station = data.stations[index];
        return (
          <Html
            key={station.id}
            position={[station.x, 0.6, station.z]}
            center
            distanceFactor={26}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span className="label-mono text-signal bg-void/80 px-1.5 py-0.5 whitespace-nowrap">
              {station.name}
            </span>
          </Html>
        );
      })}
    </>
  );
}

/**
 * The aspect the resting view was framed against.
 *
 * A camera's field of view is vertical, so a box that is narrower than the one
 * a shot was composed for shows less of the width — and this network is wider
 * than it is deep, so a phone's portrait box cuts Queens off the side. Pulling
 * back by the ratio of the two aspects puts the same width back in frame.
 */
const FRAMED_AT = 1.6;
const PULLBACK = 1.7;

/**
 * Height is pulled back more gently than distance, on its square root. Scaling
 * all three axes together does not just move the camera away, it lifts it —
 * and the view tips towards a plan, which puts empty ground at the top of the
 * frame instead of network.
 */
const lift = (fit: number) => Math.sqrt(fit);

/** Drops from a high angle into the default view on first load. */
function IntroCamera({ focus }: { focus: [number, number, number] }) {
  const { camera, controls, size } = useThree();
  const elapsed = useRef(0);
  const done = useRef(false);

  const fit = Math.min(
    PULLBACK,
    Math.max(1, FRAMED_AT / Math.max(size.width / size.height, 0.0001)),
  );

  const from = useMemo(
    () =>
      new THREE.Vector3(
        focus[0] - 12 * fit,
        130 * lift(fit),
        focus[2] + 30 * fit,
      ),
    [focus, fit],
  );
  const to = useMemo(
    () =>
      new THREE.Vector3(
        focus[0] - 28 * fit,
        34 * lift(fit),
        focus[2] + 44 * fit,
      ),
    [focus, fit],
  );

  useEffect(() => {
    camera.position.copy(from);
  }, [camera, from]);

  useFrame((_, delta) => {
    if (done.current) return;
    elapsed.current += delta;
    const t = Math.min(1, elapsed.current / 2.4);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(from, to, eased);
    camera.lookAt(focus[0], 0, focus[2]);

    if (t >= 1) {
      done.current = true;
      // Hand control back once the move finishes.
      (controls as unknown as { update?: () => void })?.update?.();
    }
  });

  return null;
}
