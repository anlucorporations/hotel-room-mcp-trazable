import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de **nombres de imagen** de toda la plataforma (catálogo
 * `RepoTecnico/catalogo_imagenes.md`).
 *
 * La carpeta `docs/imagenes` mezclaba tres cosas —fotos de habitación, imágenes de contenido y
 * ilustraciones de manuales— y dos de las tres no seguían ningún patrón: `sencilla_hotel.jpg` no lo
 * podía servir ninguna ruta (los validadores exigen `<nº>-<tipo>-<fecha>-<n>.jpg` o
 * `hotel-<seccion>-<fecha>-<n>.jpg`) y las ilustraciones de manual no se distinguían de lo que se
 * sube desde el back-office. Aquí se convierte el catálogo en un invariante:
 *
 *   1. **Todo fichero** de `docs/imagenes/` pertenece a una de las tres familias (más el índice).
 *   2. Las fotografías que la aplicación sirve pasan por los **validadores reales** del producto
 *      (`isValidRoomImageName`), no por una copia del patrón.
 *   3. Las ilustraciones de manual declaran el prefijo `doc-`, que las separa de lo subible.
 *   4. **Toda referencia** de los manuales apunta a un fichero que existe (un enlace roto en la ayuda
 *      es una imagen que no se ve).
 */

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const IMAGES_DIR = join(REPO_ROOT, "docs", "imagenes");

/** Manuales literales: los 3 generales + los 32 de caso de uso (los mismos que sirve `/ayuda`). */
const CU_MANUALS_ROOT = join(REPO_ROOT, "docs", "Manuales", "05-casos-de-uso");
const CU_MANUALS = existsSync(CU_MANUALS_ROOT)
  ? readdirSync(CU_MANUALS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) =>
        readdirSync(join(CU_MANUALS_ROOT, entry.name))
          .filter((name) => /^CU-.+\.md$/.test(name))
          .map((name) => join("docs", "Manuales", "05-casos-de-uso", entry.name, name)),
      )
      .sort()
  : [];
const MANUALS = [
  "docs/manual-cliente.md",
  "docs/manual-comprador.md",
  "docs/manual-recepcion.md",
  ...CU_MANUALS,
];

const CONTENT_IMAGE = /^hotel-(hero|services|experience|activities|contact|other)-\d{4}-\d{2}-\d{2}-\d{1,2}\.jpg$/;
const DOC_ASSET = /^doc-[a-z0-9]+(-[a-z0-9]+)*\.(svg|png)$/;
/** Validador REAL del producto para las fotos de habitación (una sola fuente de verdad). */
async function isValidRoomImageName(name: string): Promise<boolean> {
  const roomImages = await import("./room-images");
  return roomImages.isValidRoomImageName(name);
}

const files = readdirSync(IMAGES_DIR).sort();

describe("Imágenes · nombres canónicos por uso y posición", () => {
  it("la carpeta tiene piezas de verdad (el guardián no pasa por vacío)", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("cada fichero pertenece a una familia del catálogo (habitación, contenido o manual)", async () => {
    const unknown: string[] = [];
    for (const file of files) {
      if (file === "README.md") continue;
      const ok =
        CONTENT_IMAGE.test(file) || DOC_ASSET.test(file) || (await isValidRoomImageName(file));
      if (!ok) unknown.push(file);
    }
    expect(unknown).toEqual([]);
  });

  it("las fotos de habitación se llaman como exige el producto, con el tipo del maestro", async () => {
    const roomPhotos = files.filter((file) => /^\d+-/.test(file));
    expect(roomPhotos.length).toBeGreaterThan(0);
    for (const file of roomPhotos) {
      expect(await isValidRoomImageName(file), file).toBe(true);
      // El tipo del nombre debe coincidir con el del maestro (101–115 simple, 116–130 doble,
      // 201–220 suite): una foto etiquetada como Suite en un 1XX sería un nombre mentiroso.
      const [room, type] = file.split("-");
      const number = Number(room);
      const expected = number <= 115 ? "Simple" : number <= 130 ? "Doble" : "Suite";
      expect(type, `${file} debe ser ${expected} según el maestro`).toBe(expected);
    }
  });

  it("las ilustraciones de manual llevan el prefijo `doc-` (no se confunden con lo subible)", () => {
    const illustrations = files.filter((file) => /\.(svg|png)$/.test(file));
    expect(illustrations.length).toBeGreaterThanOrEqual(9);
    for (const file of illustrations) expect(file, file).toMatch(DOC_ASSET);
  });

  it("ninguna referencia de los manuales apunta a un fichero inexistente", () => {
    const present = new Set(files);
    const broken: string[] = [];
    const referenced: string[] = [];
    for (const manual of MANUALS) {
      const source = readFileSync(join(REPO_ROOT, manual), "utf8");
      for (const match of source.matchAll(/!\[[^\]]*\]\(imagenes\/([^)]+)\)/g)) {
        const name = match[1]!;
        referenced.push(name);
        if (!present.has(name)) broken.push(`${manual} → ${name}`);
      }
    }
    expect(referenced.length).toBeGreaterThan(8);
    expect(broken).toEqual([]);
  });

  it("el índice de la carpeta menciona todos los ficheros (nadie queda sin documentar)", () => {
    const readme = readFileSync(join(IMAGES_DIR, "README.md"), "utf8");
    const missing = files.filter((file) => file !== "README.md" && !readme.includes(file));
    expect(missing).toEqual([]);
  });
});
