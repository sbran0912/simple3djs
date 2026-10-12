// ====================================================================
// ZENTRALE OPENGL-/WEBGL-BASIS
//
// WebGL2 entspricht funktional dem Desktop-OpenGL-3.3-Core der C++-Version
// (GLSL ES 3.00, VAOs, GPU-Instancing). Die wenigen GL-Enum-Werte, die
// bereits beim Sammeln der Batch benoetigt werden (ohne Kontext), sind hier
// als Konstanten hinterlegt; alle uebrigen Konstanten kommen vom Kontext.
// ====================================================================

export type GL = WebGL2RenderingContext;

export const GL_POINTS = 0x0000;
export const GL_LINES = 0x0001;
export const GL_LINE_LOOP = 0x0002;
export const GL_TRIANGLES = 0x0004;
