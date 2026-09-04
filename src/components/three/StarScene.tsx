"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";

/**
 * The star, close enough to see the surface.
 *
 * This is what the centre of the hero system turns into when you click it. It
 * is a different picture from the one in the about section: that one is the
 * photosphere in white light, granulation and sunspots, which is the Sun as a
 * camera sees it. This is the chromosphere in H-alpha — the layer just above,
 * photographed through a filter a tenth of a nanometre wide — which is the Sun
 * as it is usually photographed when someone wants it to look like this.
 *
 * ## Why the surface is threads and not cells
 *
 * In white light the surface is granulation: packed convection cells with dark
 * lanes between them, which is why `SunScene` draws it with a Worley field.
 * In H-alpha you are looking at gas held by the magnetic field, and the field
 * is smooth, so what you see is *fibrils* — hair, lying in long curving strands
 * that follow the field lines and swirl around the active regions.
 *
 * The shape comes from level sets. Take a smooth scalar field over the sphere
 * and slice it finely: the contours are long meandering curves that never
 * cross, they crowd where the field steepens, and they are hair. That is the
 * same `abs(2n - 1)` ridge that was exactly the wrong answer for granulation —
 * a maze of curves that never close — and it is exactly the right one here.
 *
 * ## Why it is baked
 *
 * This fills the screen. Full screen at a 1.6 pixel ratio on a laptop is around
 * five megapixels, and the surface above is a dozen fbm evaluations deep — live,
 * that is tens of milliseconds a frame and the fans come on. So the whole
 * surface is generated once into a cube map and after that a frame is one
 * texture fetch and some arithmetic. The bake happens while the screen is
 * fading to black, so the one expensive moment is spent where there is nothing
 * to see anyway.
 *
 * What still runs live is the part that has to: the corona and the prominences
 * standing off the limb, which move. They are an annulus rather than a disc,
 * and the shader leaves early everywhere the photosphere is in front of them.
 */

/**
 * Cube face size for the baked surface. Six of these, generated once.
 *
 * 768 rather than 1024 because the extra was not visible and the wait was. Six
 * faces at 1024 is half a second of solid main-thread work, and although that
 * happens behind an opaque screen where nothing can stutter, it is still half a
 * second of black before the star arrives. At 768 the same bake is around three
 * hundred milliseconds, and the disc is still sampled at roughly two texels per
 * screen pixel on a large display — so the strands are resolution-limited by
 * the screen rather than by this.
 */
const SURFACE_SIZE = 768;

/** Sphere radii from the centre to the edge of the corona plane. */
const REACH = 1.62;

/** Half the frame height, in sphere radii. Room for the prominences. */
const FRAME = 1.34;

/**
 * Half the frame *width* in portrait, where width is the binding constraint.
 *
 * Tighter than FRAME on purpose. Sized to clear the prominences on both sides,
 * a phone gives the disc three quarters of its width and a third of its height,
 * which is a small sun in a lot of black. Letting the corona run off the sides
 * costs nothing — it is a fringe, and the photograph this is built from is a
 * crop through the limb anyway — and buys a disc that fills the screen it is on.
 */
const FRAME_NARROW = 1.16;

/** Seconds for the star to swell into frame when it opens. */
const INTRO_SECONDS = 1.15;

/** Scale the star starts at, roughly the size it was on the ring. */
const INTRO_FROM = 0.28;

/** How far the pointer tips the star, in radians. */
const SWAY = 0.06;
const EASE = 1.8;

