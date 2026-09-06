"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Project } from "@/content";
import { ROUTE_STROKE } from "@/lib/snapshot";
import { Rocket } from "./Rocket";
import { Sun } from "./Sun";

/**
 * The projects, on a ring around the star.
 *
 * The ring's angle is owned by the parent (`angleRef`) so the drag handler, the
 * keyboard controls, and the HTML panel all read the same number. This
 * component only draws — it never decides where the wheel is pointing.
 *
 * Everything here is lit from one place: the star's actual world position,
 * written into `sunRef` by `Sun` every frame. There are no three.js lights in
 * this scene at all. Each surface works out for itself how much of that star it
 * can see, which is why the terminator sits where it does, why a ring casts a
 * banded shadow across the planet it belongs to, and why the planet cuts a bite
 * out of its own ring on the far side.
 *
 * Two planets on a common circle around a star cannot shadow each other — no
 * two of them are ever on the same side of it at once — so no such shadow is
 * drawn. That is the physics, not an omission.
 */
/** The ring's radius on a landscape screen. Portrait tightens it — see
 *  `HeroScene`, which works out what will actually frame. */
export const RADIUS = 3.45;
const TILT = 0.34;

/** Line colours reused as orbit identity; each planet keeps its own hue. */
const HUES = [
  "red",
  "orange",
  "green",
  "blue",
  "neutral",
  "orange",
  "red",
] as const;

export type OrbitProps = {
  projects: Project[];
  angleRef: React.RefObject<number>;
  /** The star's world position, shared with everything it lights. */
  sunRef: React.RefObject<THREE.Vector3>;
  /** Pointer in -1..1; the star leans with it and every shadow follows. */
  pointerRef: React.RefObject<THREE.Vector2>;
  /** World position of the planet at the front, for the camera to fly to. */
  focusRef: React.RefObject<THREE.Vector3>;
  /** Index currently at the front of the ring, written each frame. */
  onFront: (index: number) => void;
  onSelect: (index: number) => void;
  /** How wide the ring is, in world units. Set by whatever can frame it. */
  radius?: number;
};

export function ProjectOrbit({
  projects,
  angleRef,
  sunRef,
  pointerRef,
  focusRef,
  onFront,
  onSelect,
  radius = RADIUS,
}: OrbitProps) {
  const ring = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Group>(null);
  const spot = useMemo(() => new THREE.Vector3(), []);
  const lastFront = useRef(-1);
  // The same number `onFront` reports, but readable per frame: the craft has
  // to know where to fly without waiting on a React render.
  const frontRef = useRef(0);
  const step = (Math.PI * 2) / projects.length;

  useFrame(() => {
    const node = ring.current;
    if (!node) return;
    const angle = angleRef.current ?? 0;
    node.rotation.y = angle;

    // Whichever planet is nearest the camera is the one being looked at.
    const front = Math.round(-angle / step);
    const normalised =
      ((front % projects.length) + projects.length) % projects.length;
    frontRef.current = normalised;
    if (normalised !== lastFront.current) {
      lastFront.current = normalised;
      onFront(normalised);
    }

    // Where the camera flies to: the front of the ring, which is a fixed point
    // in the orbit plane rather than a planet's live position. Whichever
    // planet was clicked ends up here, so the camera has something that never
    // moves to aim at. Chasing the planet instead meant chasing a target that
    // jumped a whole planet's spacing every time the front index changed.
    const orbit = plane.current;
    if (orbit) {
      orbit.updateWorldMatrix(true, false);
      focusRef.current.copy(orbit.localToWorld(spot.set(0, 0, radius)));
    }
  });

  return (
    // Lifted so the near edge of the ring clears the caption beneath it.
    <group ref={plane} rotation={[TILT, 0, 0]} position={[0, 0.55, 0]}>
      <Sun positionRef={sunRef} pointerRef={pointerRef} />
      <OrbitPath radius={radius} />
      <group ref={ring}>
        {projects.map((project, i) => (
          <Planet
            key={project.slug}
            index={i}
            angle={i * step}
            radius={radius}
            colour={ROUTE_STROKE[HUES[i % HUES.length]]}
            featured={Boolean(project.featured)}
            sunRef={sunRef}
            onSelect={onSelect}
          />
        ))}

        {/* Inside the ring, so it turns with the system and the trail it
            leaves stays on the arc it actually flew. */}
        <Rocket
          count={projects.length}
          radius={radius}
          sizes={projects.map((project) => planetSize(Boolean(project.featured)))}
          frontRef={frontRef}
          sunRef={sunRef}
        />
      </group>
    </group>
  );
}

/**
 * How big a planet is drawn, in world units of radius.
 *
 * Exported because the rocket has to stand on these. It used to park at a
 * single height chosen to clear the largest of them, which meant it hovered a
 * quarter of a unit over every other one: sixty per cent of a small planet's
 * own diameter, hanging in space above the surface it had just landed on.
 */
