# Bibliothek lib3d – Referenz

`lib3d` ist die TypeScript/WebGL2-Fassung der simple3d-Bibliothek. Sie stellt
Szenen-/Kamera-Bündel, Farb-, Mathe- und Mesh-Bausteine bereit und sammelt alle
Zeichenaufrufe eines Frames zu effizienten Batches. Das Zusatzmodul `bodies`
ergänzt Körper um Flächen/Normalen und Schnittabfragen (Raycasting), zeichnet
aber selbst nicht.

- Öffentliche API (Barrel): `import { … } from "../../lib3d/lib3d"`
- Zusatzmodul Körper/Kollision: `import { … } from "../../lib3d/bodies"`
- Typen und Werte werden getrennt importiert (`type`-Import, wegen
  `verbatimModuleSyntax`).

Namenskonvention (Port aus dem TS-Original): Typen/Klassen in `PascalCase`,
Funktionen/Methoden in `camelCase` (bzw. `PascalCase` bei Klassen-Methoden und
Klassen-Konstruktoren), Felder in `camelCase`.

---

## 1. Grundgerüst einer App

Eine App besteht aus `index.html` (Canvas wird von `init` erzeugt) und
`main.ts`:

```ts
import { beginScene, init, makeScene, startAnimation } from "../../lib3d/lib3d";

const scene = makeScene();          // Kamera + Welt-Attribute (Defaults s. u.)

function draw(): void {
  beginScene(scene);                // Background, Nebel, Kamera, Licht
  // ... hier zeichnen ...
}

try {
  init();                           // Canvas + WebGL2-Kontext + Shader
} catch (e) {
  console.error(String(e));
}
startAnimation(draw);               // Animations-Schleife, ruft draw pro Frame
```

**Ablauf pro Frame:** `startAnimation` setzt die Zeit-Uniform, ruft die
übergebene `draw`-Funktion auf und zeichnet danach automatisch alle im Frame
gesammelten Zeichenbefehle. Man zeichnet also *nur* über die `draw*`-Funktionen;
Puffer-/Canvas-Verwaltung übernimmt die Bibliothek.

| Funktion | Bedeutung |
| --- | --- |
| `init()` | Canvas, WebGL2-Kontext, Shader, Batch-Zustand. Die Canvas-Größe folgt dem Fenster (`window.innerWidth/innerHeight`). Wirft bei Fehlern. |
| `startAnimation(draw)` | Startet die Schleife (`requestAnimationFrame`); `draw` wird jedes Frame aufgerufen. |
| `noLoop()` | Stoppt die Animations-Schleife. |
| `getWidth()` / `getHeight()` | Canvas-Größe in Pixeln. |
| `isMouseDown()` | `true`, solange linke Maustaste gedrückt. |
| `isMouseUp()` | einmalig `true` beim Loslassen. |
| `isKeyDown(key)` | `true`, solange die Taste gedrückt ist (Dauerdruck). |
| `isKeyPressed(key)` | einmalig `true` beim Drücken (konsumierend, für Trigger). |

> **Tastatur:** Im Browser gibt es kein Fensterschließen wie im C++-Original.
> **ESC** stoppt die Animations-Schleife (`noLoop()`). Weitere Tasten werden
> pollend im `draw`-Lambda abgefragt (siehe Abschnitt 7).

---

## 2. Koordinatensystem, Kamera und Szene

**Koordinatensystem:** `+Y` zeigt nach oben, die Kamera blickt in `+Z`.
View- und Projection-Matrix laufen im Vertex-Shader; die Modell-Matrix wird pro
Zeichenaufruf als Argument übergeben (kein globaler Modell-Zustand).

