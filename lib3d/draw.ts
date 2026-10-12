// ====================================================================
// ZEICHEN-FASSADE  (Port von lib-render.ts)
//
// Fassade fuer das Zeichnen. Die Szene ruft ausschliesslich die draw*()-
// Funktionen auf; Farbe/Linienbreite/Punktgroesse kommen als Options-Objekt
// mit (nicht gesetzte Felder ueberschreiben den Zustand nicht).
// ====================================================================

import { type ColorInput } from "./color";
import { identityMatrix, type Matrix4x4 } from "./mat4";
import { type Mesh } from "./mesh";
import {
  circle,
  DrawStyle,
  type Instance,
  line,
  point,
  polygon,
  rect,
  shape,
  strokeColor,
  strokeWidth,
  fillColor,
  pointSize as setPointSize,
  triangle,
} from "./renderer";
import { submitInstanced, submitLines, submitTriangles } from "./renderer_internal";

/**
 * PrimitiveStyle sind Zeichen-Optionen. Nicht gesetzte Felder (undefined)
 * ueberschreiben den aktuellen Low-Level-Zustand nicht.
 */
export interface PrimitiveStyle {
  stroke?: ColorInput; // Linienfarbe (unbeleuchtet)
  fill?: ColorInput; // Fuellfarbe  (beleuchtet)
  lineWidth?: number;
  pointSize?: number;
}

/** ShapeStyle erweitert PrimitiveStyle um den Zeichenmodus. */
export interface ShapeStyle extends PrimitiveStyle {
  mode?: DrawStyle;
  z?: number;
  segments?: number;
}

/** applyStyle uebernimmt die gesetzten Felder in den Low-Level-Zeichenzustand. */
function applyStyle(
  stroke: ColorInput | undefined,
  fill: ColorInput | undefined,
  lineWidth: number | undefined,
  pointSize: number | undefined,
): void {
  if (stroke !== undefined) {
    strokeColor(stroke);
  }
  if (fill !== undefined) {
    fillColor(fill);
  }
  if (lineWidth !== undefined && lineWidth !== 0) {
    strokeWidth(lineWidth);
  }
  if (pointSize !== undefined && pointSize !== 0) {
    setPointSize(pointSize);
  }
}

// ====================================================================
// MESHES
// ====================================================================

/**
 * drawMesh zeichnet ein Mesh in lokalen Koordinaten und wendet dabei die
 * uebergebene Modell-Matrix an (Default: Identity). Fill beleuchtet, Lines
 * als Drahtgitter.
 */
export function drawMesh(
  mesh: Mesh,
  style: ShapeStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  const mode = style.mode ?? DrawStyle.Stroke;
  if (mode === DrawStyle.Fill || mode === DrawStyle.Both) {
    submitTriangles(mesh.triangles, model);
  }
  if (mode === DrawStyle.Stroke || mode === DrawStyle.Both) {
    submitLines(mesh.lines, model);
  }
}

// ====================================================================
// GPU-INSTANCING
// ====================================================================

/**
 * drawMeshInstanced zeichnet dieselbe Geometrie mehrfach in einem Draw-Call.
 * Jede Instance bringt ihre eigene Modell-Matrix und Farbe mit; style
 * bestimmt Fill/Stroke und die Linienbreite. (Farbe aus style wird ignoriert.)
 */
export function drawMeshInstanced(
  mesh: Mesh,
  style: ShapeStyle,
  instances: Instance[],
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  const mode = style.mode ?? DrawStyle.Stroke;
  submitInstanced(mesh.triangles, mesh.lines, mode, instances);
}

// ====================================================================
// IMMEDIATE-PRIMITIVES
// ====================================================================

export function drawPoint(
  x: number, y: number, z: number,
  style: PrimitiveStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  point(x, y, z, model);
}

export function drawLine(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  style: PrimitiveStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  line(x1, y1, z1, x2, y2, z2, model);
}

export function drawTriangle(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  style: ShapeStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  triangle(x1, y1, z1, x2, y2, z2, x3, y3, z3, style.mode ?? DrawStyle.Stroke, model);
}

export function drawShape(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  x4: number, y4: number, z4: number,
  style: ShapeStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  shape(
    x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4,
    style.mode ?? DrawStyle.Stroke,
    model,
  );
}

export function drawRect(
  x: number, y: number, w: number, h: number,
  style: ShapeStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  rect(x, y, w, h, style.mode ?? DrawStyle.Stroke, style.z ?? 0, model);
}

export function drawCircle(
  x: number, y: number, z: number, radius: number,
  style: ShapeStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  const segments = style.segments && style.segments !== 0 ? style.segments : 64;
  circle(x, y, z, radius, style.mode ?? DrawStyle.Stroke, segments, model);
}

export function drawPolygon(
  pts: number[],
  style: ShapeStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  applyStyle(style.stroke, style.fill, style.lineWidth, style.pointSize);
  polygon(pts, style.mode ?? DrawStyle.Stroke, model);
}