export function planetSize(featured: boolean) {
  return featured ? 0.3 : 0.2;
}

/** The ring itself: a thin circle, so the path is legible when nothing moves. */
function OrbitPath({ radius }: { radius: number }) {
  const geometry = useMemo(() => {
    const segments = 180;
    const points = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points[i * 3] = Math.sin(a) * radius;
      points[i * 3 + 1] = 0;
      points[i * 3 + 2] = Math.cos(a) * radius;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return buffer;
  }, [radius]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial
        color="#2a2f34"
        transparent
        opacity={0.9}
        toneMapped={false}
      />
    </lineLoop>
  );
}

/**
 * Per-planet character, fixed by index so every visitor sees the same system.
 *
 * `banded` is the difference between a gas giant and a rocky world: the same
 * noise, stretched along latitude, reads as belts and zones rather than
 * continents. `ring` is expensive enough in attention that only two get one.
 */
const BODIES = [
  { banded: 0, ring: false, tilt: 0.22, spin: 0.34, relief: 1.0 },
  { banded: 1, ring: true, tilt: 0.46, spin: 0.19, relief: 0.55 },
  { banded: 0, ring: false, tilt: -0.3, spin: 0.42, relief: 1.15 },
  { banded: 1, ring: false, tilt: 0.12, spin: 0.24, relief: 0.6 },
  { banded: 0, ring: false, tilt: 0.55, spin: 0.3, relief: 0.9 },
  { banded: 0, ring: true, tilt: -0.42, spin: 0.27, relief: 1.05 },
  // Only five line colours exist, so two hues repeat across seven projects.
  // These are built to look nothing like the first planet of their colour.
  { banded: 1, ring: false, tilt: -0.16, spin: 0.15, relief: 0.7 },
] as const;

/** Inner and outer edge of a ring, as multiples of its planet's radius. */
const RING_INNER = 1.5;
const RING_OUTER = 2.7;