```ts
class Camera {
  constructor(
    public pos: Vec3 = new Vec3(50, 100, 200),
    public target: Vec3 = new Vec3(0, 0, 0),
    public up: Vec3 = new Vec3(0, 1, 0),
    public fovY = 1.2,     // vertikales Sichtfeld (Bogenmaß)
    public near = 0.1,
    public far = 1000,
  ) {}
  view(): Matrix4x4;                        // Look-At-Matrix
  projection(aspect: number): Matrix4x4;    // Perspective
}

interface Fog { enabled: boolean; near: number; far: number; color: ColorInput; }

interface Scene {
  cam: Camera;
  sunDir: Vec3;            // Lichtrichtung (Weltraum)
  fog: Fog;                // Tiefen-Nebel
  background: ColorInput;  // z. B. [40, 40, 40]
}

function makeScene(): Scene;   // Scene mit Defaults
```

- `beginScene(scene)` – pro Frame aufrufen. Setzt Hintergrund, (falls
  `fog.enabled`) Nebel, Kamera (`applyCamera`) und die Sonnenrichtung in
  Kamerakoordinaten.
- `applyCamera(cam)` – setzt View + Projection (Aspect aus `getWidth/Height`).
- `setView(m)` / `setProjection(m)` – manuelle Kamera-Matrizen.
- `setFog(near, far, r, g, b, a)` – Tiefen-Nebel direkt.
- `setLightDirection(x, y, z)` – Lichtrichtung (Kamerakoordinaten) fürs
  Flat-Shading.
- `setBatchSort(bool)` – fasst auch nicht-benachbarte Primitive mit gleichem
  Zustand zusammen. **Achtung:** ändert die Zeichenreihenfolge, nur für opake
  Geometrie geeignet. `compactBatch()` sortiert/fasst manuell zusammen.
- `getPendingDrawCalls()` / `getPendingInstancedDrawCalls()` – Diagnose.

---

## 3. Farben

```ts
interface ColorState { r: number; g: number; b: number; a: number; } // 0..1
type ColorInput = string | number | ColorState | number[];
```

`ColorInput`-Formen (überall dort akzeptiert, wo eine Farbe erwartet wird):

| Form | Beispiel | Bedeutung |
| --- | --- | --- |
| Hex-String | `"#44aaff"` / `"#4af"` | Hex-Farbe |
| Zahl | `128` | Graustufe 0..255 |
| `[r,g,b]` | `[255, 128, 0]` | 0..255 |
| `[r,g,b,a]` | `[255,128,0,200]` | 0..255 |
| `ColorState` | `{ r: 0.5, g: 0.2, b: 1, a: 1 }` | bereits 0..1 |

```ts
parseHex("#44aaff"): ColorState;              // Hex -> 0..1
rgb(255, 128, 0, 200): ColorState;            // 0..255 -> 0..1
parseColor(anyColorInput): ColorState;        // beliebige Form -> 0..1
colEq(a, b): boolean;                         // exakter Vergleich
```

---

## 4. Objekte erstellen

Es gibt zwei Wege: **ohne Body** (nur Zeichengeometrie) und **mit Body**
(Mesh + lokale Flächen/Normalen für Kollision/Raycasting). In beiden Fällen wird
die Geometrie als `Mesh` erzeugt und über `drawMesh` gezeichnet.

```ts
interface Mesh {
  triangles: number[]; // xyz-Tripel je Dreieck (9 Zahlen/Dreieck)
  lines: number[];     // xyz-Tripel je Linien-Endpunkt (Paare)
}

// Mesh-Bausteine (lokal um den Ursprung):
makeCubeMesh(w, h, d): Mesh;
makePyramidMesh(base, height): Mesh;         // Basis y=0, Spitze y=height
makeSphereMesh(radius, slices, stacks): Mesh;
```

### 4.1 Objekt **ohne** Body

Das Mesh wird einmal erzeugt und pro Frame mit einer Modell-Matrix gezeichnet.
Das ist der einfachste Fall und ideal, wenn keine Kollision/Raycasting
gebraucht wird.

