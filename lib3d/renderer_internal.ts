// ====================================================================
// INTERNE BATCH-SAMMEL-HELFER (siehe draw.ts)
//
// Diese Funktionen sammeln fertige Float-Arrays (x,y,z-Tripel) samt einer
// Modell-Matrix, die beim Sammeln in die Vertices gebacken wird. Sie werden
// von der Zeichen-Fassade (draw.ts, z. B. drawMesh) benutzt. Flaechen werden
// beleuchtet, Linien nicht. Nicht Teil der oeffentlichen API (siehe lib3d.ts).
// ====================================================================

export {
  submitTriangles,
  submitLines,
  submitInstanced,
} from "./renderer";
