import "server-only";
import { keccak256, toHex, verifyMessage } from "viem";
import type { RoomTypeCode } from "@hotel/shared";
import {
  DECOR_STYLES,
  ROOM_TYPES,
  ROOM_VIEWS,
  type RoomDecorStyle,
  type RoomViewKind,
} from "@/lib/room-fields";

/**
 * Validación y huella de la ficha de habitación (F1 · D-1, D-7, D-18, D-19, D-21, D-22).
 *
 * Se aísla del route handler para poder probarla sin Next y para que el alta (`POST`) y la edición
 * (`PATCH`) compartan exactamente las mismas reglas. La autoridad final sigue siendo la base de
 * datos (CHECKs de `rooms`); aquí se devuelven mensajes claros antes de tocar PostgreSQL.
 *
 * Las **listas cerradas** viven en `lib/room-fields.ts` (sin `server-only`) para que el formulario
 * del back-office use las mismas: antes `RoomsAdmin` las duplicaba a mano.
 */

export { OPERATIONAL_STATUSES, PUBLICATION_STATUSES, ROOM_TYPES } from "@/lib/room-fields";

/** Campos editables de una habitación. */
export interface RoomFields {
  roomNumber: number;
  floor: number | null;
  roomType: RoomTypeCode;
  capacity: number;
  beds: number;
  sizeM2: number | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  baseRateWei: string | null;
  // — Ficha ampliada (2026-10-02) —
  viewKind: RoomViewKind | null;
  hasBalcony: boolean;
  isAccessible: boolean;
  decorStyle: RoomDecorStyle | null;
  decorPalette: string | null;
  decorMaterials: string | null;
  decorNotesEs: string | null;
  decorNotesEn: string | null;
  decorNotesRu: string | null;
}

export type ParseResult =
  | { ok: true; fields: Partial<RoomFields> }
  | { ok: false; error: string; message: string };

const FIELD_MAX = 4000;
const SHORT_FIELD_MAX = 200;

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function optionalText(value: unknown, label: string): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: `${label} debe ser texto.` };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > FIELD_MAX) return { ok: false, message: `${label} es demasiado largo.` };
  return { ok: true, value: trimmed };
}

function integer(value: unknown, label: string, min: number): { ok: true; value: number } | { ok: false; message: string } {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min) {
    return { ok: false, message: `${label} debe ser un entero ≥ ${min}.` };
  }
  return { ok: true, value: n };
}

function nullableInteger(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  return integer(value, label, 0);
}

function nullableNumber(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return { ok: false, message: `${label} debe ser un número positivo.` };
  }
  return { ok: true, value: n };
}

function nullableWei(value: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { ok: false, message: "baseRateWei debe ser un entero en wei (cadena de dígitos)." };
  }
  return { ok: true, value: value };
}

/**
 * Valida el cuerpo de alta o edición.
 *
 * - `partial = false` (alta): exige `roomNumber`, `roomType`, `capacity` y `beds` (D-21).
 * - `partial = true` (edición): valida solo los campos presentes.
 *
 * La **descripción en español** se exige al **publicar** (D-6/D-21), no al guardar un borrador; por eso
 * aquí no es obligatoria y la impone el `CHECK` de la tabla al pasar a `PUBLISHED`.
 */
