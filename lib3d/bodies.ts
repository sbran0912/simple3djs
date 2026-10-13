// ====================================================================
// BODIES - Flaechen/Normalen und Schnittabfragen (Raycasting)
//
// Separates Modul (ohne lib3d-Aenderungen). Ermittelt aus der Dreiecksliste
// eines Meshes die Flaechen inklusive Normalen (faces) und bietet Strecken-/
// Strahl-Schnitttests darauf an. Das Modul zeichnet NICHT; das Rendern bleibt
// bei lib3d (drawMesh).
// ====================================================================

import {
  type Matrix4x4,
  multMatrix,
  rotateMatrix,
  translateMatrix,
} from "./mat4";
import { type Mesh } from "./mesh";
import { Vec3 } from "./vec";

/** Face ist ein Dreieck eines Meshes samt (normierter) Flaechennormale. */
export interface Face {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  normal: Vec3;
}

/**
 * buildFaces ermittelt aus der Dreiecksliste (9 Floats je Dreieck, xyz-Tripel)
 * eines Meshes die Faces inklusive Normalen. Windungsreihenfolge CCW -> die
 * Normale zeigt nach aussen.
 */
export function buildFaces(mesh: Mesh): Face[] {
  const t = mesh.triangles;
  const faces: Face[] = [];

  for (let i = 0; i + 8 < t.length; i += 9) {
    const a = new Vec3(t[i + 0], t[i + 1], t[i + 2]);
    const b = new Vec3(t[i + 3], t[i + 4], t[i + 5]);
    const c = new Vec3(t[i + 6], t[i + 7], t[i + 8]);
    faces.push({
      a,
      b,
      c,
      normal: b.sub(a).cross(c.sub(a)).normalize(),
    });
  }
  return faces;
}

/** transformFace bringt ein Face mit einer Modell-Matrix in den Weltraum. */
export function transformFace(face: Face, model: Matrix4x4): Face {
  return {
    a: face.a.transform(model),
    b: face.b.transform(model),
    c: face.c.transform(model),
    normal: face.normal.transformDir(model).normalize(),
  };
}

/** transformFaces bringt Faces mit einer Modell-Matrix in den Weltraum. */
export function transformFaces(faces: Face[], model: Matrix4x4): Face[] {
  return faces.map((f) => transformFace(f, model));
}

/** RayHit beschreibt den naechsten Treffer einer Strecke. */
export interface RayHit {
  isHit: boolean;
  t: number; // Parameter entlang der Strecke, 0..1
  point: Vec3; // Trefferpunkt
  normal: Vec3; // Face-Normale am Treffer
}

/**
 * rayTriangle ist der Moeller-Trumbore-Schnitt einer Strecke [p1,p2] mit einem
 * Dreieck. Liefert true und t (Parameter 0..1) bei einem Treffer.
 */
function rayTriangle(
  p1: Vec3,
  dir: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): { hit: boolean; t: number } {
  const e1 = b.sub(a);
  const e2 = c.sub(a);
  const p = dir.cross(e2);
  const det = e1.dot(p);
  if (Math.abs(det) < 1e-12) {
    return { hit: false, t: 0 }; // Strecke parallel zur Face
  }
  const inv = 1.0 / det;
  const tvec = p1.sub(a);
  const u = tvec.dot(p) * inv;
  if (u < 0.0 || u > 1.0) {
    return { hit: false, t: 0 };
  }
  const q = tvec.cross(e1);
  const v = dir.dot(q) * inv;
  if (v < 0.0 || u + v > 1.0) {
    return { hit: false, t: 0 };
  }
  const t = e2.dot(q) * inv;
  return { hit: t >= 0.0 && t <= 1.0, t };
}

/**
 * raycastSegment liefert den naechsten Schnitt der Strecke [p1,p2] mit den
 * Faces. Ohne Treffer ist isHit == false.
 */
