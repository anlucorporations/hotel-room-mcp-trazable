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
/**
 * **Avatares de marca** del asistente (incremento v4): `avatar_hotel_<ancho>x<alto>.webp`.
 *
 * Son una **cuarta familia**: no los sube el negocio (no son JPG de habitación ni de contenido) y no
 * son ilustraciones de manual. El tamaño va en el nombre a propósito, porque el asistente elige el
 * fichero según dónde se pinte: 40×40 en la cabecera móvil y el encabezado del panel, 80×80 en el
 * lanzador flotante de escritorio.
 */
const AVATAR = /^avatar_hotel_\d{2,3}x\d{2,3}\.webp$/;
/** Validador REAL del producto para las fotos de habitación (una sola fuente de verdad). */
async function isValidRoomImageName(name: string): Promise<boolean> {
  const roomImages = await import("./room-images");
  return roomImages.isValidRoomImageName(name);
}

const files = readdirSync(IMAGES_DIR).sort();

/**
 * Portadas **históricas** que `@planta` reutiliza como origen (una por tipo) y que conservan la
 * nomenclatura del maestro anterior. No se borran porque el script las copia; quedan excluidas de la
 * comprobación de tipo, pero no de la de formato.
 */
const LEGACY_SOURCES = new Set([
  "101-Simple-2026-09-28-1.jpg",
  "116-Doble-2026-09-28-1.jpg",
  "201-Suite-2026-09-28-1.jpg",
]);

/**
 * Tipo que corresponde a un número de habitación en la **planta vigente** (redistribución del
 * 2026-10-05, decisión del responsable): en cada planta, `x01`–`x03` doble · `x04`–`x05` suite ·
 * `x06`–`x10` simple, para las plantas 1, 2, 3 y 4.
 */
function expectedPlantType(roomNumber: number): "Simple" | "Doble" | "Suite" {
  const position = roomNumber % 100;
  if (position >= 1 && position <= 3) return "Doble";
  if (position >= 4 && position <= 5) return "Suite";
  return "Simple";
}

describe("Imágenes · nombres canónicos por uso y posición", () => {
  it("la carpeta tiene piezas de verdad (el guardián no pasa por vacío)", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("cada fichero pertenece a una familia del catálogo (habitación, contenido, manual o avatar)", async () => {
    const unknown: string[] = [];
    for (const file of files) {
      if (file === "README.md") continue;
      const ok =
        CONTENT_IMAGE.test(file) ||
        DOC_ASSET.test(file) ||
        AVATAR.test(file) ||
        (await isValidRoomImageName(file));
      if (!ok) unknown.push(file);
    }
    expect(unknown).toEqual([]);
  });

  it("los avatares del asistente declaran su tamaño en el nombre (40 y 80 px)", () => {
    const avatars = files.filter((file) => file.endsWith(".webp"));
    expect(avatars).toEqual(["avatar_hotel_40x40.webp", "avatar_hotel_80x80.webp"]);
    for (const file of avatars) expect(file, file).toMatch(AVATAR);
  });

  it("las fotos de habitación se llaman como exige el producto, con el tipo del maestro", async () => {
    const roomPhotos = files.filter((file) => /^\d+-/.test(file));
    expect(roomPhotos.length).toBeGreaterThan(0);
    for (const file of roomPhotos) {
      expect(await isValidRoomImageName(file), file).toBe(true);
      // El tipo del nombre debe coincidir con el de la planta vigente: una foto etiquetada como
      // Suite en una habitación doble sería un nombre mentiroso (y la ficha enseñaría otra cosa).
      if (LEGACY_SOURCES.has(file)) continue;
      const [room, type] = file.split("-");
      const expected = expectedPlantType(Number(room));
      expect(type, `${file} debe ser ${expected} según la planta vigente`).toBe(expected);
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
