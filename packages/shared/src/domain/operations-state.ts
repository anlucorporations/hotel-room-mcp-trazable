/**
 * Vocabulario canónico de **estados y tipos de entidad** de la vNext (F1 · T1.6).
 *
 * El SQL es la fuente de verdad (`RepoTecnico/base_datos.sql` y el bloque vNext de
 * `packages/shared/src/db/migrator.ts`): los `CHECK` del esquema son los que impiden escribir un valor
 * inventado. Este módulo declara esos mismos valores **una sola vez** en TypeScript, para que el
 * repositorio, las suites y los guardianes dejen de tener copias que se desvían. La exhaustividad
 * (valores ↔ `CHECK`, y longitud ↔ `VARCHAR`) la vigila `operations-state.test.ts`.
 *
 * Vive en el dominio **isomorfo** (`@hotel/shared/domain`): no importa `pg`, `ioredis`, `bullmq` ni
 * builtins de servidor, así que un componente de cliente puede tipar con el mismo vocabulario que
 * valida el servidor.
 */

// ---------------------------------------------------------------------------
// Firma on-chain (`on_chain_signatures`)
// ---------------------------------------------------------------------------

/** Tipos de entidad firmable (`on_chain_signatures.entity_type`, CHECK del esquema). */
export const SIGNATURE_ENTITY_TYPES = [
  "ROOM_BLOCK",
  "ROOM_UNBLOCK",
  "INSPECTION",
  "DAMAGE_CHARGE",
  "PREVENTIVE_TASK",
  "AREA_LOG",
  "CONFIG",
] as const;
export type SignatureEntityType = (typeof SIGNATURE_ENTITY_TYPES)[number];

/**
 * Estados del *outbox* de anclaje (`on_chain_signatures.status`, CHECK del esquema).
 *
 * La **política de transición** la ejecuta `OperationsRepository` con `WHERE` acotados
 * (`PENDING → SIGNED → MINED`, con `FAILED` para el reintento y `REVOKED` para lo que ya no aplica);
 * aquí solo se declara el vocabulario cerrado, porque el repositorio es el único que puede cambiarlo.
 */
export const SIGNATURE_STATUSES = ["PENDING", "SIGNED", "MINED", "FAILED", "REVOKED"] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Habitación (`rooms`): dos estados independientes (D-19)
// ---------------------------------------------------------------------------

/** Estado de publicación (`rooms.publication_status`): lo decide el administrador. */
export const ROOM_PUBLICATION_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "PAUSED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;
export type RoomPublicationStatus = (typeof ROOM_PUBLICATION_STATUSES)[number];

/**
 * Estado operativo (`rooms.operational_status`): lo actualizan ama de llaves, mantenimiento y recepción.
 *
 * `IN_INSPECTION` lo añade la vNext (F1): una habitación en revisión por el ama de llaves no se puede
 * ofrecer como `CLEAN` hasta que la inspección se resuelva.
 */
export const ROOM_OPERATIONAL_STATUSES = [
  "CLEAN",
  "DIRTY",
  "OCCUPIED",
  "PENDING_CLEANING",
  "IN_INSPECTION",
] as const;
export type RoomOperationalStatus = (typeof ROOM_OPERATIONAL_STATUSES)[number];

// ---------------------------------------------------------------------------
// Validación del preventivo (`preventive_tasks.validation_status`, admite NULL)
// ---------------------------------------------------------------------------

/** Validación del jefe (`preventive_tasks.validation_status`); `NULL` = sin exigir validación (D-C34). */
export const PREVENTIVE_VALIDATION_STATUSES = [
  "PENDING_VERIFICATION",
  "VALIDATED",
  "PENDING_VERIFICATION_EXPIRED",
] as const;
export type PreventiveValidationStatus = (typeof PREVENTIVE_VALIDATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Alertas de suministros (`supply_alerts.status`, D-C33)
// ---------------------------------------------------------------------------

/** Estado de la alerta de stock bajo umbral (`supply_alerts.status`). */
export const SUPPLY_ALERT_STATUSES = ["OPEN", "CLOSED"] as const;
export type SupplyAlertStatus = (typeof SUPPLY_ALERT_STATUSES)[number];