function Planet({
  index,
  angle,
  radius,
  colour,
  featured,
  sunRef,
  onSelect,
}: {
  index: number;
  angle: number;
  radius: number;
  colour: string;
  featured: boolean;
  sunRef: React.RefObject<THREE.Vector3>;
  onSelect: (index: number) => void;
}) {
  const billboard = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Mesh>(null);
  const planetMaterial = useRef<THREE.ShaderMaterial>(null);
  const ringMaterial = useRef<THREE.ShaderMaterial>(null);
  const hovered = useRef(false);

  const scratch = useMemo(
    () => ({
      centre: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
    }),
    [],
  );

  const position = useMemo<[number, number, number]>(
    () => [Math.sin(angle) * radius, 0, Math.cos(angle) * radius],
    [angle, radius],
  );

  const size = planetSize(featured);
  const shape = BODIES[index % BODIES.length];

  // CSS variables do not reach WebGL, so the token value is resolved once.
  const resolved = useMemo(() => resolveColour(colour), [colour]);

  const planetUniforms = useMemo(() => {
    const base = new THREE.Color(resolved);
    // Two ends of a ramp built from the identity hue: a darker, desaturated
    // low ground and a brighter high ground, which is what makes terrain out
    // of a single colour without inventing a second one.
    const low = base.clone().multiplyScalar(0.34).offsetHSL(0.02, -0.18, 0);
    const high = base.clone().offsetHSL(-0.02, -0.06, 0.24);
    return {
      uTime: { value: 0 },
      uStar: { value: new THREE.Vector3() },
      uLow: { value: low },
      uHigh: { value: high },
      uAtmos: { value: base.clone().offsetHSL(0, 0, 0.1) },
      uSeed: { value: index * 17.13 },
      uBanded: { value: shape.banded },
      uRelief: { value: shape.relief },
      uHasRing: { value: shape.ring ? 1 : 0 },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uCentre: { value: new THREE.Vector3() },
      uInner: { value: size * RING_INNER },
      uOuter: { value: size * RING_OUTER },
    };
  }, [resolved, index, shape, size]);

  // Memoised for the same reason as the others: `front` changing re-renders
  // every planet, and a fresh uniforms object each time hands the renderer a
  // new binding to walk for a colour that has not moved since mount.
  const halo = useMemo(
    () => ({ uColour: { value: new THREE.Color(resolved) } }),
    [resolved],
  );

  const ringUniforms = useMemo(
    () => ({
      uStar: { value: new THREE.Vector3() },
      uColour: { value: new THREE.Color(resolved).offsetHSL(0, -0.25, 0.2) },
      uCentre: { value: new THREE.Vector3() },
      uRadius: { value: size },
    }),
    [resolved, size],
  );

  useFrame((state, delta) => {
    const sun = sunRef.current;
    const globeNode = globe.current;
    const bodyNode = body.current;

    if (globeNode && bodyNode) {
      globeNode.rotation.y += delta * shape.spin;
      globeNode.getWorldPosition(scratch.centre);
      // Hover scales the group, so the sphere the shadow maths uses is not
      // the one it was built at.
      const grown = size * bodyNode.scale.x;

      if (planetMaterial.current) {
        const u = planetMaterial.current.uniforms;
        u.uTime.value += delta;
        u.uStar.value.copy(sun);
        u.uCentre.value.copy(scratch.centre);
        u.uInner.value = grown * RING_INNER;
        u.uOuter.value = grown * RING_OUTER;
        if (shape.ring) {
          // The ring lies in the body group's XZ plane, so its normal is that
          // group's own up vector taken into world space.
          bodyNode.getWorldQuaternion(scratch.rotation);
          u.uRingNormal.value.set(0, 1, 0).applyQuaternion(scratch.rotation);
        }
      }

      if (ringMaterial.current) {
        const u = ringMaterial.current.uniforms;
        u.uStar.value.copy(sun);
        u.uCentre.value.copy(scratch.centre);
        u.uRadius.value = grown;
      }
    }

    if (bodyNode) {
      const target = hovered.current ? 1.35 : 1;
      const current = bodyNode.scale.x;
      bodyNode.scale.setScalar(
        current + (target - current) * (1 - Math.exp(-8 * delta)),
      );
    }

    // Counter-rotate the halo so it always faces the camera.
    if (billboard.current) {
      billboard.current.quaternion.copy(state.camera.quaternion);
    }
  });

  return (
    // The handlers are on the whole body rather than on the sphere, so the
    // halo counts as part of the target. It is two and a half radii across
    // against the planet's one, which on a phone is the difference between a
    // 30px thing to hit and a 75px one — and the planets are never closer
    // together than one halo, so there is nothing for it to steal.
    <group
      position={position}
      onPointerOver={(event) => {
        event.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.removeProperty("cursor");
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(index);
      }}
    >
      <group ref={body} rotation={[0, 0, shape.tilt]}>
        <mesh ref={globe}>
          <sphereGeometry args={[size, 48, 32]} />
          <shaderMaterial
            ref={planetMaterial}
            uniforms={planetUniforms}
            vertexShader={PLANET_VERT}
            fragmentShader={PLANET_FRAG}
            toneMapped={false}
          />
        </mesh>

        {shape.ring ? (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[size * RING_INNER, size * RING_OUTER, 72]} />
            <shaderMaterial
              ref={ringMaterial}
              uniforms={ringUniforms}
              vertexShader={RING_VERT}
              fragmentShader={RING_FRAG}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ) : null}
      </group>

      {/* The atmosphere on the limb, billboarded so it reads at every angle.
          A flat disc with uniform opacity looks like a sticker, so the falloff
          is in a shader. It is also most of the hit target — see above. */}
      <group ref={billboard}>
        <mesh>
          <circleGeometry args={[size * 2.5, 32]} />
          <shaderMaterial
            uniforms={halo}
            vertexShader={HALO_VERT}
            fragmentShader={HALO_FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Gradient noise and fbm.
 *
 * The hash is sine-free on purpose. The usual `fract(sin(p) * 43758)` costs
 * three transcendentals per corner, and this is evaluated eight times per
 * octave — which put a few hundred sines behind every pixel of every planet
 * and made the hero fill-bound on its own.
 */
const NOISE = /* glsl */ `
  vec3 hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n = 0.0;
    for (int dx = 0; dx <= 1; dx++) {
      for (int dy = 0; dy <= 1; dy++) {
        for (int dz = 0; dz <= 1; dz++) {
          vec3 o = vec3(float(dx), float(dy), float(dz));
          float g = dot(hash3(i + o), f - o);
          float w =
            mix(1.0 - u.x, u.x, o.x) *
            mix(1.0 - u.y, u.y, o.y) *
            mix(1.0 - u.z, u.z, o.z);
          n += g * w;
        }
      }
    }
    return n;
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    // Three octaves. A planet is forty pixels across; the fourth and fifth
    // were detail no screen was ever going to resolve.
    for (int i = 0; i < 3; i++) {
      sum += noise(p) * amp;
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }
`;

/**
 * How much of a ring is actually there at a given radius. Shared by the ring
 * and by the shadow it throws, so the divisions show up in both.
 */
const RING_DENSITY = /* glsl */ `
  float ringDensity(float r) {
    float gaps =
      smoothstep(0.02, 0.07, abs(r - 0.34)) *
      smoothstep(0.01, 0.05, abs(r - 0.66));
    return gaps *
      (0.35 + 0.65 * smoothstep(0.0, 0.25, r)) *
      (1.0 - smoothstep(0.82, 1.0, r));
  }
`;

const PLANET_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLANET_FRAG = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  uniform float uTime;
  uniform vec3  uStar;
  uniform vec3  uLow;
  uniform vec3  uHigh;
  uniform vec3  uAtmos;
  uniform float uSeed;
  uniform float uBanded;
  uniform float uRelief;
  uniform float uHasRing;
  uniform vec3  uRingNormal;
  uniform vec3  uCentre;
  uniform float uInner;
  uniform float uOuter;

  ${NOISE}
  ${RING_DENSITY}

  void main() {
    // Sample in the planet's own space so the terrain turns with the body
    // rather than sliding across a fixed pattern.
    vec3 p = normalize(vLocal) * 2.6 + uSeed;
    // Stretching along latitude turns the same noise into belts and zones.
    p.y *= mix(1.0, 5.5, uBanded);

    float terrain = fbm(p) * uRelief;
    // Cloud bands drift slowly across a gas giant; rock does not, so rock does
    // not pay for a second fbm it would not use.
    if (uBanded > 0.5) {
      terrain += fbm(p * 2.1 + vec3(uTime * 0.02, 0.0, 0.0)) * 0.25;
    }
    float h = smoothstep(-0.25, 0.35, terrain);

    vec3 albedo = mix(uLow, uHigh, h);
    // A little polar lightening: ice, or just thinner atmosphere.
    float pole = smoothstep(0.72, 1.0, abs(normalize(vLocal).y));
    albedo = mix(albedo, albedo + vec3(0.22), pole * 0.55);

    vec3 toStar = uStar - vWorld;
    float reach = length(toStar);
    vec3 L = toStar / reach;
    float lambert = dot(normalize(vNormalW), L);
    // A soft terminator: a hard one looks like a cut, and at this size the
    // planet is only a few dozen pixels across.
    float day = smoothstep(-0.18, 0.32, lambert);

    // Does the ring stand between this patch of ground and the star? Walk the
    // ray to the star, find where it crosses the ring's plane, and ask how
    // much ring is at that radius. The divisions come through as bright lanes,
    // because the shadow is the ring's own density function.
    if (uHasRing > 0.5 && day > 0.0) {
      float denom = dot(uRingNormal, L);
      if (abs(denom) > 0.0001) {
        float t = dot(uRingNormal, uCentre - vWorld) / denom;
        if (t > 0.0 && t < reach) {
          float r = length((vWorld + L * t) - uCentre);
          if (r > uInner && r < uOuter) {
            float across = (r - uInner) / (uOuter - uInner);
            day *= 1.0 - ringDensity(across) * 0.62;
          }
        }
      }
    }

    // Night side is not black — it is lit by the rest of the system.
    vec3 colour = albedo * (0.055 + day * 1.15);

    // Atmosphere: strongest on the limb, and strongest again where the limb
    // is also facing the star, which is what makes the crescent.
    float fresnel = pow(1.0 - max(dot(normalize(vNormalW), vViewW), 0.0), 2.6);
    colour += uAtmos * fresnel * (0.16 + day * 0.55);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

const RING_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RING_FRAG = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;

  uniform vec3  uStar;
  uniform vec3  uColour;
  uniform vec3  uCentre;
  uniform float uRadius;

  ${RING_DENSITY}

  void main() {
    // ringGeometry lays u across the radius, which is exactly what the gaps
    // and the density falloff both need.
    float density = ringDensity(vUv.x);

    vec3 toStar = uStar - vWorld;
    float reach = length(toStar);
    vec3 L = toStar / reach;

    // Lit from the same star, and dimmer edge-on.
    float lit = 0.25 + 0.75 * abs(dot(normalize(vNormalW), L));

    // The planet's own shadow, cast across the far side of its ring: the
    // closest approach of the ray to the star against the planet's radius.
    vec3 m = uCentre - vWorld;
    float along = dot(m, L);
    if (along > 0.0 && along < reach) {
      float gap = length(m - L * along);
      // Softened over a quarter radius, which is roughly the penumbra a star
      // of this angular size would actually throw.
      lit *= smoothstep(uRadius, uRadius * 1.25, gap) * 0.88 + 0.12;
    }

    gl_FragColor = vec4(uColour * lit, density * 0.6);
  }
`;

const HALO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColour;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Tight core, long tail — the shape a glow actually has. One exponential
    // rather than two powers: same curve, a fraction of the cost.
    float glow = exp(-d * 3.6);
    gl_FragColor = vec4(uColour, glow * 0.46);
  }
`;

/** `var(--line-red-on-void)` → the hex the browser actually computes. */
function resolveColour(value: string): string {
  const match = /var\((--[\w-]+)\)/.exec(value);
  if (!match || typeof window === "undefined") return value;
  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim();
  return computed || "#fafaf7";
}
