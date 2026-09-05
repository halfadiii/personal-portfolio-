"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Shooting stars, across the sky behind the whole document.
 *
 * A pool of streaks that spend most of their lives waiting. Each one picks a
 * point in the sky, a direction to run and how long to take about it; runs;
 * then goes quiet again for anything upward of a quarter of a minute. Seven of
 * them with those gaps comes out at roughly one streak every four seconds
 * somewhere on the page — often enough to catch, rare enough that it never
 * becomes the thing you are looking at.
 *
 * ## They travel on an arc, not in a line
 *
 * The camera sits in the middle of the star shell looking out, so a meteor is
 * not crossing a plane in front of you: it is running over the inside of a
 * sphere. Its head is the start direction rotated toward a perpendicular by
 * however far it has gone, and its tail is the same rotation a little way
 * behind. Moving it along a straight line instead would take it off the shell,
 * and it would visibly shrink as it went.
 *
 * ## They are quads, not lines
 *
 * A line in WebGL is one pixel wide and nothing can be done about it —
 * `linewidth` is in the specification and ignored by every desktop driver. So
 * each streak is a quad stretched from head to tail and widened *in view
 * space*, which keeps its thickness on screen wherever it points and lets the
 * tail taper and fade rather than stopping dead.
 *
 * Reduced motion never gets here: the whole backdrop is gated on it upstream,
 * in `Sky`.
 */

/** How many streaks exist, waiting their turn. */
const METEORS = 7;

/** Deterministic, so the sky is the same sky on every load. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const METEOR_VERT = /* glsl */ `
  attribute vec3 aTail;
  attribute vec2 aCorner;
  attribute float aFade;
  attribute float aWidth;

  varying float vAlong;
  varying float vSide;
  varying float vFade;

  void main() {
    // The position attribute is the head; the quad runs back to the tail.
    vec3 world = mix(position, aTail, aCorner.x);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);

    // Widened across the direction of travel *as the camera sees it*, so a
    // streak keeps its thickness on screen however it is oriented in the sky.
    vec3 axis = (modelViewMatrix * vec4(position - aTail, 0.0)).xyz;
    float run = length(axis);
    vec3 dir = run > 1e-5 ? axis / run : vec3(1.0, 0.0, 0.0);
    vec3 side = cross(dir, vec3(0.0, 0.0, 1.0));
    float across = length(side);
    // Dead on to the camera, which has no sideways to speak of. Any
    // perpendicular will do, and none of it is visible anyway.
    side = across > 1e-5 ? side / across : vec3(0.0, 1.0, 0.0);

    mv.xyz += side * (aCorner.y * aWidth);
    gl_Position = projectionMatrix * mv;

    vAlong = aCorner.x;
    vSide = aCorner.y;
    vFade = aFade;
  }
`;

const METEOR_FRAG = /* glsl */ `
  /*
   * No precision qualifier here on purpose.
   *
   * Three injects one into both stages already. Declaring mediump in the
   * fragment while the vertex stage keeps the default highp makes the shared
   * varyings disagree, and that is a link error in GLSL ES rather than a
   * warning: the whole draw silently produces nothing, while every number
   * feeding it reads perfectly correct and you go looking elsewhere.
   */
  varying float vAlong;
  varying float vSide;
  varying float vFade;

  void main() {
    if (vFade <= 0.001) discard;

    float across = 1.0 - abs(vSide);
    // The tail thins as well as dims. Dimming alone leaves a bar with soft
    // ends, which is a light streak in a photograph and not a meteor.
    float taper = pow(max(1.0 - vAlong, 0.0), 1.5);
    float body = across * across * taper;
    float head = exp(-vAlong * 22.0) * exp(-vSide * vSide * 6.0);

    // Hot at the head and cooling down the trail, which is the way round the
    // real thing burns.
    vec3 colour = mix(vec3(0.68, 0.80, 1.00), vec3(1.00, 0.95, 0.88), taper);
    gl_FragColor = vec4(colour * (body * 0.55 + head * 1.15) * vFade, 1.0);
  }
`;

type Meteor = {
  /** Seconds before it runs again. Most of its life is spent here. */
  wait: number;
  /** 0 at the start of the streak, 1 at the end. */
  life: number;
  /** How long the streak takes, in seconds. */
  span: number;
  /** Where it starts, on the shell. */
  from: THREE.Vector3;
  /** The way it runs, perpendicular to `from` so the arc stays on the shell. */
  side: THREE.Vector3;
  /** How far it travels, and how long the trail is. Both angles. */
  arc: number;
  trail: number;
  width: number;
  bright: number;
};

