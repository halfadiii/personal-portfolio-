"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The star at the centre of the system.
 *
 * There is no sphere here and no edge anywhere in it. A star at this distance
 * is a bloom, not a disc with a rim: three exponentials at different rates,
 * every one of them decaying to zero well before it reaches the edge of the
 * quad it is drawn on, which is what stops a circle from appearing.
 *
 * There is also no `pointLight`. Nothing in this scene uses a material that a
 * three.js light would reach: the planets, their rings, and the nebula all
 * shade themselves from `positionRef`, which is where this star actually is in
 * world space. That is the whole point — the light is only ever visible where
 * it lands on something.
 */

/**
 * How far across the bloom is drawn, in world units. It was much wider while
 * the heading cast a shadow that needed a surface to fall on; with that gone
 * the quad can shrink, and a quad this size is a large share of the screen, so
 * the pixels it stops touching are the cheapest performance there is.
 */
const SPAN = 7.6;

/**
 * How far the star slides with the pointer, in world units. Barely anything —
 * about a tenth of a unit against an orbit radius of 3.45, so roughly a degree
 * and a half of swing on a terminator. It reads because the shadow it throws on
 * the name is long, and a long shadow multiplies a small change in angle.
 */
const SWAY = { x: 0.11, y: 0.084, z: 0.044 };

export function Sun({
  positionRef,
  pointerRef,
}: {
  /** Written every frame in world space, for everything the light touches. */
  positionRef: React.RefObject<THREE.Vector3>;
  /** -1..1 across the canvas. The star leans with it, and so do the shadows. */
  pointerRef: React.RefObject<THREE.Vector2>;
}) {
  const group = useRef<THREE.Group>(null);
  const billboard = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const parentRotation = useMemo(() => new THREE.Quaternion(), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      // Half the quad, so the shader can size the star in world units and be
      // compared directly against a planet radius.
      uReach: { value: SPAN * 0.5 },
      uHot: { value: new THREE.Color("#fff6e2") },
      uWarm: { value: new THREE.Color("#ff9d3c") },
      uDeep: { value: new THREE.Color("#ff5a12") },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (material.current) material.current.uniforms.uTime.value += delta;

    if (group.current) {
      // Leaning the star rather than the whole system is what makes the
      // shadows turn: move everything together and no angle would change.
      const pointer = pointerRef.current;
      const ease = 1 - Math.exp(-2.2 * delta);
      const node = group.current;
      node.position.x += (pointer.x * SWAY.x - node.position.x) * ease;
      node.position.y += (pointer.y * SWAY.y - node.position.y) * ease;
      node.position.z += (-pointer.y * SWAY.z - node.position.z) * ease;
      node.getWorldPosition(positionRef.current);
    }
    // The corona always faces the camera; it has no geometry of its own to
    // see. `quaternion` is local, and this group is tilted with the orbit
    // plane, so the parent's rotation has to be taken back out first.
    if (billboard.current && group.current) {
      group.current.getWorldQuaternion(parentRotation).invert();
      billboard.current.quaternion
        .copy(parentRotation)
        .multiply(state.camera.quaternion);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={billboard}>
        <planeGeometry args={[SPAN, SPAN]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={CORONA_VERT}
          fragmentShader={CORONA_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

const CORONA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORONA_FRAG = /* glsl */ `
  varying vec2 vUv;

  uniform float uTime;
  uniform float uReach;
  uniform vec3  uHot;
  uniform vec3  uWarm;
  uniform vec3  uDeep;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    if (d > 1.0) discard;

    // No rays. Three exponentials at different rates: a white throat, the
    // body of the star, and the far bloom. Nothing here has a frequency, so
    // nothing streaks — and it costs three exponentials a pixel rather than
    // three powers of a sine on top of them.
    //
    // The scales are world units, which is the only way to size this against
    // anything else. The largest planet has a radius of 0.3, so a BODY of 0.7
    // puts the star at roughly three times the width of the biggest thing
    // orbiting it — which is the point of a star.
    float rw = d * uReach;

    const float THROAT = 0.30;
    const float BODY = 0.86;
    const float BLOOM = 2.05;

    float core = exp(-rw / THROAT);
    float body = exp(-rw / BODY) * 0.62;
    float bloom = exp(-rw / BLOOM) * 0.13;

    // A slow breath, small enough to read as heat rather than as a pulse.
    float breath = 1.0 + 0.05 * sin(uTime * 0.55);

    float glow = (core * 0.9 + body + bloom) * breath;

    // Nothing may survive to the edge of the quad, or the quad becomes a disc.
    glow *= 1.0 - smoothstep(0.62, 1.0, d);

    vec3 colour = mix(uHot, uWarm, smoothstep(0.0, 0.72, rw));
    colour = mix(colour, uDeep, smoothstep(0.6, 2.1, rw));

    gl_FragColor = vec4(colour, clamp(glow, 0.0, 1.0));
  }
`;
