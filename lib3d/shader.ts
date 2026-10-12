// =================================================================
// SHADER  (Port von lib-wgl.ts)
//
// Unterschied zum Desktop-Original: WebGL2 / GLSL ES 3.00. Es gibt keine
// GL_GLEXT_PROTOTYPES und keinen externen Loader; der Shader-Code wird als
// String an den WebGL2-Kontext uebergeben.
// =================================================================

import type { GL } from "./gl";

/*
 * Vertex-Shader: 3D-Transformation ueber View- und Projection-Matrix.
 * Modus 0 (uInstanced == 0): aPos ist bereits Weltkoordinate (Modell-Matrix
 *   wurde auf der CPU gebacken), Farbe kommt aus aColor.
 * Modus 1 (uInstanced == 1): aPos ist lokale Mesh-Geometrie, die pro Instanz
 *   mit aInstModel transformiert wird; Farbe kommt aus aInstColor.
 */
export const kVertSrc = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
layout(location = 2) in mat4 aInstModel;
layout(location = 6) in vec4 aInstColor;
uniform mat4 uView;
uniform mat4 uProjection;
uniform float uPointSize;
uniform int uInstanced;

out vec3 vCamPos;
out vec4 vColor;

void main() {
    vec4 world;
    if (uInstanced == 1) {
        world = aInstModel * vec4(aPos, 1.0);
        vColor = aInstColor;
    } else {
        world = vec4(aPos, 1.0);
        vColor = aColor;
    }
    vec4 camPos = uView * world;
    vCamPos = camPos.xyz;
    gl_Position = uProjection * camPos;
    gl_PointSize = uPointSize;
}
`;

/*
 * Fragment-Shader:
 * uMode  0 = flat      - einfache Farbe uColor
 * uMode  1 = gradient  - radialer Verlauf (vom Zentrum in Kamera-Koordinaten)
 * uMode  2 = pulse     - flat mit sinusfoermiger Helligkeitspulsation
 * uLighted == 1 -> Flat-Shading (Beleuchtung).
 */
export const kFragSrc = `#version 300 es
precision highp float;

in vec3 vCamPos;
in vec4 vColor;
out vec4 fragColor;

uniform int   uMode;
uniform vec4  uColor;
uniform vec4  uColor2;
uniform float uTime;
uniform vec3  uShapeCenter;
uniform float uShapeRadius;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4  uFogColor;
uniform int   uLighted;
uniform vec3  uLightDir;

void main() {
  vec3 base = uColor.rgb;

  if (uMode == 0) {
    // flat - Basis bleibt uColor (fuer flache Primitive ist uColor weiss,
    // die eigentliche Farbe steckt in vColor)
  } else if (uMode == 1) {
    float d = distance(vCamPos, uShapeCenter);
    float t = clamp(d / max(uShapeRadius, 1.0), 0.0, 1.0);
    base = mix(uColor, uColor2, t).rgb;
  } else if (uMode == 2) {
    float brightness = 0.6 + 0.4 * sin(uTime * 3.0);
    base = uColor.rgb * brightness;
  }

  base *= vColor.rgb;

  if (uLighted == 1) {
    vec3 n = normalize(cross(dFdy(vCamPos), dFdx(vCamPos)));
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    base *= 0.25 + 0.75 * diff;
  }

  float depth = vCamPos.z;
  float fog_t = clamp((depth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  fragColor = mix(vec4(base, uColor.a * vColor.a), uFogColor, fog_t);
}
`;

/** compileShader kompiliert einen einzelnen GLSL-Shader. */
function compileShader(gl: GL, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("shader konnte nicht erstellt werden");
  }
  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error("shader-fehler: " + log);
  }
  return shader;
}

/** createProgram verknuepft Vertex- und Fragment-Shader zu einem GL-Programm. */
export function createProgram(gl: GL, vertSrc: string, fragSrc: string): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("programm konnte nicht erstellt werden");
  }
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    throw new Error("programm-fehler: " + log);
  }
  return program;
}
