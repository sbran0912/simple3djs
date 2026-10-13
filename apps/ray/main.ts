import {
  beginScene,
  DrawStyle,
  drawLine,
  drawMesh,
  drawPoint,
  init,
  makeCubeMesh,
  makePyramidMesh,
  makeScene,
  rotateAround,
  rotateMatrix,
  startAnimation,
  Vec3,
  type Mesh,
  type PrimitiveStyle,
  type ShapeStyle,
} from "../../lib3d/lib3d";
import {
  type Body,
  raycastSegment,
  makeBody,
  type Face,
} from "../../lib3d/bodies";

// ====================================================================
// Rayleigh-Beispiel (Port von simple3d/apps/ray):
//
// Vier Wuerfel (rot/cyan) und eine Pyramide (weiss) stehen in der Szene.
// Aus dem Ursprung laeuft ein rotierender Lichtkegel aus 20 Strahlen; jeder
// Strahl endet am naechsten Face-Treffer (Raycasting ueber das bodies-Modul).
// ====================================================================

// shiftMeshY verschiebt ein Mesh entlang Y.
function shiftMeshY(mesh: Mesh, dy: number): Mesh {
  const out: Mesh = { triangles: mesh.triangles.slice(), lines: mesh.lines.slice() };
  for (let i = 1; i < out.triangles.length; i += 3) {
    out.triangles[i] += dy;
  }
  for (let i = 1; i < out.lines.length; i += 3) {
    out.lines[i] += dy;
  }
  return out;
}

// Zeichenstile der Bodies (Darstellung liegt beim Aufrufer, nicht im Body).
const boxRed: ShapeStyle = {
  stroke: "#ff0000",
  fill: "#ff0000",
  lineWidth: 2,
  mode: DrawStyle.Both,
};
const boxCyan: ShapeStyle = {
  stroke: "#00ffff",
  fill: "#00ffff",
  lineWidth: 2,
  mode: DrawStyle.Both,
};
const pyrWhite: ShapeStyle = {
  stroke: "#ffffff",
  fill: "#ffffff",
  lineWidth: 1,
  mode: DrawStyle.Both,
};

const screenW = 1600;
const screenH = 1000;
const coneLines = 20;
const camHeight = 140;

const scene = makeScene();
scene.cam.target = new Vec3(0, 0, 0);
scene.cam.up = new Vec3(0, 1, 0);
scene.cam.fovY = 1.2;
scene.cam.near = 0.1;
scene.cam.far = 1000;
scene.sunDir = new Vec3(1, 0, 0);
scene.fog = { enabled: true, near: 100, far: 600, color: { r: 0.25, g: 0.25, b: 0.25, a: 1 } };

const camRadius = Math.sqrt(40 * 40 + 180 * 180);
let timeAccum = 0;
let coneRotY = 0;
let frameCount = 0;
let fpsLast = 0;

// Geometrie: Wuerfel wie lib3d; Pyramide vertikal zentriert (wie Referenz).
const boxMesh = makeCubeMesh(100, 80, 60);
const pyrMesh = shiftMeshY(makePyramidMesh(90, 120), -60);

// Body und zugehoeriger Zeichenstil bleiben zusammen (Reihenfolge-sicher).
const bodies: { body: Body; style: ShapeStyle }[] = [
  { body: makeBody(boxMesh, new Vec3(150, 0, 50), 0, 0, 0), style: boxRed },
  { body: makeBody(boxMesh, new Vec3(0, 0, 100), 0, 0, 0), style: boxCyan },
  { body: makeBody(boxMesh, new Vec3(-150, 0, -100), 0, 0, 0), style: boxRed },
  { body: makeBody(boxMesh, new Vec3(-200, 0, 30), 0, Math.PI / 2, 0), style: boxCyan },
  { body: makeBody(pyrMesh, new Vec3(100, 0, -100), 0, 0, 0), style: pyrWhite },
];

/* ----
Render-Loop - draw wird als Funktion an startAnimation uebergeben.
-----*/
function draw(): void {
  timeAccum += 0.02;
  frameCount++;
  const now = performance.now() / 1000;
  if (now - fpsLast >= 2.0) {
    console.log(`FPS: ${(frameCount / (now - fpsLast)).toFixed(1)}`);
    frameCount = 0;
    fpsLast = now;
  }

  const camAngle = timeAccum * 0.15;
  scene.cam.pos = new Vec3(
    Math.sin(camAngle) * camRadius,
    camHeight,
    Math.cos(camAngle) * camRadius,
  );
  beginScene(scene);

  // Alle Bodies zeichnen (Mesh einmal erzeugt, Modell-Matrix explizit).
  for (const { body, style } of bodies) {
    drawMesh(body.geometry, style, body.modelMatrix());
  }

  // Welt-Faces aller Bodies (pro Frame neu, wie in der Referenz).
  const faces: Face[] = [];
  for (const { body } of bodies) {
    faces.push(...body.worldFaces());
  }

  // Faces debuggen
  for (const f of faces) {
    console.log(
      `Face: A=(${f.a.x.toFixed(2)}, ${f.a.y.toFixed(2)}, ${f.a.z.toFixed(2)}) ` +
        `B=(${f.b.x.toFixed(2)}, ${f.b.y.toFixed(2)}, ${f.b.z.toFixed(2)}) ` +
        `C=(${f.c.x.toFixed(2)}, ${f.c.y.toFixed(2)}, ${f.c.z.toFixed(2)}) ` +
        `Normal=(${f.normal.x.toFixed(2)}, ${f.normal.y.toFixed(2)}, ${f.normal.z.toFixed(2)})`,
    );
  }

  // Lichtkegel rotieren.
  coneRotY += 0.01;
  const coneRot = rotateMatrix(0, coneRotY, 0);

  // --- Rays ---
  const apex = new Vec3();
  const coneLen = 600.0;
  const coneAngle = Math.PI / 60;
  const coneR = coneLen * Math.sin(coneAngle);
  const coneZ = coneLen * Math.cos(coneAngle);

  const rayStyle: PrimitiveStyle = { stroke: "#ff8800", lineWidth: 1 };
  const pointStyle: PrimitiveStyle = { stroke: "#ff0000", pointSize: 5 };

  for (let i = 0; i < coneLines; i++) {
    const a = (2.0 * Math.PI * i) / coneLines;
    const end = new Vec3(
      apex.x + Math.cos(a) * coneR,
      apex.y + Math.sin(a) * coneR,
      apex.z + coneZ,
    );
    const rotatedEnd = rotateAround(end, apex, coneRot);

    const hit = raycastSegment(apex, rotatedEnd, faces);
    const endpoint = hit.isHit ? hit.point : rotatedEnd;

    drawLine(apex.x, apex.y, apex.z, endpoint.x, endpoint.y, endpoint.z, rayStyle);
    drawPoint(endpoint.x, endpoint.y, endpoint.z, pointStyle);
  }
}

/* Start */
try {
  init(screenW, screenH);
} catch (e) {
  console.error(String(e));
}
startAnimation(draw);
