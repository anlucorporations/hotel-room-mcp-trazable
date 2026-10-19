import type { RoomOperationalStatus, RoomPublicationStatus } from "./operations-state";

/**
 * Dominio **puro** de la Suite Ama de llaves (F6).
 *
 * Lo que la inspección implica y lo que el tablero operativo pinta son reglas de negocio, no de
 * base de datos: viven aquí para que las pruebas, las rutas y la UI usen la misma decisión y no se
 * desvíen tres copias. Sin E/S (no `pg`, no RPC, no reloj): solo proyecciones.
 */

/** Tipo de inspección (`housekeeping_inspections.inspection_type`). */
export const INSPECTION_TYPES = ["CHECKOUT", "DAILY_SERVICE"] as const;
export type InspectionTypeCode = (typeof INSPECTION_TYPES)[number];

/** Resultado de una inspección (`housekeeping_inspections.result`). */
export const INSPECTION_RESULTS = ["APPROVED", "REJECTED"] as const;
export type InspectionResultCode = (typeof INSPECTION_RESULTS)[number];

/**
 * Clave de `platform_settings` que decide si certificar una inspección exige firma on-chain.
 *
 * **Por defecto `false`** (D-C23): la firma de inspección es opcional y configurable por hotel. El
 * valor se interpreta con {@link parseBooleanFlag}.
 */
export const INSPECTION_REQUIRES_SIGNATURE_KEY = "inspection_requires_signature";

/** Interpreta un flag de settings (`"true"`, `"1"`, `"on"`, `"yes"` → `true`). */
export function parseBooleanFlag(value: string | boolean | null | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "on", "yes", "sí", "si"].includes(value.trim().toLowerCase());
}

/**
 * ¿La certificación de esta inspección exige firma?
 *
 * Regla vigente: solo si el hotel activó `INSPECTION_REQUIRES_SIGNATURE` (D-C23). No depende del
 * resultado: rechazar también es un acto del ama que se firma si el flag está activo.
 */
export function requiresInspectionSignature(flag: string | boolean | null | undefined): boolean {
  return parseBooleanFlag(flag);
}

/**
 * Efecto de una inspección sobre la habitación y la asignación.
 *
 *   - `APPROVED` → habitación `CLEAN` (lista para vender) y la asignación queda `DONE`.
 *   - `REJECTED` → habitación `DIRTY` (retrabajo) y la asignación vuelve a `PENDING`; **no** existe
 *     un estado `REJECTED` de asignación (D-C9/C15: el ciclo vuelve a empezar).
 *
 * Importante (D-C9): la inspección **no** toca `publication_status`; aprobar una limpieza no libera
 * la venta por sí mismo.
 */
export function inspectionEffects(result: InspectionResultCode): {
  readonly roomOperationalStatus: Extract<RoomOperationalStatus, "CLEAN" | "DIRTY">;
  readonly reassign: boolean;
} {
  return result === "APPROVED"
    ? { roomOperationalStatus: "CLEAN", reassign: false }
    : { roomOperationalStatus: "DIRTY", reassign: true };
}

/** Los cinco estados operativos canónicos + la marca de bloqueo por mantenimiento. */
export const ROOM_STATE_TOKENS = [
  "CLEAN",
  "DIRTY",
  "OCCUPIED",
  "PENDING_CLEANING",
  "IN_INSPECTION",
  "MAINTENANCE",
] as const;
export type RoomStateToken = (typeof ROOM_STATE_TOKENS)[number];

/** Fila mínima que el tablero necesita (habitación + bloqueo de mantenimiento). */
export interface RoomStateInput {
  readonly roomId: string;
  readonly roomNumber: number;
  readonly roomType: string;
  readonly operationalStatus: RoomOperationalStatus;
  readonly publicationStatus: RoomPublicationStatus;
  /** `true` si hay una incidencia abierta que bloquea la venta (D-53) o publicación MAINTENANCE. */
  readonly blockedByMaintenance: boolean;
}

/** Estado que pinta el tablero: el operativo, salvo que el mantenimiento mande. */
export function roomStateToken(room: RoomStateInput): RoomStateToken {
  if (room.blockedByMaintenance || room.publicationStatus === "MAINTENANCE") return "MAINTENANCE";
  return room.operationalStatus;
}

export interface RoomStateBoardEntry extends RoomStateInput {
  readonly state: RoomStateToken;
}

/**
 * Proyecta las habitaciones al tablero: ordenadas por número y con su estado resuelto. El orden es
 * determinista (las pruebas y el SSE comparan firmas).
 */
export function buildRoomStateBoard(rooms: readonly RoomStateInput[]): RoomStateBoardEntry[] {
  return [...rooms]
    .sort((a, b) => a.roomNumber - b.roomNumber)
    .map((room) => ({ ...room, state: roomStateToken(room) }));
}

/** Recuento por estado canónico (para las tarjetas del tablero). */
export function summarizeRoomStates(
  rooms: readonly RoomStateInput[],
): Record<RoomStateToken, number> {
  const summary = Object.fromEntries(ROOM_STATE_TOKENS.map((token) => [token, 0])) as Record<
    RoomStateToken,
    number
  >;
  for (const room of rooms) summary[roomStateToken(room)] += 1;
  return summary;
}