```ts
const cubeStyle: ShapeStyle = {
  stroke: "#1b1b1b",
  fill: "#d3ff44",
  lineWidth: 1,
  mode: DrawStyle.Both,
};

const cubeMesh = makeCubeMesh(30, 30, 30); // EINMAL erzeugen

let angle = 0;
function draw(): void {
  beginScene(scene);
  angle -= 0.01;

  const model = multMatrix(
    rotateMatrix(0, angle, 0),        // Szene drehen
    translateMatrix(-45, 15, 0),      // Platzieren
  );
  drawMesh(cubeMesh, cubeStyle, model);
}
```

Modell-Matrix-Helfer: `identityMatrix()`, `translateMatrix(dx,dy,dz)`,
`rotateMatrix(ax,ay,az)` (kombiniert `Rz*Ry*Rx`), `multMatrix(a,b)` (`a*b`,
rechts wird zuerst angewendet).

### 4.2 Objekt **mit** Body

Ein `Body` bündelt das Mesh, die daraus abgeleiteten lokalen **Faces** (inkl.
Normalen), Position und Euler-Rotationen – der Träger für Kollision/Raycasting.
Farbe/Linienbreite gehören **nicht** in den Body, sondern in den `ShapeStyle`.

```ts
class Body {
  geometry: Mesh;    // Zeichengeometrie (lokal)
  faces: Face[];     // lokale Faces inkl. Normalen
  pos: Vec3;
  rotX: number; rotY: number; rotZ: number;
  modelMatrix(): Matrix4x4;   // Translation * Rotation
  worldFaces(): Face[];       // Faces in Weltkoordinaten
}

// Faces werden automatisch aus der Geometrie ermittelt:
makeBody(geometry, pos, rotX = 0, rotY = 0, rotZ = 0): Body;
```

```ts
const ballMesh = makeSphereMesh(40, 40, 40);
const ballBody = makeBody(ballMesh, new Vec3(0, 40, 0)); // Faces automatisch

let angle = 0;
function draw(): void {
  beginScene(scene);
  angle += 0.01;
  ballBody.rotY = angle;                          // Body drehen
  drawMesh(ballBody.geometry, ballStyle,          // Rendern wie ohne Body
           ballBody.modelMatrix());               // Körper-Transform nutzen
}
```

**Rendern ist identisch zum Fall ohne Body** – man zeichnet `body.geometry` mit
`body.modelMatrix()`. Der Mehrwert liegt in den Faces:

```ts
body.worldFaces();                              // Faces in Weltkoordinaten
buildFaces(mesh);                               // Faces neu aus einem Mesh
transformFaces(body.faces, body.modelMatrix()); // lokale Faces -> Welt
```

| | ohne Body | mit Body |
| --- | --- | --- |
| Typ | `Mesh` | `Body` (enthält `Mesh`) |
| Erzeugen | `make*Mesh(...)` | `makeBody(mesh, pos, rotX, rotY, rotZ)` |
| Zeichnen | `drawMesh(mesh, style, model)` | `drawMesh(body.geometry, style, body.modelMatrix())` |
| Rotation | Modell-Matrix | `body.rotX/rotY/rotZ` + `modelMatrix()` |
| Kollision/Raycast | nicht möglich | `body.faces`, `body.worldFaces()`, `raycastSegment` |
| Geeignet für | reine Darstellung | Physik, Trefferabfragen, Picking |

---

## 5. Rendermethoden

Alle Zeichenaufrufe nehmen ihre **Modell-Matrix als letztes Argument**
(Default `identityMatrix()`) und sammeln sich im aktuellen Batch.

### 5.1 Zeichenmodi und Style-Objekte

