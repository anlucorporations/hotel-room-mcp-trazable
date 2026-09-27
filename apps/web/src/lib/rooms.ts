import "server-only";
import { keccak256, toHex, verifyMessage } from "viem";
import type { RoomOperationalStatus, RoomPublicationStatus, RoomTypeCode } from "@hotel/shared";

/**
 * Validación y huella de la ficha de habitación (F1 · D-1, D-7, D-18, D-19, D-21, D-22).
 *
 * Se aísla del route handler para poder probarla sin Next y para que el alta (`POST`) y la edición
 * (`PATCH`) compartan exactamente las mismas reglas. La autoridad final sigue siendo la base de
 * datos (CHECKs de `rooms`); aquí se devuelven mensajes claros antes de tocar PostgreSQL.
 */

export const ROOM_TYPES: readonly RoomTypeCode[] = ["SIMPLE", "DOBLE", "SUITE"];

export const PUBLICATION_STATUSES: readonly RoomPublicationStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "PAUSED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
];

export const OPERATIONAL_STATUSES: readonly RoomOperationalStatus[] = ["CLEAN", "DIRTY", "OCCUPIED"];

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
}

export type ParseResult =
  | { ok: true; fields: Partial<RoomFields> }
  | { ok: false; error: string; message: string };

const FIELD_MAX = 4000;

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

  return { ok: true, fields };
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