export function ShootingStars({
  count = METEORS,
  radius = 34,
  seed = 20260904,
}: {
  count?: number;
  radius?: number;
  seed?: number;
}) {
  const built = useMemo(() => {
    const random = seeded(seed);

    const head = new Float32Array(count * 4 * 3);
    const tail = new Float32Array(count * 4 * 3);
    const corner = new Float32Array(count * 4 * 2);
    const fade = new Float32Array(count * 4);
    const width = new Float32Array(count * 4);
    const index = new Uint16Array(count * 6);

    for (let i = 0; i < count; i++) {
      const v = i * 4;
      // (along, side): the head edge, then the tail edge.
      corner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(head, 3));
    geometry.setAttribute("aTail", new THREE.BufferAttribute(tail, 3));
    geometry.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2));
    geometry.setAttribute("aFade", new THREE.BufferAttribute(fade, 1));
    geometry.setAttribute("aWidth", new THREE.BufferAttribute(width, 1));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));

    /*
     * Aimed into the cone the camera can see.
     *
     * Spread evenly over the whole sphere, five in six of these would streak
     * behind you. The cone is a little wider than the lens, so some still
     * enter and leave frame instead of every one starting politely inside it.
     */
    const CONE = Math.cos(1.02);

    const spawn = (m: Meteor) => {
      const ct = 1 - random() * (1 - CONE);
      const st = Math.sqrt(Math.max(0, 1 - ct * ct));
      const ph = random() * Math.PI * 2;
      m.from.set(st * Math.cos(ph), st * Math.sin(ph), -ct);

      // Any direction across the sky, made exactly perpendicular to `from`.
      m.side.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
      m.side.addScaledVector(m.from, -m.side.dot(m.from));
      if (m.side.lengthSq() < 1e-6) m.side.set(-m.from.y, m.from.x, 0);
      m.side.normalize();

      m.arc = 0.26 + random() * 0.26;
      m.trail = 0.07 + random() * 0.06;
      m.span = 0.7 + random() * 0.7;
      m.width = 0.11 + random() * 0.11;
      m.bright = 0.7 + random() * 0.45;
      m.life = 0;
    };

    const meteors: Meteor[] = [];
    for (let i = 0; i < count; i++) {
      const m: Meteor = {
        wait: 0,
        life: 0,
        span: 1,
        from: new THREE.Vector3(),
        side: new THREE.Vector3(),
        arc: 0.3,
        trail: 0.06,
        width: 0.12,
        bright: 1,
      };
      spawn(m);
      // Staggered, so they do not all arrive together on the first frame.
      m.wait = random() * 24 + i * 2.5;
      meteors.push(m);
    }

    return { geometry, meteors, spawn, head, tail, fade, width, random };
  }, [count, seed]);

  useEffect(() => () => built.geometry.dispose(), [built]);

  const scratch = useMemo(
    () => ({ head: new THREE.Vector3(), tail: new THREE.Vector3() }),
    [],
  );

  useFrame((_, delta) => {
    const { meteors, spawn, head, tail, fade, width, geometry, random } = built;
    let moved = false;

    for (let i = 0; i < meteors.length; i++) {
      const m = meteors[i];
      const v = i * 4;

      if (m.wait > 0) {
        m.wait -= delta;
        if (fade[v] !== 0) {
          for (let k = 0; k < 4; k++) fade[v + k] = 0;
          moved = true;
        }
        continue;
      }

      m.life += delta / m.span;
      if (m.life >= 1) {
        spawn(m);
        // Long enough that a streak stays an event rather than weather.
        m.wait = 14 + random() * 22;
        for (let k = 0; k < 4; k++) fade[v + k] = 0;
        moved = true;
        continue;
      }

      const gone = m.arc * m.life;
      const back = Math.max(0, gone - m.trail);
      scratch.head
        .copy(m.from)
        .multiplyScalar(Math.cos(gone))
        .addScaledVector(m.side, Math.sin(gone))
        .multiplyScalar(radius);
      scratch.tail
        .copy(m.from)
        .multiplyScalar(Math.cos(back))
        .addScaledVector(m.side, Math.sin(back))
        .multiplyScalar(radius);

      // In fast and out slow: it arrives as a flash and leaves as a fade.
      const on = Math.min(1, m.life / 0.1);
      const off = 1 - Math.max(0, (m.life - 0.62) / 0.38);
      const lit = m.bright * on * off * off;

      for (let k = 0; k < 4; k++) {
        const p = (v + k) * 3;
        head[p] = scratch.head.x;
        head[p + 1] = scratch.head.y;
        head[p + 2] = scratch.head.z;
        tail[p] = scratch.tail.x;
        tail[p + 1] = scratch.tail.y;
        tail[p + 2] = scratch.tail.z;
        fade[v + k] = lit;
        width[v + k] = m.width;
      }
      moved = true;
    }

    if (moved) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aTail.needsUpdate = true;
      geometry.attributes.aFade.needsUpdate = true;
      geometry.attributes.aWidth.needsUpdate = true;
    }
  });

  return (
    <mesh geometry={built.geometry} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        vertexShader={METEOR_VERT}
        fragmentShader={METEOR_FRAG}
        transparent
        depthWrite={false}
        depthTest={false}
        /*
         * Both faces, because these quads have no fixed handedness.
         *
         * The strip is built from a head and a tail that move over a sphere,
         * so which way round its two triangles wind depends on where the
         * meteor happens to be and which way it is going. Front-face culling
         * threw away whichever half came out clockwise — and since a streak
         * keeps one orientation for its whole life, that meant it was either
         * fully visible or not visible at all, with no partial case to hint at
         * what was wrong.
         */
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