```ts
enum DrawStyle { Stroke = 0, Fill = 1, Both = 2 }

interface PrimitiveStyle {   // für Punkte/Linien
  stroke?: ColorInput;  // Linienfarbe (unbeleuchtet)
  fill?: ColorInput;    // Füllfarbe (beleuchtet)
  lineWidth?: number;   // 0/undefined = Zustand nicht ändern
  pointSize?: number;   // 0/undefined = Zustand nicht ändern
}

interface ShapeStyle extends PrimitiveStyle {  // + Zeichenmodus
  mode?: DrawStyle;    // Default: Stroke
  z?: number;          // Z-Ebene für drawRect
  segments?: number;   // Segmentzahl für drawCircle (0 -> 64)
}
```

Nicht gesetzte Felder (`undefined` bzw. `0`) überschreiben den aktuellen
Low-Level-Zustand **nicht** – Stile können so schrittweise vererbt werden.

### 5.2 Übersicht der Renderfunktionen

| Funktion | Beschreibung |
| --- | --- |
| `drawMesh(mesh, style, model?)` | Mesh mit Fill (beleuchtet) und/oder Drahtgitter. Zentral für alle Mesh-Objekte. |
| `drawMeshInstanced(mesh, style, instances)` | **GPU-Instancing**: dieselbe Geometrie in *einem* Draw-Call mehrfach, je Instanz mit eigener Modell-Matrix und Farbe. |
| `drawPoint(x,y,z, style, model?)` | Einzelner Punkt (`pointSize`). |
| `drawLine(x1,y1,z1,x2,y2,z2, style, model?)` | Einzelne Linie. |
| `drawTriangle(x1..z3, style, model?)` | Dreieck (Fill/Stroke/Both). |
| `drawShape(x1..z4, style, model?)` | Viereck aus 4 Punkten (Fill als 2 Dreiecke, Stroke als Umriss). |
| `drawRect(x,y,w,h, style, model?)` | Rechteck in der X/Y-Ebene auf `style.z`. |
| `drawCircle(x,y,z, radius, style, model?)` | Kreis (`style.segments`; 0 → 64). |
| `drawPolygon(pts, style, model?)` | Konvexes Polygon aus xyz-Tripeln (`pts.length/3` Ecken; Fill als Fächer). |

**GPU-Instancing** (`Instance`):

```ts
interface Instance { model: Matrix4x4; color: ColorState; }

const cubes: Instance[] = positions.map((p, i) => ({
  model: multMatrix(translateMatrix(p.x, p.y, p.z), rotateMatrix(0, angle, 0)),
  color: { r: 0.25 + 0.6 * t, g: 0.45, b: 0.9 - 0.6 * t, a: 1 },
}));
drawMeshInstanced(cubeMesh, cubeStyle, cubes); // EIN Draw-Call für alle
```

> Beim Instancing wird die Farbe aus dem `ShapeStyle` ignoriert; sie kommt aus
> jeder `Instance`.

### 5.3 Low-Level-Zustand und Effekte

Die `draw*`-Fassade ist eine Hülle über Low-Level-Primitiven, die den
*aktuellen* Zeichenzustand verwenden. Wer den Zustand direkt steuern will:

| Zustand | Setter | Default |
| --- | --- | --- |
| Füllfarbe | `fillColor(ColorInput)` | weiß |
| Linienfarbe | `strokeColor(ColorInput)` | schwarz |
| Linienbreite | `strokeWidth(number)` | 1 |
| Punktgröße | `pointSize(number)` | 4 |
| Effekt | `setEffect(EffectMode)` | `EffectMode.Flat` |
| Gradient-Endfarbe | `setGradient(ColorInput)` | – |
| Gradient-Zentrum/Radius | `setGradientCenter(cx,cy,cz,radius)` | – |
| Hintergrund | `background(ColorInput)` | – |

Primitive im Low-Level-Stil (nur bei Bedarf): `point`, `line`, `triangle`,
`shape`, `rect`, `circle`, `polygon` – gleiche Argumente wie `draw*`, aber ohne
Style-Objekt.

**Shader-Effekte** (`enum EffectMode`):

