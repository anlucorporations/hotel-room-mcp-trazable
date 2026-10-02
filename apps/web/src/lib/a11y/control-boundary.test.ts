import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFormControls, parseColorUtilities } from "./color-usage";
import { contrastRatioRaw } from "./contrast";
import { PALETTE } from "./palette";

/**
 * Guardián de la **frontera de los controles** de formulario (hallazgo **H-7** de la propuesta de
 * imagen visual, Fase A.2 · WCAG 2.1 · **1.4.11 Non-text Contrast**).
 *
 * Por qué existe: en un `input`/`select`/`textarea` sobre el lienzo arena, el **borde es lo único**
 * que identifica el control (el relleno blanco sobre arena da 1,06:1). El sistema usaba
 * `border-line` (#DBE7EF) para todo —filetes decorativos y controles— y como frontera de control
 * daba **~1,10:1**, muy por debajo del **3:1** exigido. Axe no lo detecta (el control tiene etiqueta
 * y foco correctos) y el escáner de `className` mide pares **texto/fondo**, no límites de
 * componente: era un punto ciego real del proyecto.
 *
 * El guardián no fija el número a mano: **deriva** del propio contraste medido el conjunto de tokens
 * que pueden ser frontera (los que alcanzan 3:1 en los tres lienzos), de modo que un token nuevo
 * queda cubierto solo, y exige que el borde **por defecto** de un control sea `line-strong`, que es
 * la decisión de diseño aprobada el 2026-09-27.
 */

const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Mínimo de WCAG 2.1 · 1.4.11 para la frontera de un componente de interfaz. */
const MIN_BOUNDARY_RATIO = 3;

/** Lienzos sobre los que se dibujan los controles (los tres que el producto usa). */
const CONTROL_SURFACES = ["mist", "mist-2", "shell"] as const;

/** Borde **estructural** (ancho/lado) — no confundir con un color de borde (`border-line`). */
const STRUCTURAL_BORDER = /(?:^|\s)border(?:-(?:[trblxy]|\d))?(?=\s|$)/;

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) files.push(full);
    }
  };
  walk(SRC_ROOT);
  return files.sort();
}

interface ControlUsage {
  readonly file: string;
  readonly tag: string;
  readonly className: string;
}

const controls: ControlUsage[] = sourceFiles().flatMap((file) =>
  extractFormControls(readFileSync(file, "utf8")).flatMap((control) => {
    const className = control.className;
    // Los controles sin clase declarada (p. ej. `AssistantChat`) no tienen frontera que verificar.
    if (className === null) return [];
    return [
      {
        file: relative(SRC_ROOT, file).replace(/\\/g, "/"),
        tag: control.tag,
        className,
      },
    ];
  }),
);

/** Controles que declaran una frontera (ancho de borde): son los que hay que verificar. */
const borderedControls = controls.filter((control) => STRUCTURAL_BORDER.test(control.className));

/** Utilidades de **color** de borde de un fragmento de clases (con sus variantes `focus:` etc.). */
function borderColorUtilities(classes: string): ReturnType<typeof parseColorUtilities> {
  return parseColorUtilities(classes).filter((utility) =>
    (utility.raw.split(":").pop() ?? "").startsWith("border-"),
  );
}

/** Peor ratio del token sobre los tres lienzos de control (`Infinity` si el token no existe). */
function minRatioOnSurfaces(token: string): number {
  const hex = PALETTE[token as keyof typeof PALETTE] as string | undefined;
  if (hex === undefined) return Number.POSITIVE_INFINITY;
  return Math.min(...CONTROL_SURFACES.map((surface) => contrastRatioRaw(hex, PALETTE[surface])));
}

describe("Accesibilidad · frontera de los controles de formulario (H-7 · WCAG 1.4.11)", () => {
  it("`line-strong` alcanza 3:1 en los tres lienzos donde viven los controles", () => {
    for (const surface of CONTROL_SURFACES) {
      const ratio = contrastRatioRaw(PALETTE["line-strong"], PALETTE[surface]);
      expect(ratio, `line-strong sobre ${surface}`).toBeGreaterThanOrEqual(MIN_BOUNDARY_RATIO);
    }
  });

  it("`line` NO alcanza 3:1: es un filete decorativo y no puede ser frontera de control", () => {
    for (const surface of CONTROL_SURFACES) {
      const ratio = contrastRatioRaw(PALETTE.line, PALETTE[surface]);
      expect(ratio, `line sobre ${surface}`).toBeLessThan(MIN_BOUNDARY_RATIO);
    }
  });

  it("el guardián tiene cobertura real (no pasa por vacío)", () => {
    expect(controls.length).toBeGreaterThan(90);
    expect(borderedControls.length).toBeGreaterThan(80);
  });

  it("todo control declara `line-strong` como frontera por defecto (y ninguno usa el filete decorativo)", () => {
    const violations: string[] = [];
    for (const control of borderedControls) {
      const colors = borderColorUtilities(control.className);
      const base = colors.filter((utility) => utility.variants.length === 0);
      const tokens = base.map((utility) => utility.token);
      if (tokens.length !== 1 || tokens[0] !== "line-strong") {
        violations.push(
          `${control.file} [${control.tag}] frontera por defecto = ${tokens.join(",") || "ninguna"} :: ${control.className.slice(0, 80)}`,
        );
      }
      // Cualquier otro color de borde (incluidos los de estado) debe alcanzar 3:1.
      for (const utility of colors) {
        if (minRatioOnSurfaces(utility.token) < MIN_BOUNDARY_RATIO) {
          violations.push(
            `${control.file} [${control.tag}] borde \`${utility.raw}\` no alcanza 3:1 sobre los lienzos de control`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("los bordes de estado (focus, error…) también alcanzan 3:1", () => {
    const stateBorders = borderedControls.flatMap((control) =>
      borderColorUtilities(control.className)
        .filter((utility) => utility.variants.length > 0)
        .map((utility) => ({ ...utility, file: control.file, tag: control.tag })),
    );
    // Debe haber al menos un borde de estado declarado (hoy `focus:border-azure` en todos los campos).
    expect(stateBorders.length).toBeGreaterThan(0);
    const failures = stateBorders
      .filter((utility) => minRatioOnSurfaces(utility.token) < MIN_BOUNDARY_RATIO)
      .map((utility) => `${utility.file} [${utility.tag}] ${utility.raw}`);
    expect(failures).toEqual([]);
  });
});
