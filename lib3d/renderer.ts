// =================================================================
// RENDERER - Setup, Zustand, 3D-Primitive  (Port von lib-wgl.ts)
//
// Koordinatensystem: +Y zeigt nach oben, Kamera blickt in +Z.
// View/Projection laufen im Vertex-Shader; die Modell-Matrix wird beim
// Sammeln in die Vertices gebacken und pro Zeichenaufruf uebergeben.
//
// Architektur wie im C++-Original: Alle Zeichenaufrufe sammeln in eine
// Batch (kein GL-Zugriff); erst FlushBatch() schickt sie an die GPU. Dadurch
// sind die Sammel-Funktionen auch ohne WebGL-Kontext (Tests) nutzbar.
// =================================================================

import { colEq, parseColor, type ColorInput, type ColorState } from "./color";
import {
  type GL,
  GL_LINES,
  GL_LINE_LOOP,
  GL_POINTS,
  GL_TRIANGLES,
} from "./gl";
import {
  identityMatrix,
  lookAtMatrix,
  perspectiveMatrix,
  type Matrix4x4,
} from "./mat4";
import { createProgram, kFragSrc, kVertSrc } from "./shader";
import { Vec3 } from "./vec";

// ---- Oeffentliche Typen ----

/** DrawStyle: 0 = stroke | 1 = fill | 2 = beide. */
export enum DrawStyle {
  Stroke = 0,
  Fill = 1,
  Both = 2,
}

/** EffectMode ist der aktive Shader-Effekt. */
export enum EffectMode {
  Flat = 0,
  Gradient = 1,
  Pulse = 2,
}

/**
 * Key ist eine Auswahl haeufiger Tasten. Die Werte sind DOM-Codes aus
 * KeyboardEvent.code (layout-unabhaengig = physische Taste). isKeyDown/
 * isKeyPressed nehmen jeden code-String an; die Enum ist reine Bequemlichkeit.
 */
export enum Key {
  Space = "Space",
  Escape = "Escape",
  Enter = "Enter",
  Tab = "Tab",
  Backspace = "Backspace",
  Insert = "Insert",
  Delete = "Delete",
  ArrowLeft = "ArrowLeft",
  ArrowRight = "ArrowRight",
  ArrowUp = "ArrowUp",
  ArrowDown = "ArrowDown",
  PageUp = "PageUp",
  PageDown = "PageDown",
  Home = "Home",
  End = "End",
  CapsLock = "CapsLock",
  Minus = "Minus",
  Equal = "Equal",
  BracketLeft = "BracketLeft",
  BracketRight = "BracketRight",
  Backslash = "Backslash",
  Semicolon = "Semicolon",
  Quote = "Quote",
  Backquote = "Backquote",
  Comma = "Comma",
  Period = "Period",
  Slash = "Slash",
  Digit0 = "Digit0", Digit1 = "Digit1", Digit2 = "Digit2", Digit3 = "Digit3",
  Digit4 = "Digit4", Digit5 = "Digit5", Digit6 = "Digit6", Digit7 = "Digit7",
  Digit8 = "Digit8", Digit9 = "Digit9",
  A = "KeyA", B = "KeyB", C = "KeyC", D = "KeyD", E = "KeyE", F = "KeyF",
  G = "KeyG", H = "KeyH", I = "KeyI", J = "KeyJ", K = "KeyK", L = "KeyL",
  M = "KeyM", N = "KeyN", O = "KeyO", P = "KeyP", Q = "KeyQ", R = "KeyR",
  S = "KeyS", T = "KeyT", U = "KeyU", V = "KeyV", W = "KeyW", X = "KeyX",
  Y = "KeyY", Z = "KeyZ",
  F1 = "F1", F2 = "F2", F3 = "F3", F4 = "F4", F5 = "F5", F6 = "F6",
  F7 = "F7", F8 = "F8", F9 = "F9", F10 = "F10", F11 = "F11", F12 = "F12",
  ShiftLeft = "ShiftLeft",
  ShiftRight = "ShiftRight",
  ControlLeft = "ControlLeft",
  ControlRight = "ControlRight",
  AltLeft = "AltLeft",
  AltRight = "AltRight",
  MetaLeft = "MetaLeft",
  MetaRight = "MetaRight",
}

/**
 * Instance beschreibt eine Instanz fuer das GPU-Instancing: eine Modell-Matrix
 * (row-major, wie Matrix4x4) und eine Farbe.
 */
export interface Instance {
  model: Matrix4x4;
  color: ColorState;
}

// =================================================================
// INTERNER ZUSTAND
// =================================================================

/** DrawState ist der aktuelle Zeichenzustand (kein Stack). */
interface DrawState {
  fill: ColorState;
  stroke: ColorState;
  lineWidth: number;
  effect: EffectMode;
  grad2: ColorState;
}

/** DrawCmd ist ein gesammelter Zeichenbefehl fuer eine Immediate-Primitive. */
interface DrawCmd {
  mode: number; // GL-Modus (GL_POINTS/LINES/TRIANGLES/LINE_LOOP)
  first: number; // Start-Index in batchVerts (Vertex-Nummer)
  count: number; // Anzahl Vertices
  col: ColorState;
  effect: EffectMode;
  grad2: ColorState;
  pointSize: number;
  lineW: number;
  center: number[];
  radius: number;
  view: number[];
  proj: number[];
  lit: number; // 1 = gefuellte Flaeche -> beleuchten
}

