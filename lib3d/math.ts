// ====================================================================
// MATHE-HELFER  (Port von lib-3d.ts)
// ====================================================================

import { Vec2, Vec3 } from "./vec";

/**
 * project projiziert einen 3D-Punkt (im Kamerakoordinatensystem) auf den
 * Bildschirm. Fuer 2D-Overlays gedacht.
 */
export function project(fov: number, v: Vec3): Vec2 {
  const s = fov / (fov + v.z);
  return new Vec2(v.x * s, v.y * s, s);
}

/** constrain begrenzt value auf den Bereich [lo, hi]. */
export function constrain(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** random liefert eine ganzzahlige Zufallszahl in [n1, n2). */
export function random(n1: number, n2: number): number {
  return Math.floor(randomFloat(0.0, 1.0) * (n2 - n1) + n1);
}

/** randomFloat liefert eine Gleitkomma-Zufallszahl in [lo, hi). */
export function randomFloat(lo: number, hi: number): number {
  return Math.random() * (hi - lo) + lo;
}
