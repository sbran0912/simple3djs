// ====================================================================
// MATRIZEN  (Port von lib-3d.ts: Matrix4x4)
//
// Matrix4x4 ist eine 4x4-Matrix in Zeilen-Darstellung (row-major), wie im
// TypeScript-Original number[][]. Fuer OpenGL/WebGL wird sie in ein flaches
// column-major-Array gewandelt (siehe FlattenMatrix im Renderer).
// ====================================================================

import { Vec3 } from "./vec";

export type Matrix4x4 = number[][];

/** translateMatrix erzeugt eine 4x4-Translationsmatrix. */
export function translateMatrix(dx: number, dy: number, dz: number): Matrix4x4 {
  return [
    [1, 0, 0, dx],
    [0, 1, 0, dy],
    [0, 0, 1, dz],
    [0, 0, 0, 1],
  ];
}

/** rotateMatrix erzeugt eine kombinierte 4x4-Rotationsmatrix (Rz * Ry * Rx). */
export function rotateMatrix(ax: number, ay: number, az: number): Matrix4x4 {
  const rx: Matrix4x4 = [
    [1, 0, 0, 0],
    [0, Math.cos(ax), -Math.sin(ax), 0],
    [0, Math.sin(ax), Math.cos(ax), 0],
    [0, 0, 0, 1],
  ];
  const ry: Matrix4x4 = [
    [Math.cos(ay), 0, Math.sin(ay), 0],
    [0, 1, 0, 0],
    [-Math.sin(ay), 0, Math.cos(ay), 0],
    [0, 0, 0, 1],
  ];
  const rz: Matrix4x4 = [
    [Math.cos(az), -Math.sin(az), 0, 0],
    [Math.sin(az), Math.cos(az), 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  return multMatrix(rz, multMatrix(ry, rx));
}

/** multMatrix multipliziert zwei 4x4-Matrizen (a * b). */
export function multMatrix(a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
  const result: Matrix4x4 = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

/** identityMatrix liefert die 4x4-Identitaetsmatrix. */
export function identityMatrix(): Matrix4x4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** viewWorldMatrix kombiniert View- und World-Matrix (view * world). */
export function viewWorldMatrix(view: Matrix4x4, world: Matrix4x4): Matrix4x4 {
  return multMatrix(view, world);
}

/**
 * lookAtMatrix erzeugt eine 4x4-View-Matrix. Die Kamera blickt in
 * +Z-Richtung (kompatibel mit perspectiveMatrix).
 */
export function lookAtMatrix(cameraPos: Vec3, target: Vec3, up: Vec3): Matrix4x4 {
  const forward = target.sub(cameraPos).normalize();
  const right = forward.cross(up).normalize();
  const realUp = right.cross(forward);

  return [
    [right.x, right.y, right.z, -right.dot(cameraPos)],
    [realUp.x, realUp.y, realUp.z, -realUp.dot(cameraPos)],
    [forward.x, forward.y, forward.z, -forward.dot(cameraPos)],
    [0, 0, 0, 1],
  ];
}

/** worldToCamera transformiert einen Weltpunkt in Kamerakoordinaten. */
export function worldToCamera(point: Vec3, view: Matrix4x4, world: Matrix4x4): Vec3 {
  return point.transform(multMatrix(view, world));
}

/** rotateAround rotiert einen Punkt um ein Pivot (Drehpunkt). */
export function rotateAround(point: Vec3, pivot: Vec3, rotation: Matrix4x4): Vec3 {
  const rel = point.sub(pivot);
  const rotated = rel.transform(rotation);
  return rotated.add(pivot);
}

/**
 * perspectiveMatrix erzeugt eine perspektivische Projektionsmatrix.
 * KONVENTION: Kamera blickt in +Z-Richtung.
 */
export function perspectiveMatrix(
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Matrix4x4 {
  const f = 1.0 / Math.tan(fovY / 2);
  return [
    [f / aspect, 0, 0, 0],
    [0, f, 0, 0],
    [0, 0, (far + near) / (far - near), (-2 * near * far) / (far - near)],
    [0, 0, 1, 0],
  ];
}
