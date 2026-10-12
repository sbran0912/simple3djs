// ====================================================================
// MESH - reine Zeichen-Geometrie (keine Physik)
//
// triangles sind xyz-Tripel einer Dreiecksliste, lines xyz-Tripel einer
// Linienliste (Endpunktpaare). Die Koordinaten sind lokal (Objektraum); die
// Platzierung passiert beim Zeichnen ueber die Modell-Matrix.
// ====================================================================

import { Vec3 } from "./vec";

export interface Mesh {
  triangles: number[];
  lines: number[];
}

function addTri(out: number[], a: Vec3, b: Vec3, c: Vec3): void {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

/** addQuad trianguliert ein konvexes Viereck als Faecher (a,b,c) + (a,c,d). */
function addQuad(out: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  addTri(out, a, b, c);
  addTri(out, a, c, d);
}

function addLine(out: number[], a: Vec3, b: Vec3): void {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

/** makeCubeMesh erzeugt einen achsenparallelen Wuerfel um den Ursprung. */
export function makeCubeMesh(w: number, h: number, d: number): Mesh {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  const v = [
    new Vec3(-hw, -hh, -hd),
    new Vec3(hw, -hh, -hd),
    new Vec3(hw, hh, -hd),
    new Vec3(-hw, hh, -hd),
    new Vec3(-hw, -hh, hd),
    new Vec3(hw, -hh, hd),
    new Vec3(hw, hh, hd),
    new Vec3(-hw, hh, hd),
  ];

  const faces = [
    [0, 3, 2, 1], // vorne
    [4, 5, 6, 7], // hinten
    [0, 4, 7, 3], // links
    [1, 2, 6, 5], // rechts
    [0, 1, 5, 4], // unten
    [3, 7, 6, 2], // oben
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // vorne
    [4, 5], [5, 6], [6, 7], [7, 4], // hinten
    [0, 4], [1, 5], [2, 6], [3, 7], // Verbindungen
  ];

  const m: Mesh = { triangles: [], lines: [] };
  for (const f of faces) {
    addQuad(m.triangles, v[f[0]], v[f[1]], v[f[2]], v[f[3]]);
  }
  for (const e of edges) {
    addLine(m.lines, v[e[0]], v[e[1]]);
  }
  return m;
}

/**
 * makePyramidMesh erzeugt eine Pyramide mit quadratischer Basis. Die Basis
 * liegt bei y=0 (Mittelpunkt im Ursprung), die Spitze bei y=height.
 */
export function makePyramidMesh(base: number, height: number): Mesh {
  const hb = base / 2;

  const v = [
    new Vec3(-hb, 0, -hb),
    new Vec3(hb, 0, -hb),
    new Vec3(hb, 0, hb),
    new Vec3(-hb, 0, hb),
    new Vec3(0, height, 0),
  ];

  const sides = [
    [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4],
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // Basis
    [0, 4], [1, 4], [2, 4], [3, 4], // Seitenkanten
  ];

  const m: Mesh = { triangles: [], lines: [] };
  for (const t of sides) {
    addTri(m.triangles, v[t[0]], v[t[1]], v[t[2]]);
  }
  addQuad(m.triangles, v[3], v[2], v[1], v[0]); // Basis (CCW von unten)
  for (const e of edges) {
    addLine(m.lines, v[e[0]], v[e[1]]);
  }
  return m;
}

/** makeSphereMesh erzeugt eine Kugel um den Ursprung. */
export function makeSphereMesh(radius: number, slices: number, stacks: number): Mesh {
  if (slices < 3) {
    slices = 3;
  }
  if (stacks < 2) {
    stacks = 2;
  }

  const tau = 2 * Math.PI;
  const point = (i: number, j: number): Vec3 => {
    const theta = (i / stacks) * Math.PI;
    const phi = (j / slices) * tau;
    const r = radius * Math.sin(theta);
    return new Vec3(r * Math.cos(phi), radius * Math.cos(theta), r * Math.sin(phi));
  };

  const m: Mesh = { triangles: [], lines: [] };
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = point(i, j);
      const b = point(i, j + 1);
      const c = point(i + 1, j + 1);
      const d = point(i + 1, j);
      if (i === 0) {
        addTri(m.triangles, a, c, d); // Nordpol
      } else if (i === stacks - 1) {
        addTri(m.triangles, a, b, c); // Suedpol
      } else {
        addQuad(m.triangles, a, b, c, d);
      }
    }
  }

  // Meridiane (Pol zu Pol).
  for (let j = 0; j < slices; j++) {
    for (let i = 0; i < stacks; i++) {
      addLine(m.lines, point(i, j), point(i + 1, j));
    }
  }
  // Breitenringe (ohne die zusammenfallenden Pol-Ringe).
  for (let i = 1; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      addLine(m.lines, point(i, j), point(i, j + 1));
    }
  }
  return m;
}
