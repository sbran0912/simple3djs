# Build-Prozess

Dieses Projekt ist die **TypeScript/WebGL2-Fassung** von simple3d. Es wird mit
**Bun** gebündelt: Die Bibliothek (`lib3d/`) und die Anwendungen
(`apps/`) liegen als ES-Module vor; pro App entsteht ein gebündeltes
Web-Artefakt in `dist/<name>/`.

> Für die Benutzung der Bibliothek (Objekte mit/ohne Body, Rendermethoden,
> Tastatureingaben) siehe [`docs/library.md`](library.md).

## Verzeichnisstruktur

```
.
├── Makefile          Build-Regeln (Bun)
├── lib3d/            Bibliothek (TS-Module)
│   ├── lib3d.ts      Umbrella-/Barrel-Modul (öffentliche API)
│   ├── renderer.ts   Setup, Zustand, 3D-Primitive, Eingaben
│   ├── draw.ts       Zeichen-Fassade (draw*)
│   ├── bodies.ts     Zusatzmodul (Faces, Raycasting)
│   ├── color.ts mesh.ts vec.ts mat4.ts math.ts shader.ts …
├── apps/             Anwendungen, je App ein Ordner
│   ├── vorlage/      { index.html, main.ts }
│   ├── beispiel/
│   ├── instanzen/
│   └── ray/
├── tests/            lib3d_test.ts (reines Bun-Skript)
└── dist/             Build-Ausgabe je App (index.html + gebündeltes JS)
```

Die Bibliothek besteht aus **allen** `lib3d/*.ts` – neue
Module werden automatisch über eine Wildcard im Makefile erfasst. Eine neue
App braucht einen Ordner in `apps/` mit `index.html` + `main.ts` und einen
Eintrag in `APP_NAMES` (siehe unten).

## Voraussetzungen

- **Bun** (Bundler + Runtime + Testrunner). Kein `node_modules` nötig, keine
  weitere Toolchain – Bun transpiliert und bündelt nativ.
- Ein Browser mit **WebGL2** zum Ausführen.

## Targets

| Befehl | Wirkung |
| --- | --- |
| `make` / `make all` | Baut **alle** Apps nach `dist/<name>/` (Standardziel). |
| `make build` | wie `make` – alle Apps bauen. |
| `make build-<name>` | Baut nur eine einzelne App, z. B. `make build-ray`. |
| `make run-<name>` | Startet einen **Dev-Server** für die App (Bun `--hot`), z. B. `make run-ray`. |
| `make test` | Führt die Bibliothekstests aus (`bun run tests/lib3d_test.ts`). |
| `make clean` | Löscht `dist/`. |

Verfügbare App-Namen: `vorlage`, `beispiel`, `instanzen`, `ray`.

### Beispiele

```bash
make                 # alle Apps nach dist/ bauen
make build-ray       # nur die App "ray" bauen
make run-ray         # Dev-Server für "ray" (Hot Reload)
make test            # Bibliothekstests
make clean           # dist/ löschen
```

Die gebauten Dateien liegen unter `dist/<name>/`; geöffnet wird jeweils die
`dist/<name>/index.html`. Beim Dev-Server liefert Bun die App direkt aus.

## Wie gebaut wird

Pro App wird die `index.html` als Einstiegspunkt gebündelt:

```bash
bun build apps/<name>/index.html --outdir dist/<name> --target browser
```

Bun löst das in der HTML eingebundene `<script type="module" src="./main.ts">`
sowie die `import`-Pfade auf `../../lib3d/lib3d` und `../../lib3d/bodies` auf
und schreibt `index.html` + ein gehashtes `index-<hash>.js` nach `dist/<name>/`.

- **Bibliothek:** ändert sich eine Datei in `lib3d/`, sind alle
  Apps betroffen (`LIB_SRCS` als Abhängigkeit im Makefile).
- **Module/Imports:** Die Apps importieren ausschließlich über das
  Barrel-Modul `lib3d/lib3d` (bzw. `lib3d/bodies`), damit die öffentliche API
  zentral bleibt. Interne Batch-Helfer (`renderer_internal.ts`) sind bewusst
  nicht exportiert.

## Erweitern

### Neues Bibliotheks-Modul

1. `.ts`-Datei in `lib3d/` ablegen.
2. Fertig – die Wildcards nehmen sie automatisch auf.
3. Soll das Modul Teil der öffentlichen API sein, in `lib3d/lib3d.ts`
   re-exportieren (bewusst explizite Liste statt `export *`).

### Neue App

1. Ordner `apps/<name>/` mit `index.html` und `main.ts` anlegen.
2. Im Makefile `APP_NAMES := …` um den Namen ergänzen.
3. Bauen mit `make build-<name>`, testen mit `make run-<name>`.

## Hinweise

- `dist/` und `node_modules/` sind über `.gitignore` ausgenommen.
- Der Build ist reines Bundling; ein separater Typcheck (`tsc`) ist nicht
  eingebunden. Die `tsconfig.json` (strict, ES2022, DOM) dient Editoren/Tools.
- `BUN ?= bun` lässt sich überschreiben, z. B. `make BUN=/pfad/zu/bun`.