/**
 * InstCmd ist ein gesammelter GPU-Instancing-Zeichenbefehl. first/count zeigen
 * auf die Basis-Geometrie (instGeom), instFirst/instCount auf die Instanzen
 * (instData).
 */
interface InstCmd {
  mode: number;
  first: number;
  count: number;
  instFirst: number;
  instCount: number;
  effect: EffectMode;
  grad2: ColorState;
  pointSize: number;
  lineW: number;
  center: number[];
  radius: number;
  view: number[];
  proj: number[];
  lit: number;
}

// Fenster / GL
let gl: GL | null = null;
let canvas: HTMLCanvasElement | null = null;
let prog: WebGLProgram | null = null;
let vao: WebGLVertexArrayObject | null = null;
let vbo: WebGLBuffer | null = null;
let vboGeom: WebGLBuffer | null = null; // Basis-Geometrie der Instanzen
let vboInst: WebGLBuffer | null = null; // Instanz-Daten (Modell-Matrix + Farbe)

let frameW = 0;
let frameH = 0;

// Shader-Locations
let locPos = -1;
let locColorAttr = -1;
let locInstModel = -1; // belegt 4 aufeinanderfolgende Locations
let locInstColor = -1;
let locInstanced: WebGLUniformLocation | null = null;
let locView: WebGLUniformLocation | null = null;
let locProjection: WebGLUniformLocation | null = null;
let locPointSize: WebGLUniformLocation | null = null;
let locMode: WebGLUniformLocation | null = null;
let locColor: WebGLUniformLocation | null = null;
let locColor2: WebGLUniformLocation | null = null;
let locTime: WebGLUniformLocation | null = null;
let locCenter: WebGLUniformLocation | null = null;
let locRadius: WebGLUniformLocation | null = null;
let locFogNear: WebGLUniformLocation | null = null;
let locFogFar: WebGLUniformLocation | null = null;
let locFogColor: WebGLUniformLocation | null = null;
let locLighted: WebGLUniformLocation | null = null;
let locLightDir: WebGLUniformLocation | null = null;

// Animation
let looping = true;
let startTime = 0;

// Maus
let mouseX = 0;
let mouseY = 0;
let mouseStatus = 0;

// Tastatur: gedrueckte Tasten (keysDown) und einmalig konsumierte Druckkanten
// (keysPressed). Schluessel ist der KeyboardEvent.code.
const keysDown = new Set<string>();
const keysPressed = new Set<string>();

// Aktueller Zeichenzustand.
let state: DrawState = {
  fill: { r: 1, g: 1, b: 1, a: 1 },
  stroke: { r: 0, g: 0, b: 0, a: 1 },
  lineWidth: 1,
  effect: EffectMode.Flat,
  grad2: { r: 0, g: 0, b: 0, a: 1 },
};

// Batching: batchVerts ist interleaved (x,y,z,r,g,b,a = 7 floats/Vertex).
let batchVerts: number[] = [];
let batchCmds: DrawCmd[] = [];
let batchCap = 0; // aktuell allozierte Byte-Groesse des VBO

// Optionale Sortierung/Umpacken der Batch (siehe setBatchSort).
let batchSort = false;

// Instancing: eigene Puffer fuer Basis-Geometrie und Instanz-Daten.
let instGeom: number[] = []; // interleaved xyz+rgba (7 floats/Vertex)
let instData: number[] = []; // 16 (Modell, column-major) + 4 (Farbe) = 20 floats/Instanz
let instCmds: InstCmd[] = [];
let geomCap = 0;
let instCap = 0;

// Zuletzt gesetzte Uniform-Werte (fuer den Batch-Snapshot pro Befehl).
let viewUniform: number[] = identity16();
let projUniform: number[] = identity16();
let pointSizeVal = 4.0;
let gradCenter: number[] = [0, 0, 0];
let gradRadius = 1.0;

// =================================================================
// HILFSFUNKTIONEN (intern)
// =================================================================

