"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";

/**
 * A Schwarzschild black hole, ray-traced.
 *
 * Not a picture of one — the light is actually bent. Every pixel casts a ray
 * backwards from the camera and integrates a null geodesic through curved
 * spacetime until it either falls through the horizon, hits the accretion disc,
 * or escapes to infinity. Everything the image is famous for falls out of that
 * one loop rather than being drawn on top of it:
 *
 *   - The disc's far side appears **over the top and under the bottom** of the
 *     hole, because light leaving the back of the disc curves over and arrives
 *     anyway. Nothing draws an arch; rays that go up come down.
 *   - The **shadow** is the set of rays captured by the horizon. Its edge sits
 *     at an impact parameter of √27 M, which is about two and a half times the
 *     Schwarzschild radius — noticeably bigger than the horizon itself, and that
 *     ratio is a result here rather than a number that was typed in.
 *   - The **photon ring** is the pile-up of rays that wound around the hole
 *     several times before escaping or landing. It is thin and very bright
 *     because it is the same disc imaged over and over.
 *   - The disc is **lopsided** because the side rotating toward the viewer is
 *     Doppler-beamed and blueshifted while the receding side is dimmed. This is
 *     the single largest visual asymmetry in a real image of one of these.
 *
 * ## The physics, and where it stops
 *
 * The orbit equation for a photon in Schwarzschild geometry, in terms of the
 * inverse radius u = 1/r as a function of the azimuth φ around the hole:
 *
 *     d²u/dφ² = -u + (3/2) rs u²
 *
 * That second term is the whole of general relativity as far as this image is
 * concerned — drop it and you get a straight line in polar coordinates and a
 * picture of a disc with a black dot on it.
 *
 * It is integrated with velocity Verlet, which is second order and symplectic
 * and costs two evaluations a step, rather than Runge–Kutta, which costs four
 * for accuracy this does not need. Non-rotating, so there is no frame dragging
 * and the shadow is circular; a Kerr hole's is not. The disc is treated as
 * optically thick and geometrically thin, so a ray stops at its first crossing.
 */

/**
 * Inner and outer edge of the disc, in Schwarzschild radii.
 *
 * The inner edge is just outside the innermost stable circular orbit, which for
 * a non-rotating hole is three Schwarzschild radii. Inside that there is no
 * circular orbit to sit in, so there is no disc — which is why the bright ring
 * has a hole in it that is considerably larger than the black hole.
 */
