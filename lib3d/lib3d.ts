// ====================================================================
// UMBRELLA-MODUL: bindet die komplette oeffentliche lib3d-API ein.
//
// Bewusst eine explizite Liste (statt export *) - so bleiben die internen
// Batch-Helfer aus renderer_internal.ts aussen vor.
// ====================================================================

// Vektoren
export { Vec2, Vec3 } from "./vec";

// Matrizen
export type { Matrix4x4 } from "./mat4";
export {
  identityMatrix,
  lookAtMatrix,
  multMatrix,
  perspectiveMatrix,
  rotateAround,
  rotateMatrix,
  translateMatrix,
  viewWorldMatrix,
  worldToCamera,
} from "./mat4";

// Mathe-Helfer
export { constrain, project, random, randomFloat } from "./math";

// Farben
export type { ColorInput, ColorState } from "./color";
export { colEq, parseColor, parseHex, rgb } from "./color";

// Meshes
export type { Mesh } from "./mesh";
export { makeCubeMesh, makePyramidMesh, makeSphereMesh } from "./mesh";

// Renderer (Setup, Zustand, 3D-Primitive)
export type { Fog, Instance, Scene } from "./renderer";
export { DrawStyle, EffectMode } from "./renderer";
export {
  applyCamera,
  background,
  beginScene,
  Camera,
  circle,
  compactBatch,
  fillColor,
  getHeight,
  getPendingDrawCalls,
  getPendingInstancedDrawCalls,
  getWidth,
  init,
  isMouseDown,
  isMouseUp,
  line,
  makeScene,
  noLoop,
  point,
  pointSize,
  polygon,
  rect,
  setBatchSort,
  setEffect,
  setFog,
  setGradient,
  setGradientCenter,
  setLightDirection,
  setProjection,
  setView,
  shape,
  startAnimation,
  strokeColor,
  strokeWidth,
  triangle,
} from "./renderer";

// Zeichen-Fassade
export type { PrimitiveStyle, ShapeStyle } from "./draw";
export {
  drawCircle,
  drawLine,
  drawMesh,
  drawMeshInstanced,
  drawPoint,
  drawPolygon,
  drawRect,
  drawShape,
  drawTriangle,
} from "./draw";
