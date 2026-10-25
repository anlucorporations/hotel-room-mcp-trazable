import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la tipografía cirílica por superficie (identidad 2026-10-23).
 *
 * Las cuatro familias de marca se **autohospedan** (`public/fonts/*.woff2`) y se declaran en
 * `app/fonts.css` con los subconjuntos `latin` y `cyrillic`, de modo que build y runtime no
 * dependen de `fonts.gstatic.com` y el locale RU queda cubierto por la propia marca:
 *   · pública «Cal & Sal»: Cormorant Garamond (display) + Onest (UI);
 *   · administrativa «Posidonia»: Spectral (display) + Inter Tight (UI).
 *
 * El test es estático: impide cargar una familia sin cirílico, que la pública herede la tipografía
 * administrativa o que las pilas del preset y de la hoja de estilos deriven.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const layoutSource = readFileSync(`${SRC_ROOT}app/layout.tsx`, "utf8");
const fontsCss = readFileSync(`${SRC_ROOT}app/fonts.css`, "utf8");
const globalsSource = readFileSync(`${SRC_ROOT}app/globals.css`, "utf8");
const adminSurface = readFileSync(`${SRC_ROOT}app/admin-surface.css`, "utf8");

const require = createRequire(import.meta.url);
const preset = require("../../../../../packages/config/tailwind/preset.cjs") as {
  theme: { extend: { fontFamily: Record<string, string[]> } };
};

const FAMILIES = [
  ["Cormorant Garamond", "500 700"],
  ["Onest", "400 700"],
  ["Spectral", "500"],
  ["Inter Tight", "400 700"],
] as const;

describe("Accesibilidad tipográfica · cirílico cubierto por las fuentes de marca", () => {
  it("las cuatro familias se declaran con latin Y cyrillic en fonts.css", () => {
    for (const [family] of FAMILIES) {
      expect(fontsCss, `${family} debe declarar su @font-face`).toContain(`font-family: '${family}';`);
    }
    // Cada familia tiene al menos una cara latin y otra cyrillic (marcadores del generador).
    const cyrillicFamilies = [...fontsCss.matchAll(/\/\* cyrillic \*\/\s*@font-face\s*\{[^}]*font-family:\s*'([^']+)'/g)].map((m) => m[1]);
    const latinFamilies = [...fontsCss.matchAll(/\/\* latin \*\/\s*@font-face\s*\{[^}]*font-family:\s*'([^']+)'/g)].map((m) => m[1]);
    for (const [family] of FAMILIES) {
      expect(cyrillicFamilies, `${family} sin cara cyrillic`).toContain(family);
      expect(latinFamilies, `${family} sin cara latin`).toContain(family);
    }
    // Los woff2 se sirven desde el propio origen (no se vuelve a Google Fonts).
    expect(fontsCss).toContain("url('/fonts/");
  });

  it("las familias variable declaran el rango de pesos que usa la interfaz", () => {
    for (const [family, weight] of FAMILIES) {
      if (family === "Spectral") continue; // estática: 500/600/700 en caras separadas
      const block = new RegExp(`@font-face \\{[^}]*font-family: '${family}';[^}]*font-weight: ${weight};`, "s");
      expect(block.test(fontsCss), `${family} debe declarar font-weight ${weight}`).toBe(true);
    }
    for (const weight of ["500", "600", "700"]) {
      expect(fontsCss).toMatch(new RegExp(`font-family: 'Spectral';[^}]*font-weight: ${weight};`, "s"));
    }
  });

  it("el layout carga las fuentes autohospedadas y ya no pide next/font/google", () => {
    expect(layoutSource).toContain('import "./fonts.css"');
    expect(layoutSource).not.toContain("next/font/google");
  });

  it("las pilas del preset empiezan por las variables de superficie", () => {
    expect(preset.theme.extend.fontFamily.display).toEqual([
      "var(--font-display)",
      "Iowan Old Style",
      "Georgia",
      "serif",
    ]);
    expect(preset.theme.extend.fontFamily.sans).toEqual([
      "var(--font-sans)",
      "Segoe UI",
      "system-ui",
      "-apple-system",
      "sans-serif",
    ]);
  });

  it("la hoja base y el scope administrativo activan las familias correctas", () => {
    expect(globalsSource).toMatch(/--font-display:\s*"Cormorant Garamond"/);
    expect(globalsSource).toMatch(/--font-sans:\s*"Onest"/);
    expect(adminSurface).toMatch(/\.admin-surface\s*\{[^}]*--font-display:\s*"Spectral"/s);
    expect(adminSurface).toMatch(/\.admin-surface\s*\{[^}]*--font-sans:\s*"Inter Tight"/s);
  });
});