| Wert | Effekt |
| --- | --- |
| `EffectMode.Flat` (0) | einfache Farbe (Default). |
| `EffectMode.Gradient` (1) | radialer Verlauf von der aktuellen Farbe zur `setGradient`-Farbe, ausgehend von `setGradientCenter(...)`. |
| `EffectMode.Pulse` (2) | Grundfarbe mit sinusförmiger Helligkeitspulsation (nutzt die Frame-Zeit). |

```ts
setEffect(EffectMode.Gradient);
setGradient("#ff0000");          // Endfarbe
setGradientCenter(0, 40, 0, 200);
drawMesh(ballMesh, ballStyle);

setEffect(EffectMode.Flat);      // zurück zum Normalzustand
```

---

## 6. Modul `bodies` – Flächen, Normalen, Raycasting

`bodies` liegt als eigenständiges Modul `lib3d/bodies.ts` vor (nicht im
Barrel `lib3d/lib3d` enthalten). Es zeichnet nicht, sondern arbeitet auf
`Mesh`/`Body`:

```ts
interface Face { a: Vec3; b: Vec3; c: Vec3; normal: Vec3; }

buildFaces(mesh): Face[];                        // CCW -> Normale außen
transformFace(face, model): Face;
transformFaces(faces, model): Face[];

interface RayHit { isHit: boolean; t: number; point: Vec3; normal: Vec3; }
raycastSegment(p1, p2, faces): RayHit;           // nächster Schnitt von [p1,p2]

interface ClosestFaceHit {
  point: Vec3; normal: Vec3;
  distance: number;        // |point - p| (unsigned)
  signedDistance: number;  // >0 außen, <0 innen (bzgl. Normale)
}
closestPointToFace(p, face): ClosestFaceHit;
```

```ts
const faces: Face[] = [];
for (const { body } of bodies) {
  faces.push(...body.worldFaces());
}

const hit = raycastSegment(apex, end, faces);
const endpoint = hit.isHit ? hit.point : end;   // Strahl am Treffer kappen

drawLine(apex.x, apex.y, apex.z, endpoint.x, endpoint.y, endpoint.z, rayStyle);
```

---

## 7. Eingaben

### Maus

- `isMouseDown()` – `true`, solange die linke Taste gedrückt ist.
- `isMouseUp()` – einmalig `true` beim Loslassen (konsumierend).

### Tastatur (Polling)

Tastatur wird **pollend** im `draw`-Lambda abgefragt (kein Callback in der App
nötig). **ESC** stoppt die Schleife (`noLoop()`).

- `isKeyDown(key)` – `true`, solange die Taste gedrückt ist → **laufende
  Steuerung** (Kamera, Bewegung pro Frame).
- `isKeyPressed(key)` – einmalig `true` beim Drücken; der Aufruf
  **konsumiert** die Kante (wie `isMouseUp`) → **Trigger** (Effekt umschalten,
  Pause).

`key` ist ein `KeyboardEvent.code` (layout-unabhängig, physische Taste). Das
`enum Key` (in `renderer.ts`, re-exportiert über `lib3d`) liefert gängige
Codes als Konstanten – jeder andere `code`-String wird ebenfalls akzeptiert.

```ts
import { isKeyDown, isKeyPressed, Key } from "../../lib3d/lib3d";

let camAngle = 0;
function draw(): void {
  const speed = 0.03;
  if (isKeyDown(Key.ArrowLeft))  camAngle -= speed;
  if (isKeyDown(Key.ArrowRight)) camAngle += speed;

  if (isKeyPressed(Key.Space)) {   // nur einmal pro Druck
    setEffect(EffectMode.Pulse);
  }
}
```

> Hinweis: `isKeyPressed` liefert die Kante nur **einmal** – wer denselben
> Tastendruck in mehreren Zweigen auswerten will, liest sie in eine Variable
> und verzweigt darauf.

---

## 8. Mathe-Helfer

**`Vec3`** – 3D-Vektor (`x, y, z`):

