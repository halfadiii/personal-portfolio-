"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";

/**
 * The Sun, close up.
 *
 * Two surfaces. The sphere is the photosphere: granulation — the tops of the
 * convection cells carrying heat up from below — over a slower supergranular
 * pattern, with sunspots where the magnetic field is strong enough to hold the
 * convection down and let the gas cool, and faculae, the bright magnetic froth
 * around them that only shows up near the edge. The plane behind it is
 * everything outside the limb: the inner corona and the prominences arching
 * off it.
 *
 * ## Why the cells are shaped the way they are
 *
 * Granulation is not noise. It is a packed field of cells with dark lanes
 * between them, and drawing it as blobs of smooth noise is most of what makes
 * a rendered sun look like a beach ball. `abs(2n - 1)` puts a dark line
 * wherever the noise crosses its own midpoint, so the bright part is the
 * middle of a cell and the network between them is the intergranular lane —
 * which is the shape convection actually makes, for a couple of instructions.
 *
 * ## Colour
 *
 * Not a licence. The photosphere runs from deep red in the lanes to near white
 * at the centre of a granule, which is what a few hundred kelvin of difference
 * looks like at these temperatures, and the edge is redder as well as dimmer
 * because the line of sight there leaves the sun higher up, where it is cooler.
 * The prominences are crimson because prominences are crimson: they are
 * hydrogen glowing at 656 nanometres, and Hα is the reddest thing there is.
 *
 * Nothing here is baked, because unlike the moon this surface moves. That
 * makes it the most expensive thing on the page per pixel, so it runs at
 * thirty frames — the granulation drifts over minutes and nothing about it
 * needs sampling twice as often — and only half of it is ever drawn.
 */

/** Sphere radii from the centre to the edge of the corona plane. */
const REACH = 1.45;

/** Half the frame height, in sphere radii. */
const FRAME = 1.3;

/** How far the pointer tips the sun, in radians. */
const SWAY = 0.075;
const EASE = 2.0;

const NOISE = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      sum += noise3(p) * amp;
      p *= 2.07;
      amp *= 0.5;
    }
    return sum;
  }

  // Three sines per lookup and twenty-seven lookups per pixel is eighty-one
  // transcendentals for one granule field, which is most of the cost of the
  // scene. This one is arithmetic.
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  // Distance to the nearest of one seed per cell — Worley's F1.
  //
  // This is the second attempt. Taking abs(2n - 1) of smooth noise is far
  // cheaper and looks plausible in a still, but what it actually draws is the
  // level set of the noise at its own midpoint: long meandering curves that
  // never close. That is a maze, not a cell field. Granulation is packed
  // polygons, and packed polygons come from seeds and distances.
  float worley(vec3 p) {
    vec3 base = floor(p);
    float best = 9.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 cell = base + vec3(float(x), float(y), float(z));
          vec3 seed = cell + hash33(cell);
          vec3 away = p - seed;
          best = min(best, dot(away, away));
        }
      }
    }
    return sqrt(best);
  }

  // Bright across the middle of a granule, dark in the lane between two.
  float granules(vec3 p) {
    return 1.0 - smoothstep(0.38, 0.86, worley(p));
  }
