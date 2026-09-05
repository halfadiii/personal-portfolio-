"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sunDirection } from "@/lib/sky";
import { Cadence } from "./Cadence";

/**
 * The Moon, at the phase it is actually at, lit from where the sun actually is.
 *
 * Nothing here is a photograph. The surface is generated: a crater field of
 * seven octaves, basins flooded and darkened into maria, and a grain over the
 * top of it. Which is a deliberate choice rather than a shortcut — a real
 * albedo map of the near side is a megabyte or two of JPEG for a disc drawn a
 * couple of hundred pixels across, and a generated one costs nothing to send
 * and can be lit from any angle without a seam.
 *
 * The consequence is worth stating plainly: this is a moon, not the Moon. The
 * maria are in plausible places, not their places. What is real is the phase,
 * the direction the light comes from, and the way the light behaves once it
 * gets there.
 *
 * ## Why it is baked
 *
 * The surface never changes; only the lighting does. So the whole thing is
 * evaluated once into a cube map — normals in RGB, albedo in alpha — and after
 * that every frame is one texture fetch and some arithmetic, which is what
 * lets it sit inside a card on a phone. A cube map rather than the usual
 * equirectangular sheet, because a sphere unwrapped onto a rectangle pinches
 * at the poles and seams down the back, and a cube does neither.
 */

/** Cube face size for the baked surface. Six of these, generated once. */
const SURFACE_SIZE = 512;

/** How far the pointer tips the moon, in radians. About five degrees. */
const LIBRATION = 0.085;

/** How fast it catches up. Low enough to read as weight rather than lag. */
const EASE = 2.4;

const SURFACE_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The generator. Runs six times at bake and never again.
 *
 * Craters are laid out one to a grid cell, at seven scales, with the grid
 * turned between each so the eye cannot find the lattice. Each crater is kept
 * inside its own cell — jitter plus radius stays under half a cell — which is
 * what makes a single cell lookup enough, and turns what is normally a
 * twenty-seven cell neighbourhood search into one.
 */