/** identity16 liefert die Einheitsmatrix als flaches column-major-Array. */
function identity16(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * flattenMatrix wandelt eine row-major Matrix4x4 in ein column-major
 * Float-Array fuer WebGL.
 */
function flattenMatrix(m: Matrix4x4): number[] {
  return [
    m[0][0], m[1][0], m[2][0], m[3][0],
    m[0][1], m[1][1], m[2][1], m[3][1],
    m[0][2], m[1][2], m[2][2], m[3][2],
    m[0][3], m[1][3], m[2][3], m[3][3],
  ];
}

function effectToMode(effect: EffectMode): number {
  switch (effect) {
    case EffectMode.Gradient:
      return 1;
    case EffectMode.Pulse:
      return 2;
    default:
      return 0;
  }
}

function arrEq(a: number[], b: number[]): boolean {
  for (let i = 0; i < 16; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * canMerge prueft, ob zwei aufeinanderfolgende Befehle identischen Zustand
 * haben und zu einem DrawArrays-Aufruf zusammengefasst werden koennen.
 * LINE_LOOP wird nie zusammengefasst, weil ein Loop sich selbst schliesst.
 */
function canMerge(a: DrawCmd, b: DrawCmd): boolean {
  return (
    a.mode === b.mode &&
    a.mode !== GL_LINE_LOOP &&
    colEq(a.col, b.col) &&
    a.effect === b.effect &&
    colEq(a.grad2, b.grad2) &&
    a.pointSize === b.pointSize &&
    a.lineW === b.lineW &&
    a.center[0] === b.center[0] &&
    a.center[1] === b.center[1] &&
    a.center[2] === b.center[2] &&
    a.radius === b.radius &&
    arrEq(a.view, b.view) &&
    arrEq(a.proj, b.proj) &&
    a.lit === b.lit
  );
}

/** cmdKeyLess ist eine Sortier-Ordnung ueber den Zustand eines Kommandos. */
function cmdKeyLess(a: DrawCmd, b: DrawCmd): boolean {
  if (a.mode !== b.mode) return a.mode < b.mode;
  if (a.lit !== b.lit) return a.lit < b.lit;
  if (a.effect !== b.effect) return a.effect < b.effect;
  if (a.lineW !== b.lineW) return a.lineW < b.lineW;
  if (a.pointSize !== b.pointSize) return a.pointSize < b.pointSize;
  if (a.radius !== b.radius) return a.radius < b.radius;
  if (a.center[0] !== b.center[0]) return a.center[0] < b.center[0];
  if (a.center[1] !== b.center[1]) return a.center[1] < b.center[1];
  if (a.center[2] !== b.center[2]) return a.center[2] < b.center[2];
  if (a.col.r !== b.col.r) return a.col.r < b.col.r;
  if (a.col.g !== b.col.g) return a.col.g < b.col.g;
  if (a.col.b !== b.col.b) return a.col.b < b.col.b;
  if (a.col.a !== b.col.a) return a.col.a < b.col.a;
  if (a.grad2.r !== b.grad2.r) return a.grad2.r < b.grad2.r;
  if (a.grad2.g !== b.grad2.g) return a.grad2.g < b.grad2.g;
  if (a.grad2.b !== b.grad2.b) return a.grad2.b < b.grad2.b;
  if (a.grad2.a !== b.grad2.a) return a.grad2.a < b.grad2.a;
  return false;
}

/**
 * mergeBlock haengt den Vertex-Block von src an dst an und legt (bei gleichem
 * Zustand wie der letzte Befehl) die Kommandos zusammen.
 */
function mergeBlock(
  dstData: number[],
  dstCmds: DrawCmd[],
  src: DrawCmd,
  srcData: number[],
): void {
  const c: DrawCmd = { ...src, center: src.center.slice(), view: src.view.slice(), proj: src.proj.slice() };
  const begin = c.first * 7;
  const end = begin + c.count * 7;
  c.first = dstData.length / 7;
  for (let i = begin; i < end; i++) {
    dstData.push(srcData[i]);
  }
  if (dstCmds.length > 0 && canMerge(dstCmds[dstCmds.length - 1], c)) {
    dstCmds[dstCmds.length - 1].count += c.count;
  } else {
    dstCmds.push(c);
  }
}

// =================================================================
// BATCHING - SAMMELN & ZEICHNEN (Kern des Renderers)
// =================================================================

/**
 * submit sammelt eine Immediate-Primitive im Frame-Batch. Es wird noch nichts
 * an die GPU geschickt; das passiert erst beim flushBatch(). Die Modell-Matrix
 * wird hier in die Vertices gebacken und die Farbe pro Vertex abgelegt.
 */
function submit(
  mode: number,
  verts: number[],
  useStroke: boolean,
  model: Matrix4x4,
): void {
  const col = useStroke ? state.stroke : state.fill;
  const lit = useStroke ? 0 : 1; // gefuellte Flaechen werden beleuchtet
  const flat = state.effect === EffectMode.Flat;

  // Flache Primitive tragen ihre Farbe pro Vertex (uColor bleibt weiss);
  // Gradient/Pulse nutzen uColor (Vertex-Farbe bleibt weiss).
  const vertexCol = flat ? col : { r: 1, g: 1, b: 1, a: 1 };
  const uniformCol = flat ? { r: 1, g: 1, b: 1, a: 1 } : col;

  const cmd: DrawCmd = {
    mode,
    first: batchVerts.length / 7,
    count: verts.length / 3,
    col: uniformCol,
    effect: state.effect,
    grad2: state.grad2,
    pointSize: pointSizeVal,
    lineW: state.lineWidth,
    center: gradCenter.slice(),
    radius: gradRadius,
    view: viewUniform.slice(),
    proj: projUniform.slice(),
    lit,
  };

  // Vertices mit der Modell-Matrix backen und mit Farbe interleaven.
  const m = model;
  const n = verts.length / 3;
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3 + 0];
    const y = verts[i * 3 + 1];
    const z = verts[i * 3 + 2];
    batchVerts.push(m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3]);
    batchVerts.push(m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3]);
    batchVerts.push(m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3]);
    batchVerts.push(vertexCol.r);
    batchVerts.push(vertexCol.g);
    batchVerts.push(vertexCol.b);
    batchVerts.push(vertexCol.a);
  }

  // Aufeinanderfolgende Befehle mit identischem Zustand zusammenfassen.
  if (batchCmds.length > 0 && canMerge(batchCmds[batchCmds.length - 1], cmd)) {
    batchCmds[batchCmds.length - 1].count += cmd.count;
    return;
  }
  batchCmds.push(cmd);
}

/**
 * flushInstanced zeichnet alle gesammelten Instancing-Auftraege. Basis-
 * Geometrie und Instanz-Daten liegen in eigenen, wiederverwendeten VBOs.
 */
