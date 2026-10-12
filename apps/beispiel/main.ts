import {
  background,
  drawLine,
  drawMesh,
  DrawStyle,
  getHeight,
  getWidth,
  init,
  lookAtMatrix,
  makeCubeMesh,
  makePyramidMesh,
  makeSphereMesh,
  multMatrix,
  perspectiveMatrix,
  rotateMatrix,
  setBatchSort,
  setFog,
  setLightDirection,
  setProjection,
  setView,
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

const fovY = 1.2;
const zNear = 0.1;
const zFar = 1000;

const camPos = new Vec3(50, 100, 200);
const camTarget = new Vec3(0, 0, 0);
const camUp = new Vec3(0, 1, 0);

const sunDir = new Vec3(0.5, 1.0, 0.3);

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

  background([40, 40, 40]);
  setFog(150, 500, 0.25, 0.25, 0.25, 1);

  const view = lookAtMatrix(camPos, camTarget, camUp);
  const proj = perspectiveMatrix(fovY, getWidth() / getHeight(), zNear, zFar);
  setProjection(proj);
  setView(view);

  const camLight = sunDir.transformDir(view);
  setLightDirection(camLight.x, camLight.y, camLight.z);

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
  const scene = rotateMatrix(0, angle, 0);
  drawMesh(cubeMesh, cubeStyle, multMatrix(scene, translateMatrix(cubeX, cubeY, cubeZ)));
  drawMesh(pyramidMesh, pyramidStyle, multMatrix(scene, translateMatrix(pyrX, pyrY, pyrZ)));
  drawMesh(sphereMesh, sphereStyle, multMatrix(scene, translateMatrix(sphX, sphY, sphZ)));
}

/* Start */
try {
  init(screenW, screenH);
} catch (e) {
  console.error(String(e));
}

setBatchSort(true);

startAnimation(draw);
