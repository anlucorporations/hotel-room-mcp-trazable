import path from "node:path";

/**
 * Imágenes locales de habitación (F1 · D-5, D-12, D-20).
 *
 * Las fotos viven en el servidor, en la carpeta `docs/imagenes` (D-5), con la nomenclatura
 * `<nº habitación>-<tipo>-<fecha de subida>-<nº de imagen>.jpg` (D-5/D-12). Aquí se construye y se
 * valida ese nombre y se resuelve la ruta absoluta **sin permitir traversal**.
 *
 * Reglas: solo **JPG** y **≤ 2 MB** (D-20). El nombre es la única puerta: no se acepta ningún
 * carácter fuera de `[0-9A-Za-z._-]` ni subdirectorios.
 */

export const ROOM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type RoomTypeLabel = "Simple" | "Doble" | "Suite";

const TYPE_LABEL: Readonly<Record<string, RoomTypeLabel>> = {
  SIMPLE: "Simple",
  DOBLE: "Doble",
  SUITE: "Suite",
};

/** Carpeta de imágenes: `ROOM_IMAGES_DIR` o `<cwd>/../../docs/imagenes` (raíz del repo). */
export function roomImagesDir(): string {
  const override = process.env.ROOM_IMAGES_DIR;
  if (override && override.trim().length > 0) return override;
  return path.resolve(process.cwd(), "..", "..", "docs", "imagenes");
}

/** `YYYY-MM-DD` en UTC (la fecha del nombre es la de subida, D-12). */
export function formatUploadDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Etiqueta del tipo para el nombre (`Simple` · `Doble` · `Suite`, D-5). */
export function roomTypeLabel(roomType: string): RoomTypeLabel | null {
  return TYPE_LABEL[roomType.toUpperCase()] ?? null;
}

/** Construye el nombre canónico de una imagen. */
export function buildRoomImageFileName(
  roomNumber: number,
  roomType: string,
  uploadedAt: Date,
  index: number,
): string {
  const label = roomTypeLabel(roomType);
  if (!label) throw new Error(`Tipo de habitación sin etiqueta de imagen: ${roomType}`);
  if (!Number.isInteger(index) || index < 1 || index > 5) {
    throw new Error(`Índice de imagen fuera de 1..5: ${index}`);
  }
  return `${roomNumber}-${label}-${formatUploadDate(uploadedAt)}-${index}.jpg`;
}

/** Nombre admitido: `<nº>-<tipo>-<AAAA-MM-DD>-<n>.jpg`, sin rutas ni caracteres raros. */
export function isValidRoomImageName(fileName: string): boolean {
  return /^\d{1,10}-(Simple|Doble|Suite)-\d{4}-\d{2}-\d{2}-[1-5]\.jpg$/.test(fileName);
}

/**
 * Ruta absoluta del fichero. Devuelve `null` si el nombre no es válido o si la ruta resuelta se
 * sale de la carpeta de imágenes (defensa contra traversal).
 */
export function resolveRoomImagePath(fileName: string): string | null {
  if (!isValidRoomImageName(fileName)) return null;
  const dir = roomImagesDir();
  const resolved = path.resolve(dir, fileName);
  const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
}

/** ¿El contenido es un JPG y cabe en el límite? (cabecera JPEG `FF D8 FF`). */
export function isJpegWithinLimit(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0 || bytes.byteLength > ROOM_IMAGE_MAX_BYTES) return false;
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