export function parseRoomFields(body: unknown, options: { partial: boolean }): ParseResult {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "BAD_REQUEST", message: "Se espera un objeto JSON." };

  const fields: Partial<RoomFields> = {};
  const required = !options.partial;

  const has = (key: string) => key in record && record[key] !== undefined && record[key] !== null;
  /**
   * Presencia **explícita** para los campos de la ficha ampliada: un `null` enviado a propósito
   * significa «limpiar este dato» (elegir «sin vistas» o borrar las notas), no «no lo toques». El
   * `has` clásico trata `null` como ausente, que es lo correcto para los campos heredados.
   */
  const present = (key: string) => key in record && record[key] !== undefined;

  if (required || has("roomNumber")) {
    const r = integer(record.roomNumber, "El número de habitación", 1);
    if (!r.ok) return { ok: false, error: "INVALID_ROOM_NUMBER", message: r.message };
    fields.roomNumber = r.value;
  }

  if (required || has("roomType")) {
    if (typeof record.roomType !== "string" || !ROOM_TYPES.includes(record.roomType as RoomTypeCode)) {
      return {
        ok: false,
        error: "INVALID_ROOM_TYPE",
        message: `Tipo de habitación no válido (admitidos: ${ROOM_TYPES.join(", ")}, D-22).`,
      };
    }
    fields.roomType = record.roomType as RoomTypeCode;
  }

  if (required || has("capacity")) {
    const r = integer(record.capacity, "La capacidad", 1);
    if (!r.ok) return { ok: false, error: "INVALID_CAPACITY", message: r.message };
    fields.capacity = r.value;
  }

  if (required || has("beds")) {
    const r = integer(record.beds, "El número de camas", 1);
    if (!r.ok) return { ok: false, error: "INVALID_BEDS", message: r.message };
    fields.beds = r.value;
  }

  if (has("floor")) {
    const r = nullableInteger(record.floor, "La planta");
    if (!r.ok) return { ok: false, error: "INVALID_FLOOR", message: r.message };
    fields.floor = r.value;
  }

  if (has("sizeM2")) {
    const r = nullableNumber(record.sizeM2, "La superficie");
    if (!r.ok) return { ok: false, error: "INVALID_SIZE", message: r.message };
    fields.sizeM2 = r.value;
  }

  for (const [key, label] of [
    ["descriptionEs", "La descripción en español"],
    ["descriptionEn", "La descripción en inglés"],
    ["descriptionRu", "La descripción en ruso"],
  ] as const) {
    if (options.partial && !has(key)) continue;
    const r = optionalText(record[key], label);
    if (!r.ok) return { ok: false, error: "INVALID_DESCRIPTION", message: r.message };
    fields[key] = r.value;
  }

  if (has("baseRateWei")) {
    const r = nullableWei(record.baseRateWei);
    if (!r.ok) return { ok: false, error: "INVALID_RATE", message: r.message };
    fields.baseRateWei = r.value;
  }

  // — Ficha ampliada (2026-10-02) —

  if (present("viewKind")) {
    const value = record.viewKind;
    if (value === null || value === "") {
      fields.viewKind = null;
    } else if (typeof value === "string" && ROOM_VIEWS.includes(value as RoomViewKind)) {
      fields.viewKind = value as RoomViewKind;
    } else {
      return {
        ok: false,
        error: "INVALID_VIEW",
        message: `Vista no válida (admitidas: ${ROOM_VIEWS.join(", ")}).`,
      };
    }
  }

  if (present("decorStyle")) {
    const value = record.decorStyle;
    if (value === null || value === "") {
      fields.decorStyle = null;
    } else if (typeof value === "string" && DECOR_STYLES.includes(value as RoomDecorStyle)) {
      fields.decorStyle = value as RoomDecorStyle;
    } else {
      return {
        ok: false,
        error: "INVALID_DECOR_STYLE",
        message: `Estilo decorativo no válido (admitidos: ${DECOR_STYLES.join(", ")}).`,
      };
    }
  }

  for (const [key, label] of [
    ["decorPalette", "La paleta"],
    ["decorMaterials", "Los materiales"],
  ] as const) {
    if (options.partial && !present(key)) continue;
    const value = record[key];
    if (value === undefined || value === null) {
      fields[key] = null;
      continue;
    }
    if (typeof value !== "string") return { ok: false, error: "INVALID_DECOR", message: `${label} debe ser texto.` };
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      fields[key] = null;
    } else if (trimmed.length > SHORT_FIELD_MAX) {
      return { ok: false, error: "INVALID_DECOR", message: `${label} no puede superar ${SHORT_FIELD_MAX} caracteres.` };
    } else {
      fields[key] = trimmed;
    }
  }

  for (const [key, label] of [
    ["decorNotesEs", "Las notas de decoración en español"],
    ["decorNotesEn", "Las notas de decoración en inglés"],
    ["decorNotesRu", "Las notas de decoración en ruso"],
  ] as const) {
    if (options.partial && !present(key)) continue;
    const r = optionalText(record[key], label);
    if (!r.ok) return { ok: false, error: "INVALID_DECOR_NOTES", message: r.message };
    fields[key] = r.value;
  }

  for (const [key, label] of [
    ["hasBalcony", "El balcón o terraza"],
    ["isAccessible", "La accesibilidad"],
  ] as const) {
    if (!present(key)) continue;
    const value = record[key];
    if (typeof value !== "boolean") {
      return { ok: false, error: "INVALID_BOOLEAN", message: `${label} debe ser verdadero o falso.` };
    }
    fields[key] = value;
  }

  return { ok: true, fields };
}

