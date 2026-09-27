import path from "node:path";
import { roomImagesDir } from "./room-images";

/**
 * Imágenes de **contenido** de la suite pública (F6 · D-66, D-73).
 *
 * Viven junto a las de habitación en `docs/imagenes` (que Next no sirve por defecto). Aquí se valida
 * el nombre y se resuelve la ruta absoluta **sin permitir traversal**; la validación fuerte (JPG y
 * ≤ 2 MB) la aplica la subida del back-office (D-20/D-73).
 */

/** Nombre admitido: solo `[a-z0-9._-]`, terminado en `.jpg` y sin subdirectorios. */
export function isValidContentImageName(fileName: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.jpg$/.test(fileName) && !fileName.includes("..");
}

/** Ruta absoluta del fichero, o `null` si el nombre no es válido o se sale de la carpeta. */
export function resolveContentImagePath(fileName: string): string | null {
  if (!isValidContentImageName(fileName)) return null;
  const dir = roomImagesDir();
  const resolved = path.resolve(dir, fileName);
  const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
}

/** URL pública con la que la web sirve una imagen de contenido. */
export function contentImageUrl(fileName: string): string {
  return `/api/content/images/${encodeURIComponent(fileName)}`;
}
