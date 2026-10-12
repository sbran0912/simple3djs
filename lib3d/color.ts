// ====================================================================
// FARBE  (Port von lib-wgl.ts: parseColor + ColorState)
// ====================================================================

/** ColorState ist eine RGBA-Farbe mit Werten 0..1. */
export interface ColorState {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * ColorInput kapselt eine der parseColor-Formen:
 *   - Hex-String        -> "#rgb" / "#rrggbb"
 *   - 1 Zahl            -> Graustufe 0..255
 *   - 3 Zahlen          -> [r,g,b] 0..255
 *   - 4 Zahlen          -> [r,g,b,a] 0..255
 *   - ColorState        -> bereits geparst
 */
export type ColorInput = string | number | ColorState | number[];

function hexVal(c: string): number {
  if (c >= "0" && c <= "9") {
    return c.charCodeAt(0) - "0".charCodeAt(0);
  }
  if (c >= "a" && c <= "f") {
    return c.charCodeAt(0) - "a".charCodeAt(0) + 10;
  }
  if (c >= "A" && c <= "F") {
    return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
  }
  return -1;
}

/** parseHex parst einen Hex-Farbstring in einen ColorState. */
export function parseHex(s: string): ColorState {
  let h = s;
  if (h.length > 0 && h[0] === "#") {
    h = h.slice(1);
  }
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) {
    return { r: 1, g: 1, b: 1, a: 1 };
  }

  let n = 0;
  for (const c of h) {
    const v = hexVal(c);
    if (v < 0) {
      return { r: 1, g: 1, b: 1, a: 1 };
    }
    n = (n << 4) | v;
  }

  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
    a: 1,
  };
}

/** rgb erzeugt einen ColorState aus 0..255-Werten (Alpha optional, Default 255). */
export function rgb(r: number, g: number, b: number, a = 255): ColorState {
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

/** parseColor parst eine der ColorInput-Formen in einen ColorState (0..1). */
export function parseColor(value: ColorInput): ColorState {
  if (typeof value === "string") {
    return parseHex(value);
  }
  if (typeof value === "number") {
    const g = value / 255;
    return { r: g, g, b: g, a: 1 };
  }
  if (Array.isArray(value)) {
    if (value.length === 1) {
      const g = value[0] / 255;
      return { r: g, g, b: g, a: 1 };
    }
    if (value.length === 3) {
      return { r: value[0] / 255, g: value[1] / 255, b: value[2] / 255, a: 1 };
    }
    if (value.length === 4) {
      return {
        r: value[0] / 255,
        g: value[1] / 255,
        b: value[2] / 255,
        a: value[3] / 255,
      };
    }
    return { r: 1, g: 1, b: 1, a: 1 };
  }
  return value;
}

/** colEq vergleicht zwei Farbzustaende exakt. */
export function colEq(a: ColorState, b: ColorState): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