const SURFACE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;
  uniform float uRelief;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += noise3(p) * amp;
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  // One crater in cross-section. A bowl that bottoms out at the centre, a
  // raised rim just inside the edge, and an ejecta skirt fading to nothing —
  // which is what lets them stack without cutting each other off.
  float craterProfile(float t) {
    if (t >= 1.0) return 0.0;
    float bowl = (t * t - 1.0) * 0.55;
    float rim = exp(-26.0 * (t - 0.80) * (t - 0.80)) * 0.42;
    return (bowl + rim) * smoothstep(1.0, 0.84, t);
  }

  const mat3 TURN = mat3(
    0.61, -0.62, 0.49,
    0.77, 0.36, -0.53,
    0.19, 0.70, 0.69
  );

  float craterField(vec3 d) {
    float height = 0.0;
    float amp = 1.0;
    float freq = 1.9;
    vec3 p = d;
    for (int i = 0; i < 7; i++) {
      vec3 q = p * freq;
      vec3 cell = floor(q);
      vec3 f = fract(q) - 0.5;
      // Kept inside the cell: 0.07 of jitter plus 0.40 of radius stays under
      // the half cell that a single lookup can see.
      vec3 jitter = (hash33(cell) - 0.5) * 0.14;
      float radius = 0.18 + hash13(cell + 3.7) * 0.22;
      // Big ones are rare and small ones are everywhere, which is the one
      // thing a crater count actually tells you about a surface: impactors
      // follow a power law, so a field with as many basins as pockmarks looks
      // wrong long before anyone works out why.
      float present = step(0.64 - float(i) * 0.055, hash13(cell + 11.3));
      height += craterProfile(length(f - jitter) / radius) * amp * present;
      p = TURN * p;
      freq *= 1.87;
      amp *= 0.58;
    }
    return height;
  }

  // Everything with an edge sharp enough to matter to the normal. The maria
  // are left out on purpose: they are hundreds of kilometres across and their
  // slope is nothing, so differencing them three times a texel buys no detail.
  float relief(vec3 d, float flatten) {
    return craterField(d) * flatten
      + (noise3(d * 31.0) - 0.5) * 0.10
      + (noise3(d * 83.0) - 0.5) * 0.05;
  }

  void main() {
    vec3 d = normalize(vDirection);

    // The dark plains: basalt that flooded the big basins, so they sit lower,
    // smoother, darker, and hold far fewer craters than the highlands around
    // them — every one of which this has to reproduce to read as a moon.
    //
    // Two scales rather than a full fbm, and both of them low. Mare Imbrium is
    // a third of the disc across; run this at the frequency detail wants and
    // the plains break into blotches, run it any lower and one cell covers the
    // whole sphere and there are no plains at all. They end up over about a
    // third of the surface, which is what the near side comes to.
    float basins = noise3(d * 2.4 + vec3(11.2, 4.7, 19.4)) * 0.62
                 + noise3(d * 5.1 + vec3(3.1, 8.8, 2.2)) * 0.38;
    // Two noises averaged together pile up around the middle and stop
    // reaching either end, so a threshold over them gives grey haze instead of
    // plains. Stretching the range about the midpoint first is what turns it
    // back into somewhere that is either mare or highland.
    basins = (basins - 0.5) * 2.3 + 0.5;
    float maria = smoothstep(0.44, 0.58, basins);
    float flatten = 1.0 - 0.82 * maria;

    vec3 axis = abs(d.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t1 = normalize(cross(axis, d));
    vec3 t2 = cross(d, t1);

    float e = 0.0022;
    float h0 = relief(d, flatten);
    float h1 = relief(normalize(d + t1 * e), flatten);
    float h2 = relief(normalize(d + t2 * e), flatten);

    vec3 slope = (t1 * (h1 - h0) + t2 * (h2 - h0)) / e;
    vec3 normal = normalize(d - slope * uRelief);

    // Highlands are bright anorthosite, maria are dark basalt, crater floors
    // sit in their own shadow and rims catch the light.
    float albedo = 0.78;
    albedo -= maria * 0.52;
    albedo += h0 * 0.16;
    albedo += (noise3(d * 64.0) - 0.5) * 0.07;
    albedo = clamp(albedo, 0.06, 1.0);

    gl_FragColor = vec4(normal * 0.5 + 0.5, albedo);
  }
`;

const MOON_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The lighting, which is where the realism actually lives.
 *
 * A Lambert sphere lit from behind the camera falls off towards its edge and
 * reads as a ball. The full Moon does not do that — it reads as a flat disc
 * cut out of the sky. The reason is that its dust backscatters: every grain
 * shadows its neighbours, and at full phase those shadows are hidden behind
 * the grains casting them. Lommel-Seeliger is the cheap stand-in for that, and
 * mixing it over Lambert is most of the difference between a moon and a grey
 * sphere.
 */
const MOON_FRAG = /* glsl */ `
  precision highp float;
  uniform samplerCube uSurface;
  uniform vec3 uSun;
  uniform vec3 uView;
  uniform float uEarthshine;
  varying vec3 vDirection;

  void main() {
    vec3 d = normalize(vDirection);
    vec4 surface = textureCube(uSurface, d);

    // Everything below is in the moon's own space. Three gives the fragment
    // stage no normal matrix, and there is no reason to want one: the surface
    // normals come out of the cube map in object space, so it is cheaper to
    // bring the sun and the eye down to them than to lift every fragment up.
    vec3 n = normalize(surface.xyz * 2.0 - 1.0);
    float albedo = surface.w;

    // Constant, because the camera is orthographic: a body four hundred
    // thousand kilometres away does not subtend enough angle for perspective
    // to mean anything, and every photograph of one is effectively parallel.
    vec3 v = normalize(uView);
    vec3 l = normalize(uSun);

    float toSun = dot(n, l);
    float lit = max(toSun, 0.0);
    float toEye = max(dot(n, v), 0.02);

    float seeliger = lit / (lit + toEye);
    float shade = mix(lit, seeliger * 1.55, 0.78);

    // The opposition surge: within a few degrees of full the disc brightens
    // sharply, because that is the moment the shadows go out of sight.
    float g = acos(clamp(dot(l, v), -1.0, 1.0));
    shade *= 1.0 + 0.22 * exp(-g * 6.0);

    // Highlands run warm, maria run slightly blue. Both are nearly grey — the
    // Moon reflects about as much light as worn asphalt, and only looks white
    // because of what it is seen against.
    vec3 tint = mix(vec3(0.85, 0.88, 0.97), vec3(1.02, 0.99, 0.94), albedo);
    vec3 colour = tint * albedo * shade * 1.42;

    // Earthshine. The unlit side is not black: a gibbous Earth hangs over it,
    // four times as wide as the Moon is from here and a great deal brighter.
    colour += vec3(0.15, 0.18, 0.27) * max(-toSun, 0.0) * uEarthshine;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** Generates the surface once, six faces of it, and hands back the cube. */
function useBakedSurface(relief: number) {
  const gl = useThree((state) => state.gl);
  const [surface, setSurface] = useState<THREE.CubeTexture | null>(null);

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(SURFACE_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      // Normals and albedo are data, not colour. Pushing them through a colour
      // space on the way in and back out again would bend both.
      colorSpace: THREE.NoColorSpace,
    });

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(5, 64, 48);
    const material = new THREE.ShaderMaterial({
      uniforms: { uRelief: { value: relief } },
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      // Not a picture, so it must not be composited like one. The default
      // blend multiplies what a shader writes by its own alpha and mixes it
      // into whatever was already there — which is right for a translucent
      // surface and wrong here, where alpha carries the albedo and RGB carries
      // a normal. Left on, every normal in the map comes out scaled by the
      // brightness of the ground under it.
      blending: THREE.NoBlending,
    });
    scene.add(new THREE.Mesh(geometry, material));

    new THREE.CubeCamera(0.1, 20, target).update(gl, scene);

    geometry.dispose();
    material.dispose();
    setSurface(target.texture);

    return () => {
      setSurface(null);
      target.dispose();
    };
  }, [gl, relief]);

  return surface;
}