function flushInstanced(g: GL): void {
  if (instCmds.length === 0) {
    return;
  }

  g.bindVertexArray(vao);

  // Basis-Geometrie hochladen.
  g.bindBuffer(g.ARRAY_BUFFER, vboGeom);
  const geomBytes = instGeom.length * 4;
  if (geomBytes > geomCap) {
    g.bufferData(g.ARRAY_BUFFER, new Float32Array(instGeom), g.DYNAMIC_DRAW);
    geomCap = geomBytes;
  } else {
    g.bufferSubData(g.ARRAY_BUFFER, 0, new Float32Array(instGeom));
  }
  const gStride = 7 * 4;
  g.enableVertexAttribArray(locPos);
  g.enableVertexAttribArray(locColorAttr);
  g.vertexAttribPointer(locPos, 3, g.FLOAT, false, gStride, 0);
  g.vertexAttribPointer(locColorAttr, 4, g.FLOAT, false, gStride, 3 * 4);
  g.vertexAttribDivisor(locPos, 0);
  g.vertexAttribDivisor(locColorAttr, 0);

  // Instanz-Daten hochladen (20 floats/Instanz).
  g.bindBuffer(g.ARRAY_BUFFER, vboInst);
  const instBytes = instData.length * 4;
  if (instBytes > instCap) {
    g.bufferData(g.ARRAY_BUFFER, new Float32Array(instData), g.DYNAMIC_DRAW);
    instCap = instBytes;
  } else {
    g.bufferSubData(g.ARRAY_BUFFER, 0, new Float32Array(instData));
  }
  const iStride = 20 * 4;
  for (let k = 0; k < 4; k++) {
    const loc = locInstModel + k;
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 4, g.FLOAT, false, iStride, k * 4 * 4);
    g.vertexAttribDivisor(loc, 1);
  }
  g.enableVertexAttribArray(locInstColor);
  g.vertexAttribPointer(locInstColor, 4, g.FLOAT, false, iStride, 16 * 4);
  g.vertexAttribDivisor(locInstColor, 1);

  g.uniform1i(locInstanced, 1);
  g.uniform4f(locColor, 1, 1, 1, 1);
  for (const c of instCmds) {
    g.uniformMatrix4fv(locView, false, c.view);
    g.uniformMatrix4fv(locProjection, false, c.proj);
    g.uniform1i(locMode, effectToMode(c.effect));
    g.uniform1i(locLighted, c.lit);
    g.uniform4f(locColor2, c.grad2.r, c.grad2.g, c.grad2.b, c.grad2.a);
    g.uniform1f(locPointSize, c.pointSize);
    g.uniform3f(locCenter, c.center[0], c.center[1], c.center[2]);
    g.uniform1f(locRadius, c.radius);
    // WebGL kennt nur Linienbreite 1.0 (dickere erzeugen einen GL-Fehler);
    // der Zustand bleibt fuer das Batching dennoch erhalten.
    if (c.lineW === 1) {
      g.lineWidth(1);
    }
    g.drawArraysInstanced(c.mode, c.first, c.count, c.instCount);
  }
  g.uniform1i(locInstanced, 0);

  // Divisoren/Attribute zuruecksetzen, damit normale Draws sauber bleiben.
  for (let k = 0; k < 4; k++) {
    const loc = locInstModel + k;
    g.vertexAttribDivisor(loc, 0);
    g.disableVertexAttribArray(loc);
  }
  g.vertexAttribDivisor(locInstColor, 0);
  g.disableVertexAttribArray(locInstColor);

  instGeom = [];
  instData = [];
  instCmds = [];
}

/**
 * flushBatch zeichnet alle gesammelten Primitives des Frames mit einem
 * einzigen wiederverwendbaren VBO.
 */
function flushBatch(): void {
  if (!gl) {
    batchVerts = [];
    batchCmds = [];
    return;
  }
  if (batchCmds.length === 0 && instCmds.length === 0) {
    return;
  }

  const g = gl;
  compactBatch();

  g.uniform1i(locInstanced, 0);

  g.bindVertexArray(vao);
  g.bindBuffer(g.ARRAY_BUFFER, vbo);

  const byteLen = batchVerts.length * 4;
  if (byteLen > batchCap) {
    g.bufferData(g.ARRAY_BUFFER, new Float32Array(batchVerts), g.DYNAMIC_DRAW);
    batchCap = byteLen;
  } else {
    g.bufferSubData(g.ARRAY_BUFFER, 0, new Float32Array(batchVerts));
  }

  g.enableVertexAttribArray(locPos);
  g.enableVertexAttribArray(locColorAttr);
  const stride = 7 * 4;
  g.vertexAttribPointer(locPos, 3, g.FLOAT, false, stride, 0);
  g.vertexAttribPointer(locColorAttr, 4, g.FLOAT, false, stride, 3 * 4);

  for (const c of batchCmds) {
    g.uniformMatrix4fv(locView, false, c.view);
    g.uniformMatrix4fv(locProjection, false, c.proj);
    g.uniform1i(locMode, effectToMode(c.effect));
    g.uniform1i(locLighted, c.lit);
    g.uniform4f(locColor, c.col.r, c.col.g, c.col.b, c.col.a);
    g.uniform4f(locColor2, c.grad2.r, c.grad2.g, c.grad2.b, c.grad2.a);
    g.uniform1f(locPointSize, c.pointSize);
    g.uniform3f(locCenter, c.center[0], c.center[1], c.center[2]);
    g.uniform1f(locRadius, c.radius);
    // WebGL kennt nur Linienbreite 1.0 (dickere erzeugen einen GL-Fehler);
    // der Zustand bleibt fuer das Batching dennoch erhalten.
    if (c.lineW === 1) {
      g.lineWidth(1);
    }
    g.drawArrays(c.mode, c.first, c.count);
  }

  batchVerts = [];
  batchCmds = [];

  flushInstanced(g);
}

