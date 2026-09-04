"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Carries the star's light out of the canvas and onto the page.
 *
 * The name above the orbit is real text, not geometry — it has to be, for
 * selection, search, print, and the font's width axis. So it cannot be lit by
 * a renderer. What it gets instead is the direction to the star, written as
 * custom properties, which the stylesheet turns into a warm edge on the side
 * facing it. It reads the same star position the planets shade from, so when
 * the star leans with the pointer the terminators, the ring shadows, and the
 * light on the heading all turn together.
 *
 * It used to cast a projected shadow as well — a scaled copy of the heading,
 * geometrically correct. It came out looking wrong against the type, and it
 * was the most expensive thing on the page that was not a shader: a full-width
 * blurred layer the compositor had to re-rasterise every frame the star moved.
 * Removed on both counts.
 *
 * Element boxes are stored relative to the canvas rather than the viewport.
 * Both sit in the same section, so their offset never changes and the page can
 * be scrolled without a single layout read per frame.
 */

/** Longest the warm lit edge may reach, in pixels. */
const MAX_EDGE = 22;
/** Distance in pixels at which the star stops lighting anything. */
const FALLOFF = 1500;
/** How far the star has to move on screen before the type is repainted. */
const MIN_MOVE = 1.2;

type Target = {
  element: HTMLElement;
  x: number;
  y: number;
  /** `data-sunlit="0.5"` halves the effect for secondary text. */
  strength: number;
};

export function Sunlight({
  sunRef,
}: {
  sunRef: React.RefObject<THREE.Vector3>;
}) {
  const { camera, gl } = useThree();
  const projected = useMemo(() => new THREE.Vector3(), []);
  const targets = useRef<Target[]>([]);
  const canvas = useRef<{ width: number; height: number } | null>(null);
  const last = useRef({ x: NaN, y: NaN });

  useEffect(() => {
    const element = gl.domElement;

    const measure = () => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      canvas.current = { width: box.width, height: box.height };

      targets.current = Array.from(
        document.querySelectorAll<HTMLElement>("[data-sunlit]"),
      ).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          element: node,
          x: rect.left + rect.width / 2 - box.left,
          y: rect.top + rect.height / 2 - box.top,
          strength: Number(node.dataset.sunlit) || 1,
        };
      });
      last.current = { x: NaN, y: NaN };
    };

    measure();
    // The name's box changes when the real face lands.
    void document.fonts?.ready.then(measure);

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
      for (const target of targets.current) {
        target.element.style.removeProperty("--lx");
        target.element.style.removeProperty("--ly");
        target.element.style.removeProperty("--lit");
      }
    };
  }, [gl]);

  useFrame(() => {
    const box = canvas.current;
    const sun = sunRef.current;
    if (!box || !sun || targets.current.length === 0) return;

    projected.copy(sun).project(camera);
    const sx = ((projected.x + 1) / 2) * box.width;
    const sy = ((1 - projected.y) / 2) * box.height;

    // Not worth a style write. Each of these writes repaints a display-sized
    // heading carrying a fourteen-pixel blur, and the star drifts slowly
    // enough that a pixel of movement is well under what that blur can show.
    if (
      Math.abs(sx - last.current.x) < MIN_MOVE &&
      Math.abs(sy - last.current.y) < MIN_MOVE
    ) {
      return;
    }
    last.current = { x: sx, y: sy };

    for (const target of targets.current) {
      const dx = target.x - sx;
      const dy = target.y - sy;
      const distance = Math.hypot(dx, dy) || 1;

      // A point source, not a sun at infinity: the further a thing is from the
      // star, the less light reaches it.
      const edge = Math.min(MAX_EDGE, distance * 0.06) * target.strength;
      const lit = Math.max(0, 1 - distance / FALLOFF) ** 1.6 * target.strength;

      const style = target.element.style;
      style.setProperty("--lx", ((dx / distance) * edge).toFixed(2));
      style.setProperty("--ly", ((dy / distance) * edge).toFixed(2));
      style.setProperty("--lit", lit.toFixed(3));
    }
  });

  return null;
}