/** Resultado de validar una lista de códigos o de espacios. */
export type ParseListResult<T> = { ok: true; value: T } | { ok: false; error: string; message: string };

/**
 * Valida los **servicios** asignados a una habitación: array de códigos del catálogo, sin repetir.
 * No comprueba que el código exista en `room_amenities` (eso lo impone la clave foránea); sí rechaza
 * formas inválidas antes de tocar la base.
 */
export function parseAmenityCodes(body: unknown): ParseListResult<string[]> {
  if (!Array.isArray(body)) {
    return { ok: false, error: "INVALID_AMENITIES", message: "Los servicios deben ser una lista de códigos." };
  }
  const codes: string[] = [];
  for (const item of body) {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 40) {
      return { ok: false, error: "INVALID_AMENITIES", message: "Cada servicio debe ser un código válido." };
    }
    if (!codes.includes(item)) codes.push(item);
  }
  return { ok: true, value: codes };
}

/** Espacio de la ficha tal y como llega del formulario. */
export interface RoomSpaceInput {
  spaceCode: string;
  sizeM2: number | null;
}

/** Valida los **espacios** (código del catálogo + superficie opcional), sin repetir códigos. */
export function parseRoomSpaces(body: unknown): ParseListResult<RoomSpaceInput[]> {
  if (!Array.isArray(body)) {
    return { ok: false, error: "INVALID_SPACES", message: "Los espacios deben ser una lista." };
  }
  const spaces: RoomSpaceInput[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "INVALID_SPACES", message: "Cada espacio debe ser un objeto." };
    }
    const record = item as Record<string, unknown>;
    const code = record.spaceCode;
    if (typeof code !== "string" || code.trim().length === 0 || code.length > 20) {
      return { ok: false, error: "INVALID_SPACES", message: "Cada espacio necesita un código válido." };
    }
    const size = nullableNumber(record.sizeM2, `La superficie de ${code}`);
    if (!size.ok) return { ok: false, error: "INVALID_SPACES", message: size.message };
    if (spaces.some((space) => space.spaceCode === code)) continue;
    spaces.push({ spaceCode: code, sizeM2: size.value });
  }
  return { ok: true, value: spaces };
}

/** Huella canónica de la ficha publicada (D-18): keccak256 del JSON con las imágenes ordenadas. */
export function roomContentHash(
  room: {
    roomNumber: number;
    roomType: string;
    capacity: number;
    beds: number;
    sizeM2: number | null;
    descriptionEs: string | null;
    descriptionEn: string | null;
    descriptionRu: string | null;
    baseRateWei: string | null;
    imageFileNames: readonly string[];
  },
): string {
  const canonical = JSON.stringify({
    roomNumber: room.roomNumber,
    roomType: room.roomType,
    capacity: room.capacity,
    beds: room.beds,
    sizeM2: room.sizeM2,
    descriptionEs: room.descriptionEs,
    descriptionEn: room.descriptionEn,
    descriptionRu: room.descriptionRu,
    baseRateWei: room.baseRateWei,
    imageFileNames: [...room.imageFileNames].sort(),
  });
  return keccak256(toHex(canonical));
}

/** ¿Es una firma hexadecimal (`0x` + hex) con longitud plausible? */
export function isHexSignature(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{130}$/.test(value);
}

/** ¿Es una dirección Ethereum bien formada? */
export function isEthAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Verifica que `signature` es una firma EIP-191 (`personal_sign`) de `contentHash` por
 * `signerAddress` (D-1/D-2).
 *
 * La firma la produce la wallet del administrador sobre la **huella** de la ficha; el anclaje
 * on-chain de esa huella llega con el registro dinámico del contrato (F8, D-10). Una firma inválida
 * o mal formada devuelve `false` (nunca lanza).
 */
export async function verifyRoomPublicationSignature(input: {
  contentHash: string;
  signature: string;
  signerAddress: string;
}): Promise<boolean> {
  if (!isHexSignature(input.signature) || !isEthAddress(input.signerAddress)) return false;
  try {
    return await verifyMessage({
      address: input.signerAddress,
      message: input.contentHash,
      signature: input.signature,
    });
  } catch {
    return false;
  }
}