const R_IN = 3.2;
const R_OUT = 13.0;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Straight to clip space: this quad is the screen, and nothing about it
    // should depend on where the camera happens to be.
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform vec3  uCamPos;
  uniform vec3  uCamRight;
  uniform vec3  uCamUp;
  uniform vec3  uCamFwd;
  uniform float uTanHalfFov;
  uniform vec2  uCentre;
  uniform float uDiscIn;
  uniform float uDiscOut;
  uniform float uExposure;
  uniform float uSteps;

  varying vec2 vUv;

  const float RS = 1.0;
  /** Mass in geometric units. rs = 2M. */
  const float M = 0.5;
  /** Innermost stable circular orbit for a non-rotating hole: 6M = 3 rs. */
  const float R_ISCO = 3.0;
  /** Where a ray is declared to have escaped. */
  const float R_SKY = 90.0;

  /*
   * How far a ray is allowed to travel around the hole.
   *
   * The photon ring exists because light can orbit: a ray that passes close
   * enough winds one, two, three times before it leaves, and each winding
   * images the whole disc again into a thinner and brighter band. Fourteen
   * radians is a little over two turns, which is enough for the first two
   * images — the third is a fraction of a pixel wide and would cost another
   * four hundred steps to find.
   */
  const int   STEPS = 420;
  const float DPHI = 0.035;
  /*
   * The loop bound has to be a compile-time constant in GLSL ES, so the real
   * budget is a uniform checked inside it. A small screen is drawing a quarter
   * of the pixels of a large one but is often attached to a much weaker GPU
   * than a quarter, so it trades the second and third photon-ring images —
   * which are a pixel wide there — for the frame rate.
   */

  /* ---------------------------------------------------------------- noise */

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
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
          mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
          mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 7; i++) {
      if (i >= octaves) break;
      s += noise3(p) * a;
      p *= 2.03;
      a *= 0.5;
    }
    return s;
  }

  /* ------------------------------------------------------------ blackbody */

  /**
   * Planck's law, collapsed to a colour.
   *
   * A cheap fit to the CIE locus rather than an integration over the spectrum,
   * but it has the property that matters: the ramp runs red to orange to white
   * to blue as the temperature climbs, and it never goes through anything a
   * hot thing is not. The disc here spans roughly three thousand kelvin at its
   * outer edge to sixty thousand at the inner one, which is why the picture is
   * white in the middle and blue where it is coming toward you.
   */
  vec3 blackbody(float kelvin) {
    float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
    vec3 c;

    if (t <= 66.0) {
      c.r = 1.0;
      c.g = clamp(0.39008157 * log(t) - 0.63184144, 0.0, 1.0);
    } else {
      c.r = clamp(1.29293618 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
      c.g = clamp(1.12989086 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
    }

    if (t >= 66.0) {
      c.b = 1.0;
    } else if (t <= 19.0) {
      c.b = 0.0;
    } else {
      c.b = clamp(0.54320678 * log(t - 10.0) - 1.19625408, 0.0, 1.0);
    }
    return c;
  }

  /* ------------------------------------------------------------------ sky */

  /**
   * What is behind the hole.
   *
   * Sampled by the ray's *final* direction, which is not the direction it
   * started in — so the star field is lensed. Near the shadow it smears into
   * arcs, and a star directly behind the hole is drawn as a ring. That is free:
   * the integration already worked out where the ray came from.
   */
  vec3 sky(vec3 d) {
    vec3 col = vec3(0.0);

    // A cold nebula, so the frame is not empty where there are no stars.
    float neb = fbm(d * 2.4 + vec3(11.0), 5);
    float neb2 = fbm(d * 5.1 - vec3(4.0), 4);
    float veil = pow(max(neb - 0.36, 0.0) * 1.8, 2.0);
    col += vec3(0.055, 0.13, 0.30) * veil * 0.85;
    col += vec3(0.02, 0.05, 0.16) * pow(max(neb2 - 0.4, 0.0) * 2.0, 2.0);

    // Stars, on a grid in direction space so they stay put as the camera moves.
    vec3 g = d * 190.0;
    vec3 cell = floor(g);
    vec3 f = fract(g) - 0.5;
    float h = hash13(cell);
    if (h > 0.986) {
      float mag = (h - 0.986) / 0.014;
      float d2 = dot(f, f);
      float star = exp(-d2 * 34.0) * (0.25 + mag * 2.6);
      // A colour for it, mostly blue-white with a few warm ones.
      vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.66),
                      step(0.5, hash13(cell + 3.7)));
      col += tint * star;
    }
    return col;
  }

  /* ----------------------------------------------------------------- disc */

  /**
   * How brightly the disc shines at this radius, and how hot it is.
   *
   * Shakura–Sunyaev with the Novikov–Thorne inner boundary: the flux runs as
   * r^-3 with a factor that goes to zero at the innermost stable orbit, because
   * inside that there is nothing left to hold gas in a circle and it simply
   * falls. So the disc has an inner edge that is a physical consequence rather
   * than a number, and the brightest ring sits a little outside it.
   */
  float discTemp(float r) {
    float f = max(0.0, 1.0 - sqrt(R_ISCO / r));
    // T goes as (flux)^(1/4).
    return pow(f, 0.25) * pow(R_ISCO / r, 0.75);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - uCentre * uResolution) / uResolution.y;

    vec3 dir = normalize(
      uCamFwd + uCamRight * (uv.x * uTanHalfFov) + uCamUp * (uv.y * uTanHalfFov)
    );

    vec3 O = uCamPos;
    float r0 = length(O);

    /*
     * Into the orbital plane.
     *
     * A photon in a spherically symmetric field stays in the plane containing
     * the source and the centre, so the whole integration is two-dimensional.
     * e1 points at the camera, e2 is the transverse direction the ray is
     * heading — chosen that way round so φ always increases along the ray and
     * no case needs a sign flip.
     */
    vec3 e1 = O / r0;
    vec3 tang = dir - e1 * dot(dir, e1);
    float tl = length(tang);
    if (tl < 1e-5) {
      // Aimed exactly at the centre. It goes in.
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec3 e2 = tang / tl;

    float u = 1.0 / r0;
    float w = -dot(dir, e1) / (r0 * tl);

    // The azimuth is stepped by a fixed amount, so its sine and cosine can be
    // advanced by one rotation each step instead of being recomputed. Two
    // transcendentals a step across three hundred steps is most of the frame.
    float cd = cos(DPHI);
    float sd = sin(DPHI);
    float cp = 1.0;
    float sp = 0.0;

    vec3 pos = O;
    float prevY = O.y;
    vec3 prevPos = O;

    vec3 colour = vec3(0.0);
    bool done = false;

    for (int i = 0; i < STEPS; i++) {
      if (done) break;
      if (float(i) >= uSteps) break;

      // Velocity Verlet on  u'' = -u + 1.5 rs u².
      float acc = -u + 1.5 * RS * u * u;
      w += 0.5 * DPHI * acc;
      u += DPHI * w;
      float acc2 = -u + 1.5 * RS * u * u;
      w += 0.5 * DPHI * acc2;

      if (u <= 0.0) {
        // Escaped outward past the sky radius.
        vec3 t = (-w / (u * u)) * (cp * e1 + sp * e2)
               + (1.0 / max(u, 1e-6)) * (-sp * e1 + cp * e2);
        colour += sky(normalize(t));
        done = true;
        break;
      }

      float r = 1.0 / u;

      // Through the horizon. Nothing comes back.
      if (r <= RS * 1.001) {
        done = true;
        break;
      }

      // Advance the azimuth.
      float ncp = cp * cd - sp * sd;
      float nsp = sp * cd + cp * sd;
      cp = ncp;
      sp = nsp;

      prevPos = pos;
      prevY = pos.y;
      pos = r * (cp * e1 + sp * e2);

      /*
       * Did it cross the disc?
       *
       * The disc lies in the equatorial plane, so a crossing is a sign change
       * in y. Interpolating to the crossing rather than taking the step's end
       * point is what keeps the inner edge a clean circle instead of a
       * staircase — at this step size the ray moves a good fraction of a
       * Schwarzschild radius near the hole.
       */
      if (prevY * pos.y < 0.0) {
        float k = prevY / (prevY - pos.y);
        vec3 hit = mix(prevPos, pos, k);
        float rh = length(hit);

        if (rh > uDiscIn && rh < uDiscOut) {
          // The photon's direction here, from the tangent to the orbit.
          vec3 t = (-w / (u * u)) * (cp * e1 + sp * e2)
                 + r * (-sp * e1 + cp * e2);
          vec3 photon = normalize(t);

          /*
           * The shift.
           *
           * Two effects, and they multiply. Gravitational: light climbing out
           * of the well loses energy, by √(1 - rs/r). Doppler: the gas is on a
           * circular orbit at a large fraction of the speed of light, so the
           * side coming toward the camera is boosted and the side going away
           * is dimmed.
           *
           * Specific intensity divided by frequency cubed is invariant along a
           * ray, so what arrives goes as the fourth power of the shift once it
           * is integrated over frequency. Fourth power is why the approaching
           * side is not a little brighter but overwhelmingly brighter.
           */
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 vdir = normalize(cross(up, hit));
          float beta = sqrt(M / rh) / sqrt(max(1.0 - RS / rh, 1e-3));
          beta = min(beta, 0.96);
          float gamma = 1.0 / sqrt(1.0 - beta * beta);

          // Toward the observer is back along the ray.
          float mu = dot(vdir, -photon);
          float doppler = 1.0 / (gamma * (1.0 - beta * mu));
          float grav = sqrt(max(1.0 - RS / rh, 0.0));
          float g = grav * doppler;

          // Where on the disc, in the frame that is turning with it. Keplerian,
          // so the inside laps the outside and the noise shears into the
          // filaments a real disc has.
          float phi = atan(hit.z, hit.x);
          float omega = sqrt(M / (rh * rh * rh));
          float a = phi - omega * uTime * 7.0;
          vec3 q = vec3(cos(a), sin(a), 0.0) * rh;

          /*
           * The striations.
           *
           * Three scales of ridged noise, all sampled in the frame that is
           * turning with the gas. Because the angular rate falls as r^-3/2 the
           * inside laps the outside, so a feature that starts radial is wound
           * into a spiral within one orbit — the filaments in the picture are
           * differential rotation, not a texture of filaments.
           */
          float fine = fbm(q * 5.5 + vec3(0.0, 0.0, rh * 0.9), 5);
          float mid = fbm(q * 2.1 - vec3(2.0), 4);
          float coarse = fbm(q * 0.75 + vec3(7.0), 3);

          float band = 1.0 - abs(fine - 0.48) * 2.0;
          float band2 = 1.0 - abs(mid - 0.48) * 2.0;
          float texture =
            0.22 + 1.35 * pow(clamp(band, 0.0, 1.0), 1.6)
                 + 0.55 * pow(clamp(band2, 0.0, 1.0), 2.0)
                 + 0.35 * coarse;

          float temp = discTemp(rh);
          // Hot. The inner disc of a stellar-mass hole runs at tens of
          // thousands of kelvin, which is why the picture is blue-white rather
          // than the orange a cooler thing would be.
          float kelvin = 2600.0 + temp * 44000.0 * g;
          vec3 emit = blackbody(kelvin);

          float bright = temp * texture * pow(g, 4.0);
          colour += emit * bright * uExposure;
          done = true;
          break;
        }
      }

      // Far enough out, and heading away.
      if (r > R_SKY && w < 0.0) {
        vec3 t = (-w / (u * u)) * (cp * e1 + sp * e2)
               + r * (-sp * e1 + cp * e2);
        colour += sky(normalize(t));
        done = true;
        break;
      }
    }

    /*
     * Tone map.
     *
     * The disc spans about three orders of magnitude across the frame — the
     * approaching side is beamed by the fourth power of a Doppler factor near
     * two, the receding side is dimmed by the same power of a half. A curve
     * that compresses all of that into the top of the range throws away the
     * asymmetry, which is the most conspicuous real feature in the picture, and
     * the first version of this did exactly that: both sides came out the same
     * grey.
     *
     * So the highlights roll off late and the shoulder is soft. What clips is
     * only the innermost approaching edge, which in a real photograph clips
     * too.
     */
    colour = colour / (colour + vec3(1.25));
    colour *= 1.9;

    /*
     * Put the colour back.
     *
     * Any tone curve that divides by a per-channel value drags everything
     * toward grey as it compresses, because the channel that is largest is
     * compressed hardest. At these temperatures the disc is genuinely blue —
     * the blackbody ramp says so before the curve touches it — so the
     * saturation is restored afterwards rather than the curve being weakened,
     * which would blow the inner edge out instead.
     */
    float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    colour = mix(vec3(luma), colour, 1.45);

    colour = pow(clamp(colour, 0.0, 1.0), vec3(0.9));

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export type BlackHoleSceneProps = {
  /** 0..1 across the whole pinned section. */
  progressRef: React.RefObject<number>;
  /** Cursor over the section in -1..1, and whether there is one. */
  pointerRef: React.RefObject<{ x: number; y: number; on: number }>;
  /** False once the section has been scrolled past; stops the render loop. */
  running: boolean;
};

export default function BlackHoleScene({
  progressRef,
  pointerRef,
  running,
}: BlackHoleSceneProps) {
  return (
    <Canvas
      frameloop="never"
      /*
       * Capped low on purpose. Every pixel in here integrates a differential
       * equation three hundred times, so the cost is linear in pixels with a
       * very large constant — this is the one scene on the site where the
       * pixel ratio is a performance decision rather than a sharpness one.
       */
      dpr={[1, 1.25]}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Cadence running={running} />
      <Hole progressRef={progressRef} pointerRef={pointerRef} />
    </Canvas>
  );
}

function Hole({
  progressRef,
  pointerRef,
}: {
  progressRef: BlackHoleSceneProps["progressRef"];
  pointerRef: BlackHoleSceneProps["pointerRef"];
}) {
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const lean = useRef({ x: 0, y: 0 });
  const eased = useRef(0);
  const clock = useRef(0);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3(0, 1.2, 22) },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
      uTanHalfFov: { value: Math.tan((34 * Math.PI) / 360) },
      uCentre: { value: new THREE.Vector2(0.5, 0.5) },
      uDiscIn: { value: R_IN },
      uDiscOut: { value: R_OUT },
      uExposure: { value: 1.15 },
      uSteps: { value: 420 },
    }),
    [],
  );

  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame((_, delta) => {
    clock.current += delta;
    uniforms.uTime.value = clock.current;
    uniforms.uResolution.value.set(
      size.width * viewport.dpr,
      size.height * viewport.dpr,
    );

    const raw = Math.min(1, Math.max(0, progressRef.current ?? 0));
    eased.current += (raw - eased.current) * (1 - Math.exp(-5 * delta));
    const p = eased.current;

    const pointer = pointerRef.current;
    const settle = 1 - Math.exp(-3 * delta);
    lean.current.x += (pointer.x * pointer.on - lean.current.x) * settle;
    lean.current.y += (pointer.y * pointer.on - lean.current.y) * settle;

    /*
     * The shot.
     *
     * Scroll drifts the camera in and lifts it slowly off the disc plane; the
     * pointer swings it around and tips it. Height above the plane is the one
     * control that changes the picture completely — at zero the disc is a line
     * through the middle and the lensed images above and below are symmetric,
     * and a few degrees up is the shot everybody knows.
     */
    /*
     * Far enough out to see it.
     *
     * The disc is thirteen Schwarzschild radii across, so a camera twenty out
     * is not looking at a black hole, it is inside the accretion flow — which
     * is exactly what the first version did. Standing back fifty puts the whole
     * system in frame with room around it for the lensed arcs, which are the
     * part worth having.
     */
    /*
     * Stand further back in a narrow frame.
     *
     * The ray directions are normalised by the frame's *height*, so a portrait
     * window has a much smaller range of horizontal angle — and the same camera
     * distance that frames the hole nicely on a laptop has it spilling off both
     * sides of a phone with the copy sitting on top of it. Scaling the distance
     * by how narrow the frame is keeps the hole the same fraction of the width
     * whatever shape the window is.
     */
    const aspect = size.width / Math.max(1, size.height);
    const room = aspect < 1 ? Math.min(2.0, 0.78 / aspect) : 1;
    const distance = (66 - p * 14) * room;
    const height = 1.3 + p * 3.6 + lean.current.y * 2.6;
    const swing = -0.5 + p * 0.45 + lean.current.x * 0.55;

    // The copy owns the left of this section on anything wide enough to put
    // them side by side, so the hole is placed in the half that is empty.
    const wide = size.width >= 1024;
    uniforms.uCentre.value.set(wide ? 0.72 : 0.5, 0.5);
    uniforms.uSteps.value = wide ? 420 : 260;

    scratch.pos.set(
      Math.sin(swing) * distance,
      height,
      Math.cos(swing) * distance,
    );

    scratch.fwd.copy(scratch.pos).multiplyScalar(-1).normalize();
    scratch.right
      .crossVectors(scratch.fwd, scratch.worldUp)
      .normalize();
    scratch.up.crossVectors(scratch.right, scratch.fwd).normalize();

    uniforms.uCamPos.value.copy(scratch.pos);
    uniforms.uCamFwd.value.copy(scratch.fwd);
    uniforms.uCamRight.value.copy(scratch.right);
    uniforms.uCamUp.value.copy(scratch.up);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}
