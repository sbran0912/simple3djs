// ====================================================================
// LIB3D-TESTS (Port von tests/lib3d_test.cpp)
//
// Reines Bun-Skript: sammelt alle Pruefungen, gibt am Ende das Ergebnis aus
// und setzt den Exit-Code. Der Renderer laeuft dabei ohne WebGL-Kontext -
// genau wie im C++-Original (Batch-Sammlung ohne GL-Zugriff).
//
// Ausfuehren:  bun run tests/lib3d_test.ts   (make test)
// ====================================================================

import {
  compactBatch,
  drawLine,
  drawMesh,
  drawMeshInstanced,
  DrawStyle,
  getPendingDrawCalls,
  getPendingInstancedDrawCalls,
  type Instance,
  line,
  lookAtMatrix,
  makeCubeMesh,
  makePyramidMesh,
  makeSphereMesh,
  parseColor,
  perspectiveMatrix,
  rotateMatrix,
  setBatchSort,
  strokeColor,
  strokeWidth,
  translateMatrix,
  Vec3,
  type ShapeStyle,
} from "../lib3d/lib3d";
import { closestPointToFace, type Face } from "../bodies/bodies";

let fails = 0;

function expect(cond: boolean, msg: string): void {
  if (!cond) {
    console.log(`FAIL: ${msg}`);
    fails++;
  }
}

function nearly(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) < eps;
}

function testVec3CrossAndDot(): void {
  const x = new Vec3(1, 0, 0);
  const y = new Vec3(0, 1, 0);
  expect(x.cross(y).equals(new Vec3(0, 0, 1), 1e-12), "cross = (0,0,1)");
  expect(x.dot(y) === 0, "dot = 0");
}

function testVec3Normalize(): void {
  const got = new Vec3(3, 0, 4).normalize();
  expect(
    nearly(got.length(), 1, 1e-12) && got.equals(new Vec3(0.6, 0, 0.8), 1e-12),
    "normalize = (0.6,0,0.8)",
  );
  const zero = new Vec3().normalize();
  expect(zero.equals(new Vec3(), 1e-12), "zero vector normalize = zero");
}

function testLookAtCameraMapsToOrigin(): void {
  const cam = new Vec3(0, 0, -100);
  const view = lookAtMatrix(cam, new Vec3(0, 0, 0), new Vec3(0, 1, 0));
  const got = cam.transform(view);
  expect(got.equals(new Vec3(0, 0, 0), 1e-9), "Kamera -> Ursprung");
  const ahead = new Vec3(0, 0, -90).transform(view);
  expect(nearly(ahead.z, 10, 1e-9), "Punkt vor Kamera z = 10");
}

function testPerspectiveClipspace(): void {
  const proj = perspectiveMatrix(Math.PI / 4, 1, 0.1, 1000);
  const near = 0.1;
  const v = new Vec3(0, 0, near).transform(proj);
  expect(nearly(v.z / near, -1, 1e-9), "near-Ebene z_clip/w = -1");
}

function testRotateMatrixY(): void {
  // +X um -90 Grad um Y drehen -> +Z (Richtung der Szenen-Rotation).
  const rot = rotateMatrix(0, -Math.PI / 2, 0);
  const got = new Vec3(1, 0, 0).transform(rot);
  expect(got.equals(new Vec3(0, 0, 1), 1e-9), "RotateY(-90) x -> z");
}

function testMeshGeometry(): void {
  const cube = makeCubeMesh(2, 2, 2);
  expect(cube.triangles.length === 6 * 2 * 3 * 3, "Wuerfel: 6 Flaechen = 36 Dreiecke");
  expect(cube.lines.length === 12 * 2 * 3, "Wuerfel: 12 Kanten");

  const pyr = makePyramidMesh(2, 3);
  expect(pyr.triangles.length === (4 * 3 + 2 * 3) * 3, "Pyramide: 4 Seiten + Basis");
  expect(pyr.lines.length === 8 * 2 * 3, "Pyramide: 8 Kanten");
}