// =================================================================
// MAUS / FENSTER (intern)
// =================================================================

function onPointerMove(e: PointerEvent): void {
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left - frameW / 2.0;
  mouseY = -(e.clientY - rect.top - frameH / 2.0);
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) {
    return;
  }
  mouseStatus = 1;
}

function onPointerUp(e: PointerEvent): void {
  if (e.button !== 0) {
    return;
  }
  mouseStatus = 2;
}

function onKeyDown(e: KeyboardEvent): void {
  // Kante nur beim ersten Down: keydown wiederholt sich bei gehaltener Taste.
  if (!keysDown.has(e.code)) {
    keysPressed.add(e.code);
  }
  keysDown.add(e.code);

  // ESC stoppt die Animations-Schleife (Analogon zum C++-Ausstieg).
  if (e.code === "Escape") {
    noLoop();
  }
}

function onKeyUp(e: KeyboardEvent): void {
  keysDown.delete(e.code);
}

// applyViewportSize setzt Canvas-Groesse und Viewport auf die Fenstergroesse.
function applyViewportSize(): void {
  if (!canvas || !gl) {
    return;
  }
  frameW = window.innerWidth;
  frameH = window.innerHeight;
  canvas.width = frameW;
  canvas.height = frameH;
  canvas.style.width = `${frameW}px`;
  canvas.style.height = `${frameH}px`;
  gl.viewport(0, 0, frameW, frameH);
}

function onResize(): void {
  applyViewportSize();
}

// =================================================================
// BATCH-SAMMEL-HELFER (siehe renderer_internal.ts)
// =================================================================

/** @internal */
export function submitTriangles(verts: number[], model: Matrix4x4): void {
  submit(GL_TRIANGLES, verts, false, model);
}

/** @internal */
export function submitLines(verts: number[], model: Matrix4x4): void {
  submit(GL_LINES, verts, true, model);
}

/** @internal */
export function submitInstanced(
  triangles: number[],
  lines: number[],
  style: DrawStyle,
  instances: Instance[],
): void {
  if (instances.length === 0) {
    return;
  }

  // Instanz-Daten: Modell-Matrix (column-major) + Farbe.
  const instFirst = instData.length / 20;
  for (const inst of instances) {
    const m = inst.model;
    instData.push(
      m[0][0], m[1][0], m[2][0], m[3][0],
      m[0][1], m[1][1], m[2][1], m[3][1],
      m[0][2], m[1][2], m[2][2], m[3][2],
      m[0][3], m[1][3], m[2][3], m[3][3],
      inst.color.r, inst.color.g, inst.color.b, inst.color.a,
    );
  }
  const instCount = instances.length;

  // Basis-Geometrie anhaengen (Farbe weiss; pro Instanz ueberschrieben).
  const appendGeom = (dst: number[], src: number[]): void => {
    for (let i = 0; i + 2 < src.length; i += 3) {
      dst.push(src[i], src[i + 1], src[i + 2], 1, 1, 1, 1);
    }
  };

  if ((style === DrawStyle.Fill || style === DrawStyle.Both) && triangles.length > 0) {
    const c: InstCmd = {
      mode: GL_TRIANGLES,
      first: instGeom.length / 7,
      count: triangles.length / 3,
      instFirst,
      instCount,
      effect: state.effect,
      grad2: state.grad2,
      pointSize: pointSizeVal,
      lineW: state.lineWidth,
      center: gradCenter.slice(),
      radius: gradRadius,
      view: viewUniform.slice(),
      proj: projUniform.slice(),
      lit: 1,
    };
    appendGeom(instGeom, triangles);
    instCmds.push(c);
  }
  if ((style === DrawStyle.Stroke || style === DrawStyle.Both) && lines.length > 0) {
    const c: InstCmd = {
      mode: GL_LINES,
      first: instGeom.length / 7,
      count: lines.length / 3,
      instFirst,
      instCount,
      effect: state.effect,
      grad2: state.grad2,
      pointSize: pointSizeVal,
      lineW: state.lineWidth,
      center: gradCenter.slice(),
      radius: gradRadius,
      view: viewUniform.slice(),
      proj: projUniform.slice(),
      lit: 0,
    };
    appendGeom(instGeom, lines);
    instCmds.push(c);
  }
}

// =================================================================
// OEFFENTLICHE API - Setup & Matrizen
// =================================================================

export function getWidth(): number {
  return frameW;
}

export function getHeight(): number {
  return frameH;
}

/** noLoop stoppt die Animations-Schleife. */
export function noLoop(): void {
  looping = false;
}

/** isMouseDown gibt true zurueck, solange die linke Maustaste gedrueckt ist. */
export function isMouseDown(): boolean {
  return mouseStatus === 1;
}

/** isMouseUp gibt einmalig true zurueck, wenn die Maustaste losgelassen wurde. */
export function isMouseUp(): boolean {
  if (mouseStatus === 2) {
    mouseStatus = 0;
    return true;
  }
  return false;
}

