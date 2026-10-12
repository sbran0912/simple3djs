import {
  beginScene,
  drawLine,
  drawMesh,
  DrawStyle,
  init,
  makeCubeMesh,
  makePyramidMesh,
  makeScene,
  makeSphereMesh,
  multMatrix,
  rotateMatrix,
  setBatchSort,
  startAnimation,
  translateMatrix,
  Vec3,
  type PrimitiveStyle,
  type ShapeStyle,
} from "../../lib3d/lib3d";

// ====================================================================
// Beispiel ohne Physik: Wuerfel, Pyramide und Kugel.
//
// Alle Koerper werden ueber einmal erzeugte Meshes (drawMesh) gezeichnet.
// Die gesamte Szene dreht sich starr um die Y-Achse - von oben (+Y) gesehen
// im Uhrzeigersinn, also mit fallendem Winkel (angle -= speed).
// ====================================================================

const screenW = 1200;
const screenH = 800;

const scene = makeScene();
scene.cam.pos = new Vec3(50, 100, 200);
scene.cam.target = new Vec3(0, 0, 0);
scene.cam.up = new Vec3(0, 1, 0);
scene.cam.fovY = 1.2;
scene.cam.near = 0.1;
scene.cam.far = 1000;
scene.sunDir = new Vec3(0.5, 1.0, 0.3);
scene.fog = { enabled: true, near: 150, far: 500, color: { r: 0.25, g: 0.25, b: 0.25, a: 1 } };

const cubeStyle: ShapeStyle = {
  stroke: "#1b1b1b",
  fill: "#d3ff44",
  lineWidth: 1,
  mode: DrawStyle.Both,
};
const pyramidStyle: ShapeStyle = {
  stroke: "#2a1400",
  fill: "#ff8844",
  lineWidth: 1,
  mode: DrawStyle.Both,
};
const sphereStyle: ShapeStyle = {
  stroke: "#06263f",
  fill: "#44aaff",
  lineWidth: 1,
  mode: DrawStyle.Both,
};
const gridStyle: PrimitiveStyle = {
  stroke: "#777774",
  lineWidth: 1,
};

// Feste Positionen (lokal, Weltkoordinaten vor der Szenen-Rotation).
const cubeX = -45, cubeY = 15, cubeZ = 0, cubeSize = 30;
const pyrX = 45, pyrY = 0, pyrZ = 0, pyrBase = 34, pyrHeight = 48;
const sphX = 0, sphY = 18, sphZ = -45, sphRadius = 16;

// Meshes EINMAL erzeugen und im Frame teilen. Render- und (spaetere)
// Kollisionsgeometrie kommen damit aus derselben Quelle.
const cubeMesh = makeCubeMesh(cubeSize, cubeSize, cubeSize);
const pyramidMesh = makePyramidMesh(pyrBase, pyrHeight);
const sphereMesh = makeSphereMesh(sphRadius, 24, 12);

// Bodengitter (fest, dient als Referenz fuer die Drehung).
const gridSize = 600;
const gridCells = 24;

let angle = 0;

let fpsFrames = 0;
let fpsLastTime = performance.now();

function updateFps(): void {
  fpsFrames++;
  const now = performance.now();
  const elapsed = now - fpsLastTime;
  if (elapsed >= 500) {
    console.log(`FPS: ${Math.floor((fpsFrames * 1000) / elapsed)}`);
    fpsFrames = 0;
    fpsLastTime = now;
  }
}

/* Loop */
function draw(): void {
  updateFps();

  beginScene(scene);

  // Gesamte Szene im Uhrzeigersinn drehen (von oben gesehen).
  angle -= 0.01;

  // Bodengitter (fest, XZ-Ebene bei y=0) als Referenz.
  const half = gridSize / 2;
  const step = gridSize / gridCells;
  for (let i = 0; i <= gridCells; i++) {
    const p = -half + i * step;
    drawLine(p, 0, -half, p, 0, half, gridStyle);
    drawLine(-half, 0, p, half, 0, p, gridStyle);
  }

  // Szenen-Rotation als explizite Modell-Matrix; Position je Koerper dazu.
  const sceneRot = rotateMatrix(0, angle, 0);
  drawMesh(cubeMesh, cubeStyle, multMatrix(sceneRot, translateMatrix(cubeX, cubeY, cubeZ)));
  drawMesh(pyramidMesh, pyramidStyle, multMatrix(sceneRot, translateMatrix(pyrX, pyrY, pyrZ)));
  drawMesh(sphereMesh, sphereStyle, multMatrix(sceneRot, translateMatrix(sphX, sphY, sphZ)));
}

/* Start */
try {
  init(screenW, screenH);
} catch (e) {
  console.error(String(e));
}

setBatchSort(true);

startAnimation(draw);