function testBatchMerging(): void {
  // Ohne init sammelt submit nur (kein GL-Zugriff). Die Batch ist hier leer.

  // Phase 2: Sortierung fasst auch nicht-benachbarte Befehle zusammen.
  setBatchSort(true);
  strokeColor([200, 200, 200]);
  strokeWidth(1);
  line(0, 0, 0, 1, 1, 1);
  strokeWidth(9);
  line(0, 0, 0, 1, 1, 1);
  strokeWidth(1);
  line(0, 0, 0, 1, 1, 1);
  strokeWidth(9);
  line(0, 0, 0, 1, 1, 1);
  expect(getPendingDrawCalls() === 4, "w1/w9 im Wechsel -> 4 Draw-Calls");
  compactBatch();
  expect(getPendingDrawCalls() === 2, "sortiert -> 2 Draw-Calls");
  setBatchSort(false);

  // 50 identische Linien -> ein einziger Draw-Call.
  strokeColor([123, 45, 67]);
  strokeWidth(1);
  const b1 = getPendingDrawCalls();
  for (let i = 0; i < 50; i++) {
    line(0, 0, 0, 1, 1, 1);
  }
  expect(getPendingDrawCalls() - b1 === 1, "50 gleiche Linien -> 1 Draw-Call");

  // Unterschiedliche Farben (flat) werden trotzdem gebuendelt, weil die
  // Farbe pro Vertex uebertragen wird -> keine neuen Draw-Calls.
  const b2 = getPendingDrawCalls();
  drawLine(0, 0, 0, 1, 0, 0, { stroke: "#00ff00" });
  drawLine(0, 0, 0, 1, 0, 0, { stroke: "#0000ff" });
  expect(getPendingDrawCalls() - b2 === 0, "Farbe (flat) bleibt ein Draw-Call");

  // Eine echte Zustandsaenderung (Linienbreite) trennt die Draw-Calls.
  const b2b = getPendingDrawCalls();
  drawLine(0, 0, 0, 1, 0, 0, { stroke: "#00ff00", lineWidth: 5 });
  expect(getPendingDrawCalls() - b2b === 1, "Linienbreite trennt Draw-Calls");

  // Ein Wuerfel -> 1 Fill-Call + 1 Line-Call.
  const cube: ShapeStyle = {
    stroke: "#111111",
    fill: "#dddddd",
    lineWidth: 2,
    mode: DrawStyle.Both,
  };
  const b3 = getPendingDrawCalls();
  drawMesh(makeCubeMesh(10, 10, 10), cube);
  expect(getPendingDrawCalls() - b3 === 2, "Wuerfel -> 1 Fill + 1 Line");
}

function testInstancing(): void {
  // 10 Instanzen eines Wuerfels -> 1 Fill- + 1 Line-Instancing-Draw-Call.
  const style: ShapeStyle = {
    stroke: "#000000",
    fill: "#ffffff",
    lineWidth: 1,
    mode: DrawStyle.Both,
  };
  const instances: Instance[] = [];
  for (let i = 0; i < 10; i++) {
    instances.push({
      model: translateMatrix(i * 5.0, 0, 0),
      color: { r: 1, g: 0, b: 0, a: 1 },
    });
  }
  const b = getPendingInstancedDrawCalls();
  drawMeshInstanced(makeCubeMesh(2, 2, 2), style, instances);
  expect(
    getPendingInstancedDrawCalls() - b === 2,
    "10 Instanzen -> 1 Fill + 1 Line (instanced)",
  );
}