/** Cubic in-out — starts and ends at rest. */
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

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

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

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
`;

const SURFACE_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The generator. Runs six times at bake and never again, which is what pays
 * for the octave counts in here.
 *
 * Nothing in this is view dependent. Limb darkening, the rim, and the colour
 * ramp all depend on where the camera is and all happen per frame; what gets
 * stored is only what is true of the surface itself.
 *
 *   R  chromosphere intensity, everything composited
 *   G  a fine strand field on its own, so the live shader has something to
 *      breathe with that is not just a brightness wobble over the whole disc
 *   B  how magnetically active this patch is, which tints as well as brightens
 */
const SURFACE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;

  ${NOISE}

  /**
   * The ridge: the single level set through the middle of the noise.
   *
   * This is the whole shape of a fibril field, and it is worth being precise
   * about why, because the near miss is instructive. Slicing a smooth scalar at
   * *evenly spaced* intervals — fract(psi * pitch) — gives nested contours at a
   * regular spacing, which is a topographic map: concentric whorls around every
   * local maximum, and it reads as a fingerprint.
   *
   * Taking one contour per noise cell instead gives one long meandering curve
   * per cell, which is hair. The centre is the noise's own midpoint rather than
   * 0.5, because three octaves of a [0,1] noise sum to at most 0.875 and a
   * ridge cut at 0.5 sits off to one side of the distribution.
   */
  float ridge(float n, float sharpness) {
    return pow(clamp(1.0 - abs(n - 0.44) * 2.4, 0.0, 1.0), sharpness);
  }

  void main() {
    vec3 n = normalize(vDirection);

    /*
     * The swirl.
     *
     * Bending the space the strands are measured in is what gives them
     * direction. It replaces an earlier attempt to squash the sample space
     * along a tangent flow field, which could not work: every sample here is
     * radial, a tangent is perpendicular to it by construction, and the
     * projection onto the flow is therefore identically zero. A warp has no
     * such degeneracy — it displaces the sample point rather than projecting
     * it, so it bends the strands wherever it points.
     */
    vec3 warp = vec3(
      fbm(n * 3.4 + vec3(3.1), 3),
      fbm(n * 3.4 + vec3(17.4), 3),
      fbm(n * 3.4 + vec3(31.7), 3)
    ) - 0.5;

    // The hair, at two scales. The fine one is the texture; the coarse one is
    // the larger structure it lies in.
    float fine = ridge(fbm(n * 168.0 + warp * 34.0, 3), 2.7);
    float coarse = ridge(fbm(n * 63.0 + warp * 17.0, 3), 1.7);

    // Supergranulation. In H-alpha the cell walls are where the field is swept
    // to and the gas is brightest, so the network is the *boundary* — far from
    // a seed rather than near one.
    float cell = worley(n * 12.0);
    float network = smoothstep(0.30, 0.66, cell);

    // Active regions: plage, the bright magnetic ground around a sunspot group.
    // Named 'region' rather than the obvious thing because 'active' is a
    // reserved word in GLSL ES, and a shader that uses it does not compile —
    // it bakes six black faces and says nothing.
    float region = fbm(n * 2.9 + vec3(4.4, 1.2, 8.8), 4);
    float plage = smoothstep(0.52, 0.68, region);

    // Filaments: cool gas suspended on the field, seen against the bright disc
    // and therefore dark. The same ridge, far coarser and far sharper, so it
    // comes out as a few long curves rather than a texture — and only where
    // there is field to hold it up.
    float filament =
      smoothstep(0.62, 0.93, ridge(fbm(n * 13.0 + warp * 7.0, 3), 3.2)) *
      smoothstep(0.42, 0.58, region);

    // Sunspot cores, inside the busiest plage.
    float spot = smoothstep(0.655, 0.700, region);

    // A broad unevenness under everything else. Without it the disc is one
    // tone with detail on top; the real thing is lighter and darker across
    // whole quarters of itself.
    float broad = fbm(n * 1.7 + vec3(88.0), 3) - 0.44;

    float heat =
      0.37
      + 0.33 * fine
      + 0.16 * coarse
      + 0.09 * network
      + 0.22 * plage
      + 0.13 * broad
      - 0.30 * filament
      - 0.38 * spot;

    // Fine grain, so the strands do not end at a hard resolution.
    heat += (fbm(n * 430.0, 2) - 0.5) * 0.06;

    gl_FragColor = vec4(clamp(heat, 0.0, 1.0), fine, region, 1.0);
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
  uniform samplerCube uSurface;
  uniform float uTime;
  varying vec3 vDirection;
  varying vec3 vNormalView;

  /**
   * H-alpha is one line, so this is one colour at a range of brightnesses
   * rather than a spectrum — which is why a filtered sun photograph is always
   * monochrome orange. The ramp runs from near-black in a filament to a hot
   * cream in the middle of a plage.
   */
  vec3 haColour(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c = mix(vec3(0.055, 0.008, 0.002), vec3(0.30, 0.045, 0.008), smoothstep(0.00, 0.20, t));
    c = mix(c, vec3(0.62, 0.145, 0.020), smoothstep(0.16, 0.38, t));
    c = mix(c, vec3(0.90, 0.335, 0.065), smoothstep(0.34, 0.56, t));
    c = mix(c, vec3(0.99, 0.545, 0.175), smoothstep(0.52, 0.74, t));
    c = mix(c, vec3(1.00, 0.760, 0.420), smoothstep(0.70, 0.88, t));
    c = mix(c, vec3(1.00, 0.925, 0.720), smoothstep(0.86, 1.00, t));
    return c;
  }

  void main() {
    vec4 s = textureCube(uSurface, normalize(vDirection));

    // The surface is fixed, but the chromosphere is not still — so the stored
    // strand field is breathed in and out against the composite, phased by how
    // active the patch is so the whole disc does not pulse together.
    float heat = s.r + (s.g - 0.45) * 0.085 * sin(uTime * 0.22 + s.b * 21.0);

    // One in the middle of the disc, zero at the limb. The camera is
    // orthographic, so the view direction is constant and this is just the
    // normal leaning away.
    float mu = clamp(vNormalView.z, 0.0, 1.0);

    // Limb darkening. Looking at the edge, the line of sight leaves the sun
    // higher up, where the gas is cooler and thinner.
    heat *= 0.30 + 0.70 * pow(mu, 0.58);

    vec3 colour = haColour(heat);

    // Limb reddening: the edge is a different colour as well as a darker one.
    colour = mix(colour, colour * vec3(1.06, 0.62, 0.34), 1.0 - pow(mu, 0.42));

    // The rim. Right at the edge the disc is not the surface any more, it is
    // the chromosphere seen sideways — optically thick, and the brightest
    // H-alpha on the whole sun.
    colour += vec3(1.00, 0.40, 0.14) * smoothstep(0.30, 0.015, mu) * 0.85;

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
    // Two early exits, and they are most of what this shader costs. Outside
    // the quad's circle there is nothing; inside the disc the photosphere is
    // in front of all this. Leaving without them meant running every octave
    // below across the whole disc and then multiplying the result by zero.
    if (r > uReach || r < 0.955) discard;
    float h = r - 1.0;

    // Sampled around a ring rather than on the angle. Feeding atan into noise
    // puts a seam down one side where -pi meets pi; a point on a circle has no
    // such edge to fall off.
    vec3 ring = vec3(p / max(r, 0.0001), 0.0);

    // Height runs through the noise as fast as angle does. Sample it slowly and
    // every structure comes out radially constant, which is a starburst — the
    // shape a lens makes, not the shape gas makes.
    float flow = fbm(ring * 3.2 + vec3(0.0, 0.0, h * 9.0 - uTime * 0.11), 3);
    float lean = fbm(ring * 6.5 + vec3(0.0, 0.0, h * 7.0 - uTime * 0.05), 3);
    float roots = fbm(ring * 11.0 + vec3(0.0, 0.0, h * 4.2 + uTime * 0.028), 3);

    // Spicules: the fine bristle of jets standing all the way round the limb,
    // which is what stops the edge reading as a drawn circle.
    float bristle = fbm(ring * 52.0 + vec3(0.0, 0.0, uTime * 0.02), 2);
    float spicules =
      exp(-h * 74.0) * pow(max(bristle - 0.42, 0.0) * 3.2, 1.6) * 2.6;

    // The inner corona: bright at the limb, gone within a third of a radius.
    float halo = exp(-h * 8.5) * (0.30 + 0.85 * flow);

    // Prominences. Where they stand is the coarse noise at the limb; how far
    // they reach and which way they lean is the taller field. Sharpened hard,
    // so they read as separate tongues rather than as a fuzzy ring.
    float tongues = pow(max(roots - 0.455, 0.0) * 3.5, 2.4);
    float prominence =
      exp(-h * 9.0) * tongues * smoothstep(0.08, 0.38, lean) * 7.0;

    // A wide faint outer corona, so the whole thing does not stop dead.
    float outer = exp(-h * 2.4) * (0.05 + 0.06 * flow);

    float glow = halo + prominence + outer + spicules;
    // Feathered across the limb, so the corona meets the disc rather than
    // starting at a hard circle one pixel outside it.
    glow *= smoothstep(0.958, 1.004, r);
    // And nothing at the edge of the quad, or the corona ends in a square.
    glow *= smoothstep(uReach, uReach * 0.6, r);

    // Coloured by which of the two is doing the work rather than by how far out
    // the pixel is. Tint by radius and the prominences come out orange the
    // moment they overlap the bright inner corona, which is where they all
    // start — they are hydrogen, and hydrogen is red wherever it is standing.
    vec3 hAlpha = vec3(1.00, 0.17, 0.07);
    vec3 hot = vec3(1.00, 0.72, 0.40);
    float lit = prominence + spicules;
    float share = lit / max(lit + halo, 0.0001);
    vec3 colour = mix(hot, hAlpha, clamp(share, 0.0, 1.0));

    gl_FragColor = vec4(colour * glow, 1.0);
  }
`;

