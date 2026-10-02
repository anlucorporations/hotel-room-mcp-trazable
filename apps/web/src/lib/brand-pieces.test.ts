import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de las **piezas de marca** (propuesta de imagen visual · Fase D).
 *
 * Las ilustraciones (`docs/imagenes/*.svg`), la imagen social generada en código
 * (`app/opengraph-image.tsx`) y la maqueta del catálogo (`docs/ux-mockups/catalogo.html`) se habían
 * quedado fuera de todos los guardianes de color: el escáner de accesibilidad solo mira
 * `apps/web/src`. Aquí se cierra ese hueco con la misma regla derivada del **preset real**, de modo
 * que una pieza nueva (o un retoque a mano) no pueda introducir un color que el sistema no tiene.
 *
 * Además se comprueba que las ilustraciones son **accesibles por sí mismas**: SVG con `role="img"` y
 * `<title>`, porque se insertan en los manuales como imágenes de contenido.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const IMAGES_DIR = `${REPO_ROOT}docs/imagenes`;
const MOCKUP = `${REPO_ROOT}docs/ux-mockups/catalogo.html`;
const OG_IMAGE = `${REPO_ROOT}apps/web/src/app/opengraph-image.tsx`;

const require = createRequire(import.meta.url);
const preset = require("../../../../packages/config/tailwind/preset.cjs") as {
  theme: { extend: { colors: Record<string, string> } };
};
/** HEX de la paleta real, en mayúsculas para comparar sin depender de cómo se escriba la pieza. */
const PALETTE_HEXES = new Set(Object.values(preset.theme.extend.colors).map((hex) => hex.toUpperCase()));

const HEX = /#[0-9A-Fa-f]{6}\b/g;

const hexesOf = (content: string): string[] => (content.match(HEX) ?? []).map((hex) => hex.toUpperCase());

const imageFiles = readdirSync(IMAGES_DIR).filter((name) => name.endsWith(".svg")).sort();

describe("Identidad visual · piezas de marca dentro de la paleta", () => {
  it("hay piezas de marca que auditar", () => {
    expect(imageFiles.length).toBeGreaterThanOrEqual(8);
  });

  it("ninguna ilustración usa un color fuera de la paleta", () => {
    const offenders: string[] = [];
    for (const file of imageFiles) {
      for (const hex of new Set(hexesOf(readFileSync(`${IMAGES_DIR}/${file}`, "utf8")))) {
        if (!PALETTE_HEXES.has(hex)) offenders.push(`${file} :: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("cada ilustración es accesible por sí misma (`role=\"img\"` y `<title>`)", () => {
    const offenders = imageFiles
      .filter((file) => {
        const content = readFileSync(`${IMAGES_DIR}/${file}`, "utf8");
        return !content.includes('role="img"') || !content.includes("<title");
      })
      .map((file) => file);
    expect(offenders).toEqual([]);
  });

  it("la portada adopta el registro marino (`navy`) de «Brisa Marina» en mar y titular", () => {
    const cover = readFileSync(`${IMAGES_DIR}/doc-portada-hotel.svg`, "utf8");
    const navy = preset.theme.extend.colors.navy!.toUpperCase();
    expect(cover.toUpperCase()).toContain(navy);
    // El titular de la portada usa el marino `navy` del sistema «Brisa Marina».
    expect(cover).toMatch(/font-size="76"[^>]*fill="#0E2A3F"/);
  });

  it("la imagen social se genera con tokens de la paleta", () => {
    const source = readFileSync(OG_IMAGE, "utf8");
    const unknown = [...new Set(hexesOf(source))].filter((hex) => !PALETTE_HEXES.has(hex));
    expect(unknown).toEqual([]);
    // No es un PNG suelto: se genera en código (si alguien lo sustituye por un binario, esto falla).
    expect(source).toContain("ImageResponse");
  });

  it("la maqueta del catálogo declara variables de la paleta real", () => {
    const source = readFileSync(MOCKUP, "utf8");
    const declared = [...source.matchAll(/--[a-z-]+:\s*(#[0-9A-Fa-f]{6})/g)].map((match) =>
      match[1]!.toUpperCase(),
    );
    expect(declared.length).toBeGreaterThan(8);
    const unknown = declared.filter((hex) => !PALETTE_HEXES.has(hex));
    expect(unknown).toEqual([]);
  });
});
