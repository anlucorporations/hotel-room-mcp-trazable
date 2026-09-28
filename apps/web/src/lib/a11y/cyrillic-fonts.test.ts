import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la **cascada cirílica** (propuesta de imagen visual §3.4, decisión del 2026-09-27).
 *
 * El producto tiene paridad ES/EN/RU, pero **Fraunces** (display) no publica el subconjunto
 * `cyrillic` y **Hanken Grotesk** (UI) solo el bloque *extendido* (U+0460–052F), sin el rango ruso
 * básico (U+0400–045F): el locale RU caía a `Georgia`/`system-ui`. La solución aprobada es una
 * cascada **glifo a glifo** — las fuentes de marca para ES/EN y un respaldo cirílico después en la
 * pila, cargado **solo** con ese subconjunto y sin `preload` (para no penalizar el LCP de ES/EN).
 *
 * Este test es **estático** a propósito: no puede consultar la cobertura de glifos de Google, pero sí
 * impedir que la cascada desaparezca, se invierta el orden o se precargue el cirílico a todos los
 * usuarios. La evidencia de cobertura por familia está en `RepoTecnico/propuesta_imagen_visual.md` §7.2.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const layoutSource = readFileSync(`${SRC_ROOT}app/layout.tsx`, "utf8");
const globalsSource = readFileSync(`${SRC_ROOT}app/globals.css`, "utf8");

const require = createRequire(import.meta.url);
const preset = require("../../../../../packages/config/tailwind/preset.cjs") as {
  theme: { extend: { fontFamily: Record<string, string[]> } };
};

describe("Accesibilidad tipográfica · cascada cirílica para el locale RU", () => {
  it("declara las dos familias de respaldo con el subconjunto cirílico y SIN precarga", () => {
    for (const [family, variable] of [
      ["Playfair_Display", "--font-playfair"],
      ["Inter", "--font-inter"],
    ] as const) {
      const call = new RegExp(
        `const \\w+ = ${family}\\(\\{([^}]*)\\}\\)`,
        "s",
      ).exec(layoutSource);
      expect(call, `no se declara ${family} en layout.tsx`).not.toBeNull();
      const body = call![1]!;
      expect(body, `${family} debe pedir el subconjunto cirílico`).toMatch(
        /subsets:\s*\[\s*["']cyrillic["']\s*\]/,
      );
      expect(body, `${family} no debe precargarse (penaliza el LCP de ES/EN)`).toMatch(
        /preload:\s*false/,
      );
      expect(body, `${family} debe exponer ${variable}`).toContain(variable);
    }
  });

  it("aplica las variables de las cuatro familias al documento", () => {
    for (const variable of [
      "fraunces.variable",
      "hanken.variable",
      "playfairCyrillic.variable",
      "interCyrillic.variable",
    ]) {
      expect(layoutSource, `falta ${variable} en <html className>`).toContain(variable);
    }
  });

  it("el respaldo va DESPUÉS de la fuente de marca en las pilas del preset", () => {
    expect(preset.theme.extend.fontFamily.display).toEqual([
      "var(--font-fraunces)",
      "var(--font-playfair)",
      "Georgia",
      "serif",
    ]);
    expect(preset.theme.extend.fontFamily.sans).toEqual([
      "var(--font-hanken)",
      "var(--font-inter)",
      "system-ui",
      "-apple-system",
      "sans-serif",
    ]);
  });

  it("las pilas base de la hoja de estilos respetan el mismo orden", () => {
    // Cuerpo: Hanken → Inter → sistema.
    expect(globalsSource).toMatch(
      /font-family:\s*var\(--font-hanken\),\s*var\(--font-inter\),\s*system-ui/,
    );
    // Titulares: Fraunces → Playfair → serif del sistema.
    expect(globalsSource).toMatch(
      /font-family:\s*var\(--font-fraunces\),\s*var\(--font-playfair\),\s*Georgia,\s*serif/,
    );
  });
});