/** Generates the surface once, six faces of it, and hands back the cube. */
function useBakedSurface() {
  const gl = useThree((state) => state.gl);
  const [surface, setSurface] = useState<THREE.CubeTexture | null>(null);

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(SURFACE_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      // Intensity and masks, not colour. Pushing them through a colour space
      // on the way in and back out again would bend all three.
      colorSpace: THREE.NoColorSpace,
    });

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(5, 64, 48);
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      // The default blend multiplies what a shader writes by its own alpha and
      // mixes it into what was there. Right for a translucent surface, wrong
      // here, where the channels are three separate fields.
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
  }, [gl]);

  return surface;
}

/**
 * Sets the frame. Orthographic, because a sphere this close in perspective
 * has a limb that is not where the geometry says it is, and the whole picture
 * here is about the limb.
 */
function Frame() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const aspect = size.width / Math.max(size.height, 1);
    // Landscape is bound by height, portrait by width.
    const halfHeight =
      aspect < 1 ? FRAME_NARROW / Math.max(aspect, 0.4) : FRAME;
    ortho.left = -halfHeight * aspect;
    ortho.right = halfHeight * aspect;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

function Star({
  pointer,
  drift,
  onReady,
}: {
  pointer: React.RefObject<{ x: number; y: number }>;
  drift: boolean;
  onReady: () => void;
}) {
  const surface = useBakedSurface();
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const intro = useRef(0);
  const announced = useRef(false);

  // Rebuilt when the bake lands, so the material is compiled with the cube
  // already bound. Handing a shader a null samplerCube and filling it in
  // afterwards leaves it sampling the empty texture three substituted at
  // compile time — which reads back as zero, and a sun whose every channel is
  // zero is a black disc with a corona around it.
  const photosphere = useMemo(
    () => ({ uSurface: { value: surface }, uTime: { value: 0 } }),
    [surface],
  );
  const corona = useMemo(
    () => ({ uTime: { value: 0 }, uReach: { value: REACH } }),
    [],
  );

  useFrame((state, delta) => {
    // Nothing moves and nothing counts until the surface exists, so the swell
    // starts from the first frame that has something to swell.
    if (!surface) return;
    if (!announced.current) {
      announced.current = true;
      onReady();
    }

    const t = state.clock.elapsedTime;
    photosphere.uTime.value = t;
    corona.uTime.value = t;

    // Turning under its own surface, which is the one motion that says this is
    // a sphere and not a picture of one. A quarter of a degree a second: the
    // real thing takes about a month, and this is already a lie by a factor of
    // thirty thousand — any faster and it reads as a spinning ball.
    if (ball.current) ball.current.rotation.y = t * 0.02;

    const node = group.current;
    if (!node) return;

    intro.current = Math.min(1, intro.current + delta / INTRO_SECONDS);
    const swell = INTRO_FROM + (1 - INTRO_FROM) * ease(intro.current);

    const step = Math.min(1, delta * EASE);
    const wantedX = drift
      ? Math.sin(t * 0.09) * SWAY * 0.5
      : -(pointer.current?.y ?? 0) * SWAY;
    const wantedY = drift
      ? Math.sin(t * 0.06) * SWAY * 0.7
      : (pointer.current?.x ?? 0) * SWAY;
    node.rotation.x += (wantedX - node.rotation.x) * step;
    node.rotation.y += (wantedY - node.rotation.y) * step;
    node.scale.setScalar(swell);
  });

  if (!surface) return null;

  // The sphere is dense because its silhouette is the whole picture and it is
  // drawn a thousand pixels across; a coarser one shows flats on the limb.
  return (
    <group ref={group} scale={INTRO_FROM}>
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
        <sphereGeometry args={[1, 192, 128]} />
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

export default function StarScene({
  drift = false,
  onReady,
}: {
  drift?: boolean;
  /** Fired on the first frame that has a surface to draw. */
  onReady?: () => void;
}) {
  const pointer = useRef({ x: 0, y: 0 });
  const ready = useRef(onReady);
  ready.current = onReady;

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
      // The surface is baked, so a frame is cheap enough to spend the pixels
      // on sharpness instead. Capped rather than uncapped: past this the disc
      // is already sampled well above what the strands carry.
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      orthographic
      camera={{ position: [0, 0, 4], near: 0.1, far: 20 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence />
      <Frame />
      <Star
        pointer={pointer}
        drift={drift}
        onReady={() => ready.current?.()}
      />
    </Canvas>
  );
}