/**
 * isKeyDown gibt true zurueck, solange die Taste gedrueckt ist (Dauerdruck,
 * z. B. fuer laufende Steuerung pro Frame). key ist KeyboardEvent.code bzw.
 * ein Key-Wert.
 */
export function isKeyDown(key: string): boolean {
  return keysDown.has(key);
}

/**
 * isKeyPressed gibt einmalig true zurueck, wenn die Taste seit der letzten
 * Abfrage gedrueckt wurde (konsumierend wie isMouseUp, fuer Trigger).
 */
export function isKeyPressed(key: string): boolean {
  if (keysPressed.has(key)) {
    keysPressed.delete(key);
    return true;
  }
  return false;
}

/**
 * setProjection/setView setzen die Kamera-Matrizen. Die Modell-Matrix wird
 * NICHT als globaler Zustand gehalten, sondern pro Zeichenaufruf als
 * explizites Argument uebergeben (siehe model-Parameter der Primitive).
 */
export function setProjection(m: Matrix4x4): void {
  projUniform = flattenMatrix(m);
  if (gl) {
    gl.uniformMatrix4fv(locProjection, false, projUniform);
  }
}

export function setView(m: Matrix4x4): void {
  viewUniform = flattenMatrix(m);
  if (gl) {
    gl.uniformMatrix4fv(locView, false, viewUniform);
  }
}

// =================================================================
// KAMERA- UND SZENEN-BUENDEL
//
// Reine Daten-Huellen plus Apply-Funktionen. Sie befuellen weiterhin die
// expliziten Setter; es entsteht KEIN globaler Modell-/Kamera-Zustand.
// =================================================================

/** Camera buendelt die perspektivischen Parameter und die Blickrichtung. */
export class Camera {
  constructor(
    public pos: Vec3 = new Vec3(50, 100, 200),
    public target: Vec3 = new Vec3(0, 0, 0),
    public up: Vec3 = new Vec3(0, 1, 0),
    public fovY = 1.2,
    public near = 0.1,
    public far = 1000,
  ) {}

  /** view liefert die View-Matrix (reine Mathe). */
  view(): Matrix4x4 {
    return lookAtMatrix(this.pos, this.target, this.up);
  }

  /** projection liefert die Projektionsmatrix fuer ein Aspect-Ratio. */
  projection(aspect: number): Matrix4x4 {
    return perspectiveMatrix(this.fovY, aspect, this.near, this.far);
  }
}

/** Fog buendelt die Tiefen-Nebel-Parameter. enabled == false -> kein Nebel. */
export interface Fog {
  enabled: boolean;
  near: number;
  far: number;
  color: ColorInput;
}

/**
 * Scene buendelt Kamera + Welt-Attribute (Licht, Nebel, Hintergrund).
 * Farb-/Graustufenwerte sind als ColorInput hinterlegt (0..255-Graustufe
 * bzw. [r,g,b] wie bei background()).
 */
export interface Scene {
  cam: Camera;
  sunDir: Vec3;
  fog: Fog;
  background: ColorInput;
}

/** makeScene erzeugt eine Scene mit sinnvollen Defaults. */
export function makeScene(): Scene {
  return {
    cam: new Camera(),
    sunDir: new Vec3(0.5, 1.0, 0.3),
    fog: { enabled: false, near: 0, far: 1, color: { r: 0, g: 0, b: 0, a: 0 } },
    background: [40, 40, 40],
  };
}

/** applyCamera setzt View + Projection (Aspect aus getWidth/getHeight). */
export function applyCamera(cam: Camera): void {
  setProjection(cam.projection(getWidth() / getHeight()));
  setView(cam.view());
}

/**
 * beginScene wendet die Szene an: Hintergrund, Nebel, Kamera und
 * Sonnenrichtung (in Kamerakoordinaten). Pro Frame aufzurufen.
 */
export function beginScene(scene: Scene): void {
  background(scene.background);
  if (scene.fog.enabled) {
    const c = parseColor(scene.fog.color);
    setFog(scene.fog.near, scene.fog.far, c.r, c.g, c.b, c.a);
  }
  applyCamera(scene.cam);
  const camLight = scene.sunDir.transformDir(scene.cam.view());
  setLightDirection(camLight.x, camLight.y, camLight.z);
}

/**
 * getPendingDrawCalls liefert die Anzahl der im aktuellen Batch noch nicht
 * gezeichneten Draw-Calls. Fuer Tests/Diagnose gedacht (kein GL-Zugriff).
 */
export function getPendingDrawCalls(): number {
  return batchCmds.length;
}

/**
 * getPendingInstancedDrawCalls liefert analog die Anzahl der gesammelten
 * Instancing-Draw-Calls (Fuer Tests/Diagnose, kein GL-Zugriff).
 */
export function getPendingInstancedDrawCalls(): number {
  return instCmds.length;
}

/**
 * setBatchSort aktiviert das Sortieren/Umpacken der Pending-Batch, damit auch
 * nicht-benachbarte Primitive mit gleichem Zustand zusammengefasst werden.
 * ACHTUNG: aendert die Zeichenreihenfolge -> nur fuer opake Geometrie geeignet.
 */
export function setBatchSort(on: boolean): void {
  batchSort = on;
}