export function raycastSegment(p1: Vec3, p2: Vec3, faces: Face[]): RayHit {
  const hit: RayHit = {
    isHit: false,
    t: 0,
    point: new Vec3(),
    normal: new Vec3(),
  };
  const dir = p2.sub(p1);
  if (dir.squaredLength() <= 0) {
    return hit;
  }

  let bestT = 1.0;
  for (const f of faces) {
    const r = rayTriangle(p1, dir, f.a, f.b, f.c);
    if (!r.hit) {
      continue;
    }
    if (r.t > bestT) {
      continue;
    }
    bestT = r.t;
    hit.isHit = true;
    hit.t = r.t;
    hit.point = p1.add(dir.scale(r.t));
    hit.normal = f.normal;
  }
  return hit;
}

/** ClosestFaceHit beschreibt den naechsten Punkt auf einem Face zu einem Punkt. */
export interface ClosestFaceHit {
  point: Vec3; // naechster Punkt auf dem Face
  normal: Vec3; // Flaechennormale (Aussenseite)
  distance: number; // Abstand |point - p| (unsigned)
  signedDistance: number; // >0 ausserhalb, <0 innerhalb (bzgl. Normal)
}

/**
 * closestPointOnTriangle ermittelt den naechsten Punkt auf dem Dreieck (a,b,c)
 * zu p. Es kommen nur drei Faelle in Frage: naechste Ecke, naechste Kante oder
 * ein innerer Punkt (Ericson, Real-Time Collision Detection, 5.1.5).
 */
function closestPointOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = b.sub(a);
  const ac = c.sub(a);
  const ap = p.sub(a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) {
    return a; // Ecke A
  }

  const bp = p.sub(b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) {
    return b; // Ecke B
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return a.add(ab.scale(d1 / (d1 - d3))); // Kante AB
  }

  const cp = p.sub(c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) {
    return c; // Ecke C
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return a.add(ac.scale(d2 / (d2 - d6))); // Kante AC
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return b.add(c.sub(b).scale(w)); // Kante BC
  }

  // Inneres: baryzentrische Koordinaten (u, v, w), u = 1 - v - w.
  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return a.add(ab.scale(v)).add(ac.scale(w));
}

/**
 * closestPointToFace liefert den Punkt auf dem Face (Dreieck a,b,c), der einem
 * Abfragepunkt p am naechsten liegt, samt Normale und Abstand.
 */
export function closestPointToFace(p: Vec3, face: Face): ClosestFaceHit {
  const point = closestPointOnTriangle(p, face.a, face.b, face.c);
  return {
    point,
    normal: face.normal,
    distance: p.distanceTo(point),
    signedDistance: p.sub(point).dot(face.normal),
  };
}

/**
 * Body ist ein platzierbarer, kollisionsfaehiger Koerper: Mesh + lokale Faces
 * + Transform. Die Darstellung (Farbe/Linienbreite) liegt beim Aufrufer.
 */
export class Body {
  geometry: Mesh; // Zeichengeometrie (lokal)
  faces: Face[]; // lokale Faces (inkl. Normalen)
  pos: Vec3;
  rotX: number;
  rotY: number;
  rotZ: number;

  constructor(
    geometry: Mesh,
    pos: Vec3,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
  ) {
    this.geometry = geometry;
    this.faces = buildFaces(geometry);
    this.pos = pos;
    this.rotX = rotX;
    this.rotY = rotY;
    this.rotZ = rotZ;
  }

  /** modelMatrix ist die Modellmatrix (Translation * Rotation). */
  modelMatrix(): Matrix4x4 {
    const t = translateMatrix(this.pos.x, this.pos.y, this.pos.z);
    if (this.rotX === 0 && this.rotY === 0 && this.rotZ === 0) {
      return t;
    }
    return multMatrix(t, rotateMatrix(this.rotX, this.rotY, this.rotZ));
  }

  /** worldFaces liefert die Faces in Weltkoordinaten. */
  worldFaces(): Face[] {
    return transformFaces(this.faces, this.modelMatrix());
  }
}

/**
 * makeBody erzeugt einen Body aus einem Mesh. Die Faces werden automatisch
 * aus der Geometrie ermittelt (Single Source of Truth).
 */
export function makeBody(
  geometry: Mesh,
  pos: Vec3,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
): Body {
  return new Body(geometry, pos, rotX, rotY, rotZ);
}