`;

const PHOTOSPHERE_VERT = /* glsl */ `
  varying vec3 vDirection;
  varying vec3 vNormalView;
  void main() {
    vDirection = normalize(position);
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PHOTOSPHERE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec3 vDirection;
  varying vec3 vNormalView;

  ${NOISE}

  vec3 heatColour(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c = mix(vec3(0.15, 0.02, 0.00), vec3(0.70, 0.15, 0.01), smoothstep(0.00, 0.26, t));
    c = mix(c, vec3(0.97, 0.47, 0.09), smoothstep(0.22, 0.48, t));
    c = mix(c, vec3(1.00, 0.76, 0.34), smoothstep(0.44, 0.72, t));
    c = mix(c, vec3(1.00, 0.92, 0.64), smoothstep(0.68, 0.90, t));
    c = mix(c, vec3(1.00, 0.99, 0.92), smoothstep(0.88, 1.00, t));
    return c;
  }

  void main() {
    vec3 d = normalize(vDirection);
    // One in the middle of the disc, zero at the limb. The view direction is
    // constant, because the camera is orthographic.
    float mu = clamp(vNormalView.z, 0.0, 1.0);

    // Three scales of convection. Supergranules are tens of thousands of
    // kilometres across and last a day; granules are a thousand and last
    // minutes. Only the granules are worth a cell field — the other two are
    // brightness variation, and noise is the right shape for that.
    // The seed grid is regular, so the cells come out too even to be
    // convection. Bending the space they are measured in first — cheaper than
    // a second field — gives them the spread of sizes and the squashed shapes
    // that a real granule pattern has.
    vec3 warp = vec3(
      fbm(d * 9.0 + vec3(3.1), 2),
      fbm(d * 9.0 + vec3(17.4), 2),
      fbm(d * 9.0 + vec3(31.7), 2)
    ) - 0.5;
    float gran = granules(
      d * 55.0 + warp * 2.6 + vec3(uTime * 0.02, 0.0, uTime * 0.012)
    );
    float superg = fbm(d * 6.0 + vec3(0.0, 0.0, uTime * 0.008), 3);
    float dust = fbm(d * 160.0 - vec3(uTime * 0.06), 2);

    float heat = 0.24 + 0.44 * gran + 0.20 * superg + 0.10 * (dust - 0.5);

    // Active regions. Umbra inside penumbra, and the penumbra is combed rather
    // than flat, so the finer cell field is allowed to show through it.
    float field = fbm(d * 3.1 + vec3(4.4, 1.2, 8.8), 3);
    float penumbra = smoothstep(0.520, 0.605, field);
    float umbra = smoothstep(0.585, 0.650, field);
    heat -= penumbra * (0.24 + 0.14 * gran) + umbra * 0.34;

    // Faculae: bright magnetic froth around the active regions. Invisible in
    // the middle of the disc and obvious at the edge, because what you are
    // seeing is the hot wall of a depression you can only look into obliquely.
    float faculae = smoothstep(0.430, 0.515, field) * (1.0 - penumbra);
    heat += faculae * 0.16 * (1.0 - mu);

    // Limb darkening. Looking at the edge you see higher, cooler gas, because
    // the line of sight leaves the sun before reaching the depth it would have
    // reached in the middle.
    heat *= 0.32 + 0.68 * pow(mu, 0.62);

    vec3 colour = heatColour(heat);

    // Limb reddening. The edge is not just dimmer, it is a different colour,
    // and a sun that only dims towards its edge reads as a shaded ball.
    colour = mix(colour, colour * vec3(1.05, 0.70, 0.42), 1.0 - pow(mu, 0.45));

    // The chromosphere: the thin bright line right on the edge, where the
    // photosphere stops and hydrogen takes over.
    colour += vec3(1.00, 0.28, 0.09) * smoothstep(0.20, 0.015, mu) * 0.6;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

const CORONA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORONA_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uReach;
  varying vec2 vUv;

  ${NOISE}

  void main() {
    // In sphere radii, so 1.0 is exactly the limb.
    vec2 p = (vUv - 0.5) * 2.0 * uReach;
    float r = length(p);
    if (r > uReach) discard;
    float h = r - 1.0;

    // Sampled around a ring rather than on the angle itself. Feeding atan into
    // noise puts a seam down one side where -pi meets pi; a point on a circle
    // has no such edge to fall off.
    vec3 ring = vec3(p / max(r, 0.0001), 0.0);

    // Height has to run through the noise as fast as angle does. Sample it
    // slowly and every structure comes out radially constant, which is a
    // starburst — the shape a lens makes, not the shape gas makes.
    float flow = fbm(ring * 3.2 + vec3(0.0, 0.0, h * 9.0 - uTime * 0.12), 3);
    float lean = fbm(ring * 6.5 + vec3(0.0, 0.0, h * 7.0 - uTime * 0.05), 3);
    // Height runs through this one too. Hold it constant along a radius — as
    // "where they stand is fixed at the limb" would suggest — and every tongue
    // comes out as a straight ray of unchanging width, which is a starburst.
    float roots = fbm(ring * 12.0 + vec3(0.0, 0.0, h * 4.5 + uTime * 0.03), 2);

    // Spicules: the fine bristle of jets standing all the way round the limb,
    // which is what stops the edge reading as a drawn circle.
    float bristle = fbm(ring * 46.0 + vec3(0.0, 0.0, uTime * 0.02), 2);
    float spicules =
      exp(-h * 90.0) * pow(max(bristle - 0.42, 0.0) * 3.2, 1.6) * 2.4;

    // The inner corona: bright at the limb and gone within a third of a radius.
    float halo = exp(-h * 9.5) * (0.32 + 0.80 * flow);

    // Prominences. Where they stand is set at the limb and held there; how far
    // they reach and which way they lean is the taller noise. Sharpened hard,
    // so they read as separate tongues rather than a fuzzy ring.
    float tongues = pow(max(roots - 0.42, 0.0) * 3.4, 2.0);
    float prominence =
      exp(-h * 11.0) * tongues * smoothstep(0.05, 0.34, lean) * 6.5;

    // A wide, faint outer corona, so the whole thing does not stop dead.
    float outer = exp(-h * 2.6) * (0.045 + 0.05 * flow);

    float glow = halo + prominence + outer + spicules;
    // Nothing inside the disc — the photosphere is in front of all this.
    glow *= smoothstep(0.965, 1.005, r);
    // And nothing at the edge of the quad, or the corona ends in a square.
    glow *= smoothstep(uReach, uReach * 0.62, r);

    // Coloured by which of the two is doing the work rather than by how far
    // out the pixel is. Tint by radius and the prominences come out orange the
    // moment they overlap the bright inner corona, which is where they all
    // start — they are hydrogen, and hydrogen is red wherever it is standing.
    vec3 hAlpha = vec3(1.00, 0.19, 0.08);
    vec3 hot = vec3(1.00, 0.78, 0.45);
    float lit = prominence + spicules;
    float share = lit / max(lit + halo, 0.0001);
    vec3 colour = mix(hot, hAlpha, clamp(share, 0.0, 1.0));

    gl_FragColor = vec4(colour * glow, 1.0);
  }
`;

/**
 * Sets the frame, and puts the body's centre on its right-hand edge.
 *
 * The canvas is half as wide as it is tall and the sun is centred on the edge
 * of it, so exactly half a disc is drawn and the other half is never
 * rasterised at all. Hiding it with CSS instead would have the renderer fill
 * every one of those pixels and then throw them away — which on the one scene
 * here that computes noise per pixel per frame is half its cost.
 */
function Frame({ halfHeight }: { halfHeight: number }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const halfWidth = halfHeight * (size.width / Math.max(size.height, 1));
    ortho.left = -halfWidth;
    ortho.right = halfWidth;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.position.set(-halfWidth, 0, 4);
    ortho.updateProjectionMatrix();
  }, [camera, size, halfHeight]);

  return null;
}

function Sun({
  pointer,
  drift,
}: {
  pointer: React.RefObject<{ x: number; y: number }>;
  drift: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);

  const photosphere = useMemo(() => ({ uTime: { value: 0 } }), []);
  const corona = useMemo(
    () => ({ uTime: { value: 0 }, uReach: { value: REACH } }),
    [],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    photosphere.uTime.value = t;
    corona.uTime.value = t;

    // The sphere turns under its own noise, which is what stops the
    // granulation reading as a still image with a shimmer on it.
    if (ball.current) ball.current.rotation.y = t * 0.012;

    const node = group.current;
    if (!node) return;
    const step = Math.min(1, delta * EASE);
    const wantedX = drift
      ? Math.sin(t * 0.09) * SWAY * 0.5
      : -(pointer.current?.y ?? 0) * SWAY;
    const wantedY = drift
      ? Math.sin(t * 0.06) * SWAY * 0.7
      : (pointer.current?.x ?? 0) * SWAY;
    node.rotation.x += (wantedX - node.rotation.x) * step;
    node.rotation.y += (wantedY - node.rotation.y) * step;
  });

  return (
    <group ref={group}>
      {/* Behind the sphere, so the disc occludes the near half of the corona
          the way a real limb does. */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[REACH * 2, REACH * 2]} />
        <shaderMaterial
          uniforms={corona}
          vertexShader={CORONA_VERT}
          fragmentShader={CORONA_FRAG}
          transparent
          depthWrite={false}
          toneMapped={false}
          // Straight addition rather than three's additive preset, which
          // multiplies by alpha on the way in and clips anything brighter than
          // one. Light adds; it does not average.
          blending={THREE.CustomBlending}
          blendSrc={THREE.OneFactor}
          blendDst={THREE.OneFactor}
        />
      </mesh>

      <mesh ref={ball}>
        <sphereGeometry args={[1, 128, 96]} />
        <shaderMaterial
          uniforms={photosphere}
          vertexShader={PHOTOSPHERE_VERT}
          fragmentShader={PHOTOSPHERE_FRAG}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default function SunScene({ drift = false }: { drift?: boolean }) {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (drift) return;
    const onMove = (event: PointerEvent) => {
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
      // Half the disc is never drawn, so this can afford a sharper ratio than
      // it could when the whole sphere was on the page.
      dpr={[1, 1.7]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      orthographic
      camera={{ position: [0, 0, 4], near: 0.1, far: 20 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence fps={30} />
      <Frame halfHeight={FRAME} />
      <Sun pointer={pointer} drift={drift} />
    </Canvas>
  );
}