/** compactBatch sortiert (falls aktiviert) und fasst die Pending-Batch zusammen. */
export function compactBatch(): void {
  if (!batchSort || batchCmds.length < 2) {
    return;
  }

  const order = batchCmds.map((_, i) => i);
  order.sort((x, y) => {
    if (cmdKeyLess(batchCmds[x], batchCmds[y])) return -1;
    if (cmdKeyLess(batchCmds[y], batchCmds[x])) return 1;
    return x - y;
  });

  const newData: number[] = [];
  const newCmds: DrawCmd[] = [];
  for (const idx of order) {
    mergeBlock(newData, newCmds, batchCmds[idx], batchVerts);
  }
  batchVerts = newData;
  batchCmds = newCmds;
}

/** setGradientCenter setzt das Zentrum fuer den Gradient-Effekt. */
export function setGradientCenter(cx: number, cy: number, cz: number, radius: number): void {
  gradCenter = [cx, cy, cz];
  gradRadius = radius;
  if (gl) {
    gl.uniform3f(locCenter, cx, cy, cz);
    gl.uniform1f(locRadius, radius);
  }
}

/** setFog aktiviert Tiefen-Nebel. */
export function setFog(
  near: number,
  far: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (gl) {
    gl.uniform1f(locFogNear, near);
    gl.uniform1f(locFogFar, far);
    gl.uniform4f(locFogColor, r, g, b, a);
  }
}

/**
 * setLightDirection setzt die Lichtrichtung fuer das Flat-Shading in
 * Kamerakoordinaten (zeigt vom Fragment ZUR Lichtquelle).
 */
export function setLightDirection(x: number, y: number, z: number): void {
  if (gl) {
    gl.uniform3f(locLightDir, x, y, z);
  }
}

/**
 * init initialisiert Canvas, WebGL2-Kontext, Shader und Batch-Zustand.
 * Die Canvas-Groesse folgt dem Fenster (window.innerWidth/innerHeight).
 * Wirft einen Fehler bei Problemen.
 */
export function init(): void {
  if (typeof document === "undefined" || !document.body) {
    throw new Error("init benoetigt einen Browser-Kontext (document.body).");
  }

  canvas = document.createElement("canvas");
  canvas.style.display = "block";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!ctx) {
    canvas.remove();
    canvas = null;
    throw new Error("WebGL2 ist nicht verfuegbar");
  }
  gl = ctx;

  prog = createProgram(gl, kVertSrc, kFragSrc);
  gl.useProgram(prog);

  locPos = gl.getAttribLocation(prog, "aPos");
  locColorAttr = gl.getAttribLocation(prog, "aColor");
  locInstModel = gl.getAttribLocation(prog, "aInstModel");
  locInstColor = gl.getAttribLocation(prog, "aInstColor");
  locInstanced = gl.getUniformLocation(prog, "uInstanced");
  locView = gl.getUniformLocation(prog, "uView");
  locProjection = gl.getUniformLocation(prog, "uProjection");
  locPointSize = gl.getUniformLocation(prog, "uPointSize");
  locMode = gl.getUniformLocation(prog, "uMode");
  locColor = gl.getUniformLocation(prog, "uColor");
  locColor2 = gl.getUniformLocation(prog, "uColor2");
  locTime = gl.getUniformLocation(prog, "uTime");
  locCenter = gl.getUniformLocation(prog, "uShapeCenter");
  locRadius = gl.getUniformLocation(prog, "uShapeRadius");
  locFogNear = gl.getUniformLocation(prog, "uFogNear");
  locFogFar = gl.getUniformLocation(prog, "uFogFar");
  locFogColor = gl.getUniformLocation(prog, "uFogColor");
  locLighted = gl.getUniformLocation(prog, "uLighted");
  locLightDir = gl.getUniformLocation(prog, "uLightDir");

  // VAO/VBO anlegen (WebGL2 benoetigt ein VAO).
  vao = gl.createVertexArray();
  vbo = gl.createBuffer();
  vboGeom = gl.createBuffer();
  vboInst = gl.createBuffer();

  gl.uniform1f(locPointSize, 4.0);
  gl.uniform3f(locCenter, 0, 0, 0);
  gl.uniform1f(locRadius, 1);
  gl.uniform1i(locLighted, 0);
  gl.uniform1i(locInstanced, 0);
  gl.uniform3f(locLightDir, 0, 0, -1); // Headlight: Kamera blickt +Z

  const ident = identity16();
  gl.uniformMatrix4fv(locProjection, false, ident);
  gl.uniformMatrix4fv(locView, false, ident);

  // Fog-Defaults (kein Nebel)
  gl.uniform1f(locFogNear, 0);
  gl.uniform1f(locFogFar, 1);
  gl.uniform4f(locFogColor, 0, 0, 0, 0);

  // Depth-Testing + Alpha-Blending.
  // LEQUAL (statt LESS): koplanare Kanten bleiben ueber ihren eigenen
  // Flaechen sichtbar.
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Canvas-Groesse an das Fenster angleichen (auch beim ersten Start).
  applyViewportSize();
  startTime = performance.now() / 1000;

  // Batch-Zustand initialisieren.
  state = {
    fill: { r: 1, g: 1, b: 1, a: 1 },
    stroke: { r: 0, g: 0, b: 0, a: 1 },
    lineWidth: 1,
    effect: EffectMode.Flat,
    grad2: { r: 0, g: 0, b: 0, a: 1 },
  };
  viewUniform = identity16();
  projUniform = identity16();
  batchSort = false;
  geomCap = 0;
  instCap = 0;
  instGeom = [];
  instData = [];
  instCmds = [];
  pointSizeVal = 4.0;
  gradCenter = [0, 0, 0];
  gradRadius = 1;
  batchCap = 0;
  batchVerts = [];
  batchCmds = [];

  // Tastatur-Zustand zuruecksetzen.
  keysDown.clear();
  keysPressed.clear();

  // Eingabe-Callbacks.
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
}

