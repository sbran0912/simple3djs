// ====================================================================
// VEKTOREN  (Port von lib-3d.ts: Vec3, Vec2)
//
// Vec3 ist ein 3D-Vektor, Vec2 ein 2D-Vektor mit Skalierungsfaktor (s),
// z. B. fuer Punktgroesse.
// ====================================================================

import type { Matrix4x4 } from "./mat4";

/** Vec3 ist ein 3D-Vektor. */
export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  // ---- Arithmetik ----
  add(v: Vec3): Vec3 {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  /** mag skaliert auf eine bestimmte Ziel-Laenge. Der Nullvektor bleibt null. */
  mag(m: number): Vec3 {
    const length = this.length();
    if (length === 0) {
      return new Vec3();
    }
    return this.scale(m / length);
  }

  /** limit begrenzt die Laenge auf einen Maximalwert. */
  limit(maxLen: number): Vec3 {
    const mSq = this.squaredLength();
    if (mSq > maxLen * maxLen) {
      return this.scale(maxLen / Math.sqrt(mSq));
    }
    return this.clone();
  }

  /** negate kehrt das Vorzeichen um (-this). */
  negate(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  // ---- Produkte & Betrag ----
  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vec3): Vec3 {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }

  squaredLength(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.squaredLength());
  }

  distanceTo(v: Vec3): number {
    return this.sub(v).length();
  }

  // ---- Normalisierung & Interpolation ----
  normalize(): Vec3 {
    const length = this.length();
    if (length === 0) {
      return new Vec3();
    }
    return this.scale(1 / length);
  }

  /** lerp ist die lineare Interpolation: this + (v - this) * t. */
  lerp(v: Vec3, t: number): Vec3 {
    return this.add(v.sub(this).scale(t));
  }

  // ---- Utility ----
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  equals(v: Vec3, epsilon: number): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon
    );
  }

  // ---- Transformation ----
  transform(m: Matrix4x4): Vec3 {
    return new Vec3(
      m[0][0] * this.x + m[0][1] * this.y + m[0][2] * this.z + m[0][3],
      m[1][0] * this.x + m[1][1] * this.y + m[1][2] * this.z + m[1][3],
      m[2][0] * this.x + m[2][1] * this.y + m[2][2] * this.z + m[2][3],
    );
  }

  transformDir(m: Matrix4x4): Vec3 {
    return new Vec3(
      this.x * m[0][0] + this.y * m[0][1] + this.z * m[0][2],
      this.x * m[1][0] + this.y * m[1][1] + this.z * m[1][2],
      this.x * m[2][0] + this.y * m[2][1] + this.z * m[2][2],
    );
  }
}

/** Vec2 ist ein 2D-Vektor mit Skalierungsfaktor (s) fuer z. B. Punktgroesse. */
export class Vec2 {
  constructor(
    public x = 0,
    public y = 0,
    public s = 0,
  ) {}
}
