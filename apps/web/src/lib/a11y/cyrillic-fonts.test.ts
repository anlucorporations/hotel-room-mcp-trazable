import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la **tipografía cirílica** (sistema «Brisa Marina», Manual_Identidad_Visual.md v2.0.0).
 *
 * El producto declara paridad ES/EN/RU. En el sistema anterior («Mediterráneo editorial») las
 * fuentes de marca no cubrían el ruso y hacía falta una cascada glifo a glifo con dos respaldos
 * `preload: false` (Playfair + Inter cirílicos). En «Brisa Marina» las DOS fuentes de marca —
 * **Playfair Display** (display) y **Manrope** (UI)— publican el subconjunto `cyrillic`, así que
 * el locale RU queda cubierto por las propias fuentes de marca y la cascada de respaldo desaparece.
 *
 * Este test es **estático** a propósito: no puede consultar la cobertura de glifos de Google, pero
 * sí impedir que una familia de marca se cargue SIN el subconjunto cirílico (regresión del RU),
 * que se reintroduzcan respaldos precargados que penalicen el LCP, o que las pilas del preset y
 * de la hoja de estilos deriven.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const layoutSource = readFileSync(`${SRC_ROOT}app/layout.tsx`, "utf8");
const globalsSource = readFileSync(`${SRC_ROOT}app/globals.css`, "utf8");

const require = createRequire(import.meta.url);
const preset = require("../../../../../packages/config/tailwind/preset.cjs") as {
  theme: { extend: { fontFamily: Record<string, string[]> } };
};

describe("Accesibilidad tipográfica · cirílico cubierto por las fuentes de marca", () => {
  it("las dos familias de marca se cargan con los subconjuntos latin Y cyrillic", () => {
    for (const [family, variable] of [
      ["Playfair_Display", "--font-playfair"],
      ["Manrope", "--font-manrope"],
    ] as const) {
      const call = new RegExp(`const \\w+ = ${family}\\(\\{([^}]*)\\}\\)`, "s").exec(layoutSource);
      expect(call, `no se declara ${family} en layout.tsx`).not.toBeNull();
      const body = call![1]!;
      expect(body, `${family} debe pedir el subconjunto cirílico (paridad ES/EN/RU)`).toMatch(
        /subsets:\s*\[[^\]]*["']cyrillic["'][^\]]*\]/,
      );
      expect(body, `${family} debe pedir el subconjunto latino`).toMatch(
        /subsets:\s*\[[^\]]*["']latin["'][^\]]*\]/,
      );
      expect(body, `${family} debe exponer ${variable}`).toContain(variable);
      expect(body, `${family} debe usar display swap`).toContain('display: "swap"');
    }
  });

  it("no quedan respaldos cirílicos separados (la cascada glifo a glifo se retiró)", () => {
    expect(layoutSource).not.toContain("Inter");
    expect(layoutSource).not.toContain("Fraunces");
    expect(layoutSource).not.toContain("Hanken");
    expect(layoutSource).not.toMatch(/preload:\s*false/);
  });

  it("aplica las variables de las dos familias al documento", () => {
    for (const variable of ["playfair.variable", "manrope.variable"]) {
      expect(layoutSource, `falta ${variable} en <html className>`).toContain(variable);
    }
  });

  it("las pilas del preset empiezan por la fuente de marca", () => {
    expect(preset.theme.extend.fontFamily.display).toEqual([
      "var(--font-playfair)",
      "Georgia",
      "serif",
    ]);
    expect(preset.theme.extend.fontFamily.sans).toEqual([
      "var(--font-manrope)",
      "system-ui",
      "-apple-system",
      "sans-serif",
    ]);
  });

  it("las pilas base de la hoja de estilos respetan el mismo orden", () => {
    // Cuerpo: Manrope → sistema.
    expect(globalsSource).toMatch(/font-family:\s*var\(--font-manrope\),\s*system-ui/);
    // Titulares: Playfair → serif del sistema.
    expect(globalsSource).toMatch(
      /font-family:\s*var\(--font-playfair\),\s*Georgia,\s*serif/,
    );
  });
});