/** startAnimation startet die Animations-Schleife. */
export function startAnimation(fnDraw: () => void): void {
  if (!gl) {
    throw new Error("startAnimation benoetigt init().");
  }
  looping = true;
  const frame = (): void => {
    if (!looping) {
      return;
    }
    const g = gl!;
    const t = performance.now() / 1000 - startTime;
    g.uniform1f(locTime, t);

    fnDraw();

    flushBatch();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// =================================================================
// OEFFENTLICHE API - Zeichenzustand
// =================================================================

export function fillColor(color: ColorInput): void {
  state.fill = parseColor(color);
}

export function strokeColor(color: ColorInput): void {
  state.stroke = parseColor(color);
}

export function strokeWidth(w: number): void {
  state.lineWidth = w;
}

export function setEffect(effect: EffectMode): void {
  state.effect = effect;
}

export function setGradient(color: ColorInput): void {
  state.grad2 = parseColor(color);
}

/** background loescht den gesamten Canvas inkl. Tiefenpuffer. */
export function background(color: ColorInput): void {
  const c = parseColor(color);
  flushBatch();
  if (!gl) {
    return;
  }
  gl.clearColor(c.r, c.g, c.b, c.a);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

// =================================================================
// OEFFENTLICHE API - 3D-Primitive
// =================================================================

/** pointSize setzt die Groesse von GL_POINTS (Pixel). */
export function pointSize(px: number): void {
  pointSizeVal = px;
  if (gl) {
    gl.uniform1f(locPointSize, px);
  }
}

export function point(x: number, y: number, z: number, model: Matrix4x4 = identityMatrix()): void {
  submit(GL_POINTS, [x, y, z], true, model);
}

export function line(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  model: Matrix4x4 = identityMatrix(),
): void {
  submit(GL_LINES, [x1, y1, z1, x2, y2, z2], true, model);
}

export function triangle(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  style: DrawStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  if (style === DrawStyle.Fill || style === DrawStyle.Both) {
    submit(GL_TRIANGLES, [x1, y1, z1, x2, y2, z2, x3, y3, z3], false, model);
  }
  if (style === DrawStyle.Stroke || style === DrawStyle.Both) {
    submit(
      GL_LINES,
      [x1, y1, z1, x2, y2, z2, x2, y2, z2, x3, y3, z3, x3, y3, z3, x1, y1, z1],
      true,
      model,
    );
  }
}

export function shape(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
  x4: number, y4: number, z4: number,
  style: DrawStyle,
  model: Matrix4x4 = identityMatrix(),
): void {
  if (style === DrawStyle.Fill || style === DrawStyle.Both) {
    submit(
      GL_TRIANGLES,
      [x1, y1, z1, x2, y2, z2, x3, y3, z3, x1, y1, z1, x3, y3, z3, x4, y4, z4],
      false,
      model,
    );
  }
  if (style === DrawStyle.Stroke || style === DrawStyle.Both) {
    submit(
      GL_LINES,
      [
        x1, y1, z1, x2, y2, z2,
        x2, y2, z2, x3, y3, z3,
        x3, y3, z3, x4, y4, z4,
        x4, y4, z4, x1, y1, z1,
      ],
      true,
      model,
    );
  }
}

export function rect(
  x: number, y: number, w: number, h: number,
  style: DrawStyle, z: number,
  model: Matrix4x4 = identityMatrix(),
): void {
  const hw = w / 2;
  const hh = h / 2;
  shape(x - hw, y - hh, z, x + hw, y - hh, z, x + hw, y + hh, z, x - hw, y + hh, z, style, model);
}

export function circle(
  x: number, y: number, z: number, radius: number,
  style: DrawStyle, segments: number,
  model: Matrix4x4 = identityMatrix(),
): void {
  const tau = 2 * Math.PI;

  if (style === DrawStyle.Fill || style === DrawStyle.Both) {
    const fillVerts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * tau;
      const a1 = ((i + 1) / segments) * tau;
      fillVerts.push(x, y, z);
      fillVerts.push(x + Math.cos(a0) * radius, y + Math.sin(a0) * radius, z);
      fillVerts.push(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius, z);
    }
    submit(GL_TRIANGLES, fillVerts, false, model);
  }

  if (style === DrawStyle.Stroke || style === DrawStyle.Both) {
    const strokeVerts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * tau;
      strokeVerts.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z);
    }
    submit(GL_LINE_LOOP, strokeVerts, true, model);
  }
}

export function polygon(pts: number[], style: DrawStyle, model: Matrix4x4 = identityMatrix()): void {
  if (pts.length < 4) {
    return;
  }
  const n = pts.length / 3;

  if (style === DrawStyle.Fill || style === DrawStyle.Both) {
    const fillVerts: number[] = [];
    for (let i = 1; i < n - 1; i++) {
      fillVerts.push(pts[0], pts[1], pts[2]);
      fillVerts.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      fillVerts.push(pts[i * 3 + 3], pts[i * 3 + 4], pts[i * 3 + 5]);
    }
    submit(GL_TRIANGLES, fillVerts, false, model);
  }
  if (style === DrawStyle.Stroke || style === DrawStyle.Both) {
    submit(GL_LINE_LOOP, pts.slice(), true, model);
  }
}