function testParseColor(): void {
  const hex = parseColor("#ff0000");
  expect(nearly(hex.r, 1, 1e-12) && hex.g === 0 && hex.b === 0 && hex.a === 1, "hex rot");
  const gray = parseColor(128);
  expect(nearly(gray.r, 128.0 / 255, 1e-12) && nearly(gray.g, 128.0 / 255, 1e-12), "grau");
  const rgba = parseColor([51, 255, 51, 64]);
  expect(nearly(rgba.g, 1, 1e-12) && nearly(rgba.a, 64.0 / 255, 1e-12), "rgba");
}

function testClosestPointToFace(): void {
  const f: Face = {
    a: new Vec3(0, 0, 0),
    b: new Vec3(10, 0, 0),
    c: new Vec3(0, 0, 10),
    normal: new Vec3(0, 1, 0),
  };

  // Innerer Punkt: Projektion senkrecht nach unten in die Flaechenebene.
  const inside = closestPointToFace(new Vec3(2, 5, 2), f);
  expect(inside.point.equals(new Vec3(2, 0, 2), 1e-9), "innen -> Punkt in der Ebene");
  expect(nearly(inside.distance, 5, 1e-9), "innen -> Abstand 5");
  expect(nearly(inside.signedDistance, 5, 1e-9), "aussen -> SignedDistance +5");
  expect(inside.normal.equals(new Vec3(0, 1, 0), 1e-12), "Normale uebernommen");

  // Unterhalb der Ebene -> negativer gerichteter Abstand.
  const below = closestPointToFace(new Vec3(2, -5, 2), f);
  expect(below.point.equals(new Vec3(2, 0, 2), 1e-9), "unterhalb -> Punkt in der Ebene");
  expect(nearly(below.signedDistance, -5, 1e-9), "innen -> SignedDistance -5");

  // Neben der Kante BC (x+z > 10): naechster Punkt auf der Kante.
  const edge = closestPointToFace(new Vec3(6, 0, 6), f);
  expect(edge.point.equals(new Vec3(5, 0, 5), 1e-9), "Kante BC -> Mittelpunkt");
  expect(nearly(edge.distance, Math.sqrt(2), 1e-9), "Kante BC -> Abstand sqrt(2)");

  // Neben der Ecke A: naechster Punkt ist die Ecke A.
  const corner = closestPointToFace(new Vec3(-4, 0, -4), f);
  expect(corner.point.equals(new Vec3(0, 0, 0), 1e-9), "Ecke A");
  expect(nearly(corner.distance, Math.sqrt(32), 1e-9), "Ecke A -> Abstand");

  // Senkrecht neben der Kante AC (x < 0).
  const ac = closestPointToFace(new Vec3(-3, 0, 5), f);
  expect(ac.point.equals(new Vec3(0, 0, 5), 1e-9), "Kante AC");
  expect(nearly(ac.distance, 3, 1e-9), "Kante AC -> Abstand 3");
}

// Smoke-Test: drawMesh sammelt nur in den Batch (kein GL-Zugriff) und darf
// ohne initialisierten Kontext nicht abstuerzen.
function testMeshShapes(): void {
  const style: ShapeStyle = {
    stroke: "#000000",
    fill: "#ffffff",
    lineWidth: 1,
    mode: DrawStyle.Both,
  };
  drawMesh(makeCubeMesh(10, 10, 10), style);
  drawMesh(makePyramidMesh(10, 15), style);
  drawMesh(makeSphereMesh(5, 12, 6), style);
  expect(true, "drawMesh aufrufbar");
}

function main(): void {
  testVec3CrossAndDot();
  testVec3Normalize();
  testLookAtCameraMapsToOrigin();
  testPerspectiveClipspace();
  testRotateMatrixY();
  testMeshGeometry();
  testBatchMerging();
  testInstancing();
  testParseColor();
  testClosestPointToFace();
  testMeshShapes();

  if (fails === 0) {
    console.log("Alle Tests bestanden.");
    return;
  }
  console.error(`${fails} Test(s) fehlgeschlagen.`);
  throw new Error(`${fails} Test(s) fehlgeschlagen.`);
}

main();
