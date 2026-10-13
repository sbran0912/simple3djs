import {
  beginScene,
  drawLine,
  drawMeshInstanced,
  DrawStyle,
  identityMatrix,
  init,
  type Instance,
  makeCubeMesh,
  makeScene,
  makeSphereMesh,
  multMatrix,
  rotateMatrix,
  startAnimation,
  translateMatrix,
  Vec3,
  type ColorState,
  type PrimitiveStyle,
  type ShapeStyle,
} from "../../lib3d/lib3d";

// ====================================================================
// Beispiel: GPU-Instancing.
//
// Ein Raster aus Wuerfeln und ein Ring aus Kugeln werden mit je EINEM
// Instancing-Draw-Call gezeichnet (statt pro Objekt). Jede Instance traegt
// ihre eigene Modell-Matrix und Farbe. Die gesamte Szene dreht sich - von
// oben (+Y) gesehen - im Uhrzeigersinn.
// ====================================================================

const scene = makeScene();
scene.cam.pos = new Vec3(120, 240, 460);
scene.cam.target = new Vec3(0, 0, 0);
scene.cam.up = new Vec3(0, 1, 0);
scene.cam.fovY = 1.2;
scene.cam.near = 0.1;
scene.cam.far = 2000;
scene.sunDir = new Vec3(0.5, 1.0, 0.3);
scene.fog = { enabled: true, near: 400, far: 1200, color: { r: 0.25, g: 0.25, b: 0.25, a: 1 } };

const cubeStyle: ShapeStyle = {
  stroke: "#101010",
  fill: "#ffffff", // wird pro Instance ueberschrieben
  lineWidth: 1,
  mode: DrawStyle.Both,
};
const sphereStyle: ShapeStyle = {
  stroke: "#101010",
  fill: "#ffffff",
  lineWidth: 1,
  mode: DrawStyle.Both,
};
const gridStyle: PrimitiveStyle = {
  stroke: "#777774",
  lineWidth: 1,
};

// --- Wuerfel-Raster ---
const gridN = 14;
const gridSpacing = 24;
const cubeSize = 12;
const gridOffset = (-(gridN - 1) * gridSpacing) / 2;

const cubePos: Vec3[] = [];
const cubeCol: ColorState[] = [];
for (let ix = 0; ix < gridN; ix++) {
  for (let iz = 0; iz < gridN; iz++) {
    const px = gridOffset + ix * gridSpacing;
    const pz = gridOffset + iz * gridSpacing;
    cubePos.push(new Vec3(px, cubeSize / 2, pz));
    const t = ix / (gridN - 1);
    cubeCol.push({ r: 0.25 + 0.6 * t, g: 0.45, b: 0.9 - 0.6 * t, a: 1 });
  }
}

// --- Kugel-Ring ---
const ringCount = 28;
const ringRadius = 240;
const sphereRadius = 11;
const sphereY = 34;

const ringPos: Vec3[] = [];
const ringCol: ColorState[] = [];
for (let i = 0; i < ringCount; i++) {
  const a = (i / ringCount) * 2.0 * Math.PI;
  ringPos.push(new Vec3(ringRadius * Math.cos(a), sphereY, ringRadius * Math.sin(a)));
  const t = i / ringCount;
  ringCol.push({ r: 0.9 - 0.5 * t, g: 0.8 * t + 0.2, b: 0.35, a: 1 });
}

// Meshes EINMAL erzeugen und ueber alle Instanzen teilen.
const cubeMesh = makeCubeMesh(cubeSize, cubeSize, cubeSize);
const sphereMesh = makeSphereMesh(sphereRadius, 12, 6);

// Bodengitter.
const gridSize = 800;
const gridCells = 32;

let angle = 0;
const cubeInstances: Instance[] = cubePos.map((_, i) => ({
  model: identityMatrix(),
  color: cubeCol[i],
}));
const ringInstances: Instance[] = ringPos.map((_, i) => ({
  model: identityMatrix(),
  color: ringCol[i],
}));

let fpsFrames = 0;
let fpsLastTime = performance.now();

function updateFps(): void {
  fpsFrames++;
  const now = performance.now();
  const elapsed = now - fpsLastTime;
  if (elapsed >= 500) {
    console.log(
      `FPS: ${Math.floor((fpsFrames * 1000) / elapsed)}  Instanzen: ${cubeInstances.length + ringInstances.length}`,
    );
    fpsFrames = 0;
    fpsLastTime = now;
  }
}

/* Loop */
function draw(): void {
  updateFps();

  beginScene(scene);

  // Szene im Uhrzeigersinn drehen (von oben gesehen).
  angle -= 0.01;

  // Bodengitter (fest).
  const half = gridSize / 2;
  const step = gridSize / gridCells;
  for (let i = 0; i <= gridCells; i++) {
    const p = -half + i * step;
    drawLine(p, 0, -half, p, 0, half, gridStyle);
    drawLine(-half, 0, p, half, 0, p, gridStyle);
  }

  // Instanz-Matrizen aktualisieren: Szene-Rotation * Platzierung * Spin.
  const sceneRot = rotateMatrix(0, angle, 0);
  const spin = rotateMatrix(0, angle * 2.0, 0);
  for (let i = 0; i < cubePos.length; i++) {
    const place = translateMatrix(cubePos[i].x, cubePos[i].y, cubePos[i].z);
    cubeInstances[i].model = multMatrix(multMatrix(sceneRot, place), spin);
    cubeInstances[i].color = cubeCol[i];
  }
  for (let i = 0; i < ringPos.length; i++) {
    const place = translateMatrix(ringPos[i].x, ringPos[i].y, ringPos[i].z);
    ringInstances[i].model = multMatrix(sceneRot, place);
    ringInstances[i].color = ringCol[i];
  }

  // Je EIN Instancing-Draw-Call fuer alle Wuerfel bzw. Kugeln.
  drawMeshInstanced(cubeMesh, cubeStyle, cubeInstances);
  drawMeshInstanced(sphereMesh, sphereStyle, ringInstances);
}

/* Start */
try {
  init();
} catch (e) {
  console.error(String(e));
}

startAnimation(draw);