`add`, `sub`, `scale`, `mag(m)`, `limit(max)`, `negate`, `dot`, `cross`,
`squaredLength`, `length`, `distanceTo`, `normalize`, `lerp(v,t)`, `clone`,
`equals(v,eps)`, `transform(Matrix4x4)`, `transformDir(Matrix4x4)`.

**`Vec2`** – 2D-Vektor mit Skalierungsfaktor `s` (z. B. Punktgröße).

**`Matrix4x4`** = `number[][]`, **row-major** (für WebGL intern in
column-major konvertiert): `translateMatrix`, `rotateMatrix` (`Rz*Ry*Rx`),
`multMatrix`, `identityMatrix`, `viewWorldMatrix`, `lookAtMatrix` (blickt in
`+Z`), `worldToCamera`, `rotateAround(point, pivot, rotation)`,
`perspectiveMatrix(fovY, aspect, near, far)`.

**`math.ts`**: `project(fov, Vec3)` (3D→Bildschirm, für 2D-Overlays),
`constrain(value, lo, hi)`, `random(n1, n2)` (ganzzahlig, `[n1,n2)`),
`randomFloat(lo, hi)` (Gleitkomma, `[lo,hi)`).

---

## 9. Vollständiges Minimalbeispiel (mit Body)

```ts
import {
  beginScene,
  DrawStyle,
  drawMesh,
  init,
  makeScene,
  makeSphereMesh,
  startAnimation,
  Vec3,
  type ShapeStyle,
} from "../../lib3d/lib3d";
import { makeBody } from "../../lib3d/bodies";

const scene = makeScene();
scene.cam.pos = new Vec3(50, 100, 200);
scene.sunDir = new Vec3(0.5, 1.0, 0.3);
scene.fog = { enabled: true, near: 100, far: 400, color: { r: 0.25, g: 0.25, b: 0.25, a: 1 } };

const ballStyle: ShapeStyle = {
  stroke: "#2f3a00",
  fill: "#d3ff44",
  lineWidth: 1,
  mode: DrawStyle.Both,
};

const ball = makeBody(makeSphereMesh(40, 40, 40), new Vec3(0, 40, 0));
let angle = 0;

function draw(): void {
  beginScene(scene);
  ball.rotY = angle += 0.01;
  drawMesh(ball.geometry, ballStyle, ball.modelMatrix());
}

try { init(); } catch (e) { console.error(String(e)); }
startAnimation(draw);
```

Weitere vollständige Beispiele liegen unter `apps/`:
`beispiel` (Meshes + Szenenrotation), `vorlage` (Body + Gitter),
`instanzen` (GPU-Instancing), `ray` (Body-Faces + Raycasting).

---

## 10. Hinweise & Fallstricke

- **Keine globale Modell-Matrix:** Position/Rotation immer als `model`-Argument
  bzw. über `Body.modelMatrix()` übergeben.
- **Stile erben:** Nur gesetzte Felder überschreiben den Zustand. Für
  reproduzierbare Ergebnisse im Zweifel Farbe explizit setzen.
- **Batching:** Alle `draw*`-Aufrufe eines Frames werden gesammelt und am
  Frame-Ende gezeichnet. `background(...)` zeichnet den Batch vorher aus.
- **`setBatchSort(true)`** nur für opake Geometrie (ändert die
  Zeichenreihenfolge; Blending wäre dann nicht korrekt sortiert).
- **Meshes wiederverwenden:** Geometrie einmal erzeugen und über alle
  Frames/Instanzen teilen – nicht pro Frame neu bauen.
- **Body vs. Mesh:** Renderdaten (Farbe/Linienbreite) gehören in den
  `ShapeStyle`, nicht in den `Body`.
- **Tastatur:** `key` ist `KeyboardEvent.code` (physische Taste), nicht
  `event.key` – dadurch layout-unabhängig. ESC beendet die Schleife.
