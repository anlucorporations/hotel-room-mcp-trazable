import type { RoomSeedEntry } from "./room-registry";
import { roomTypeOf } from "./room-master";

/**
 * Reconciliación **habitaciones** (off-chain `rooms` ↔ on-chain registro de `HotelNights`).
 *
 * Nace del desfase real del 2026-10-18: la cadena C2 tenía registrada solo la habitación 201 y la
 * base `rooms` estaba **vacía**, mientras el índice `nfts` conservaba 98 noches heredadas de C1.
 * El catálogo público ofrecía noches de una habitación que el maestro no administraba.
 *
 * Este módulo es **puro** (sin BD, sin RPC) para poder probar las tres preguntas que la
 * reconciliación necesita responder sin red:
 *   1. ¿Qué habitaciones del maestro faltan en la base (`rooms`)? → plan de siembra (D-14).
 *   2. ¿El registro on-chain y la base están de acuerdo (existencia y tipo)? → auditoría.
 *   3. ¿Qué filas del índice no existen en la cadena vigente? → lo que hay que purgar.
 */

/** Discrepancia entre el maestro/registro on-chain y la base. */
export interface RoomReconciliationIssue {
  readonly kind:
    | "MISSING_IN_DB"
    | "TYPE_MISMATCH"
    | "NOT_IN_MASTER"
    | "DB_TYPE_NOT_CANONICAL"
    | "PUBLISHED_NOT_REGISTERED"
    | "ARCHIVED_BUT_REGISTERED";
  readonly roomNumber: number;
  readonly detail: string;
}

/** Discrepancia entre el índice off-chain (`nfts`) y la cadena vigente. */
export interface IndexReconciliationIssue {
  readonly kind: "STALE_TOKEN" | "UNKNOWN_ROOM";
  readonly tokenId: string;
  readonly detail: string;
}

/** Fila mínima del maestro (`rooms`) que necesita la auditoría. */
export interface DbRoomRow {
  readonly roomNumber: number;
  readonly roomType: string;
  readonly publicationStatus: string;
  readonly archivedAt: Date | string | null;
}

/** Habitación registrada on-chain según los eventos `RoomRegistered`. */
export interface ChainRoomRow {
  readonly room: number;
  /** Texto tal y como llegó del contrato (`simple`/`doble`/`suite`). */
  readonly roomType: string;
}

const canonicalType = (value: string): "simple" | "doble" | "suite" | null => {
  const normalized = value.trim().toLowerCase();
  return normalized === "simple" || normalized === "doble" || normalized === "suite"
    ? normalized
    : null;
};

/**
 * Habitaciones del maestro canónico (`buildRoomSeed`) que **no** están en la base. Se siembran en
 * `DRAFT` (D-14): la siembra crea el inventario administrable; publicar sigue siendo un acto del
 * administrador (y el catálogo no las ofrecerá hasta entonces).
 */
export function planMasterSeed(
  existingNumbers: ReadonlySet<number>,
  seed: readonly RoomSeedEntry[],
): RoomSeedEntry[] {
  return seed
    .filter((room) => !existingNumbers.has(room.roomNumber))
    .sort((a, b) => a.roomNumber - b.roomNumber);
}

/**
 * Audita la coherencia habitaciones ↔ registro on-chain. No corrige nada: devuelve la lista de
 * problemas con una explicación accionable. Reglas:
 *   - Toda habitación **registrada on-chain** debe existir en la base (la base es la fuente, D-3).
 *   - Su tipo on-chain debe coincidir con el tipo de la base (el contrato fija el royalty por tipo
 *     y `roomTypeOf` guía la tarjeta).
 *   - Ninguna habitación fuera del maestro canónico debe estar registrada (es inventario inventado).
 *   - El tipo de la base debe ser el del maestro (SIMPLE/DOBLE/SUITE por rango).
 *   - Una habitación **publicada** debe estar registrada (esa es la secuencia de la UI: registrar y
 *     anclar al publicar).
 *   - Una habitación **archivada** no debería seguir registrada (deuda a resolver en ventana de
 *     contrato; se informa, no se puede desregistrar en el contrato actual).
 */
export function auditRoomsVsChain(input: {
  readonly dbRooms: readonly DbRoomRow[];
  readonly chainRooms: readonly ChainRoomRow[];
}): RoomReconciliationIssue[] {
  const issues: RoomReconciliationIssue[] = [];
  const dbByNumber = new Map(input.dbRooms.map((room) => [room.roomNumber, room]));
  const chainByNumber = new Map(input.chainRooms.map((room) => [room.room, room]));

  for (const chain of input.chainRooms) {
    const db = dbByNumber.get(chain.room);
    if (!db) {
      issues.push({
        kind: "MISSING_IN_DB",
        roomNumber: chain.room,
        detail: `registrada on-chain como «${chain.roomType}» pero sin fila en rooms`,
      });
      continue;
    }
    if (canonicalType(chain.roomType) !== canonicalType(db.roomType)) {
      issues.push({
        kind: "TYPE_MISMATCH",
        roomNumber: chain.room,
        detail: `on-chain «${chain.roomType}» ≠ base «${db.roomType}»`,
      });
    }
    if (db.archivedAt !== null && db.archivedAt !== undefined) {
      issues.push({
        kind: "ARCHIVED_BUT_REGISTERED",
        roomNumber: chain.room,
        detail: "archivada en la base pero sigue registrada en el contrato",
      });
    }
  }

  for (const db of input.dbRooms) {
    const expected = roomTypeOf(db.roomNumber);
    if (expected !== null && canonicalType(db.roomType) !== expected) {
      issues.push({
        kind: "DB_TYPE_NOT_CANONICAL",
        roomNumber: db.roomNumber,
        detail: `base «${db.roomType}» ≠ maestro «${expected}»`,
      });
    }
    if (expected === null) {
      issues.push({
        kind: "NOT_IN_MASTER",
        roomNumber: db.roomNumber,
        detail: "el número no pertenece al maestro canónico",
      });
    }
    if (
      db.publicationStatus === "PUBLISHED" &&
      (db.archivedAt === null || db.archivedAt === undefined) &&
      !chainByNumber.has(db.roomNumber)
    ) {
      issues.push({
        kind: "PUBLISHED_NOT_REGISTERED",
        roomNumber: db.roomNumber,
        detail: "publicada en la base pero sin registro on-chain (la UI la registraría al publicar)",
      });
    }
  }

  return issues.sort((a, b) => a.roomNumber - b.roomNumber || a.kind.localeCompare(b.kind));
}

/**
 * Separa las filas del índice en las que **existen** en el contrato vigente y las heredadas de otra
 * cadena/contrato. La comparación es por `tokenId` (no por fecha ni por totales): el redeploy C2
 * cambió el contrato y las filas C1 quedaron `on_chain_anchored = TRUE` para siempre.
 */
export function splitIndexAgainsChain(
  indexTokenIds: readonly string[],
  chainTokenIds: ReadonlySet<string>,
): { keep: string[]; stale: string[] } {
  const keep: string[] = [];
  const stale: string[] = [];
  for (const tokenId of indexTokenIds) {
    (chainTokenIds.has(tokenId) ? keep : stale).push(tokenId);
  }
  return { keep: keep.sort(), stale: stale.sort() };
}