function Moon({
  phase,
  pointer,
  drift,
}: {
  phase: number;
  pointer: React.RefObject<{ x: number; y: number }>;
  drift: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const surface = useBakedSurface(0.065);

  // The sun sits still in the world while the moon turns under it, which is
  // the whole point — a light that rolled with the object would light the same
  // craters for ever and the libration would be invisible.
  const sun = useMemo(
    () => new THREE.Vector3(...sunDirection(phase)).normalize(),
    [phase],
  );

  const uniforms = useMemo(
    () => ({
      uSurface: { value: surface },
      uSun: { value: sun.clone() },
      uView: { value: new THREE.Vector3(0, 0, 1) },
      uEarthshine: { value: 1 },
    }),
    [surface, sun],
  );

  useFrame((state, delta) => {
    const node = mesh.current;
    if (!node) return;
    const step = Math.min(1, delta * EASE);

    // Libration. The real Moon rocks about eight degrees either way over a
    // month, so a moon that tips a little towards the pointer is not a
    // liberty — it is the one motion this object actually makes.
    const wantedX = drift
      ? Math.sin(state.clock.elapsedTime * 0.11) * LIBRATION * 0.5
      : -(pointer.current?.y ?? 0) * LIBRATION;
    const wantedY = drift
      ? Math.sin(state.clock.elapsedTime * 0.07) * LIBRATION * 0.7
      : (pointer.current?.x ?? 0) * LIBRATION;

    node.rotation.x += (wantedX - node.rotation.x) * step;
    node.rotation.y += (wantedY - node.rotation.y) * step;

    // Sun and camera carried into the moon's own frame, once a frame, rather
    // than a matrix multiply per pixel. The mesh sits at the origin at unit
    // scale, so undoing its rotation is the whole of the transform.
    const undo = node.quaternion.clone().invert();
    uniforms.uSun.value.copy(sun).applyQuaternion(undo);
    uniforms.uView.value.set(0, 0, 1).applyQuaternion(undo);
  });

  if (!surface) return null;

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 96, 64]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={MOON_VERT}
        fragmentShader={MOON_FRAG}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Sets the frame, and decides how much of the body is in it.
 *
 * Beside the section the canvas is half as wide as it is tall and the sphere
 * is centred on the edge of it, so exactly half a disc is drawn and the other
 * half is never rasterised at all. Hiding it with CSS instead would have the
 * renderer fill every one of those pixels and then throw them away.
 *
 * Behind the section — which is what a phone gets — the whole disc is wanted,
 * so the camera sits on the axis instead and the box is square. Same scene,
 * same cost per pixel; only where the camera stands changes.
 */
function Frame({ halfHeight, centred }: { halfHeight: number; centred: boolean }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const halfWidth = halfHeight * (size.width / Math.max(size.height, 1));
    ortho.left = -halfWidth;
    ortho.right = halfWidth;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.position.set(centred ? 0 : -halfWidth, 0, 4);
    ortho.updateProjectionMatrix();
  }, [camera, size, halfHeight, centred]);

  return null;
}

export default function MoonScene({
  phase,
  drift = false,
  full = false,
}: {
  /** 0 at new, 0.5 at full. */
  phase: number;
  /** True where there is no pointer to follow, so it moves on its own. */
  drift?: boolean;
  /** Draw the whole disc, centred, rather than the left half of one. */
  full?: boolean;
}) {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (drift) return;
    const onMove = (event: PointerEvent) => {
      // Measured against the window rather than the canvas, so the moon
      // answers a pointer crossing the section instead of only the sliver of
      // it that happens to be on the page.
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [drift]);

  return (
    <Canvas
      frameloop="never"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      orthographic
      camera={{ position: [0, 0, 4], near: 0.1, far: 20 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence />
      <Frame halfHeight={1.12} centred={full} />
      <Moon phase={phase} pointer={pointer} drift={drift} />
    </Canvas>
  );
}
