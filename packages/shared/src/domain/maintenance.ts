/**
 * Vocabulario de mantenimiento (F4 · D-52…D-54).
 *
 * Vive en el dominio **isomorfo** (`@hotel/shared/domain`) para que los componentes de cliente
 * puedan ofrecer las mismas opciones que valida el servidor sin importar el barril raíz (que
 * arrastra `pg`/BullMQ). El repositorio de mantenimiento consume estas constantes.
 */

import type { RoomPublicationStatus } from "./operations-state";

/** Tipos de avería que ofrece la interfaz (la columna de BD admite texto libre). */
export const MAINTENANCE_KINDS = [
  "ELECTRICIDAD",
  "FONTANERIA",
  "CLIMATIZACION",
  "MOBILIARIO",
  "ELECTRODOMESTICO",
  "CERRADURA",
  "OTROS",
] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

/** Prioridad de una incidencia. */
export const MAINTENANCE_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

/** Estados del ciclo de vida de una incidencia. */
export const MAINTENANCE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** Periodicidades del mantenimiento preventivo (D-54). */
export const PREVENTIVE_PERIODICITIES = ["WEEKLY", "MONTHLY", "QUARTERLY"] as const;
export type PreventivePeriodicity = (typeof PREVENTIVE_PERIODICITIES)[number];

/** Días que añade cada periodicidad para programar la siguiente tarea (D-54). */
export const PREVENTIVE_PERIOD_DAYS: Readonly<Record<PreventivePeriodicity, number>> = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
};

// ─────────────────────────────────────────────────────────────────────────────
// Firma on-chain selectiva (F4 · D-C23, D-C27, D-C34)
// ─────────────────────────────────────────────────────────────────────────────


/** Acciones operativas que la suite de mantenimiento puede firmar con EIP-712 (F2/F3). */
export const MAINTENANCE_SIGNATURE_ACTIONS = [
  "ROOM_BLOCK",
  "ROOM_UNBLOCK",
  "PREVENTIVE_TASK",
  "INSPECTION",
] as const;
export type MaintenanceSignatureAction = (typeof MAINTENANCE_SIGNATURE_ACTIONS)[number];

/** Estado de publicación que representa «habitación bloqueada por mantenimiento» (D-V7). */
export const MAINTENANCE_PUBLICATION_STATUS = "MAINTENANCE" as const satisfies RoomPublicationStatus;

/** Opciones que modulan la exigencia de firma (flags de entorno, D-C23). */
export interface MaintenanceSignatureOptions {
  /** `true` si el área/equipo es crítico (`maintenance_area_types.is_critical`, H-02). */
  readonly isCritical?: boolean;
  /** `INSPECTION_REQUIRES_SIGNATURE` (por defecto `false` por D-C23). */
  readonly inspectionRequiresSignature?: boolean;
}

/**
 * ¿Esta acción exige firma EIP-712 del jefe?
 *
 * Regla única del ciclo F4 (D-C23/D-C34) para que cliente y servidor no decidan distinto:
 *   · **Bloquear/desbloquear una habitación** → SIEMPRE firmado (afecta a la venta pública).
 *   · **Verificar tarea preventiva** → firmado solo si el área es **crítica** (piscina, bomba,
 *     ascensor, generador…); las no críticas se registran off-chain.
 *   · **Inspección de ama de llaves** → firmado solo si `INSPECTION_REQUIRES_SIGNATURE` está activo
 *     (`false` por defecto, D-C23).
 */
export function requiresSignatureForMaintenanceAction(
  action: MaintenanceSignatureAction,
  options: MaintenanceSignatureOptions = {},
): boolean {
  switch (action) {
    case "ROOM_BLOCK":
    case "ROOM_UNBLOCK":
      return true;
    case "PREVENTIVE_TASK":
      return options.isCritical === true;
    case "INSPECTION":
      return options.inspectionRequiresSignature === true;
  }
}

/** Atajo: una tarea preventiva exige firma si su área es crítica. */
export function preventiveTaskRequiresSignature(isCritical: boolean): boolean {
  return requiresSignatureForMaintenanceAction("PREVENTIVE_TASK", { isCritical });
}

/**
 * Estado de publicación al que vuelve una habitación tras un **desbloqueo firmado**.
 *
 * No se inventa un estado: se recupera el que tenía antes del bloqueo (`room_status_history`) y,
 * si no hay historial, se deja en `DRAFT` (D-14: la siembra crea inventario administrable; publicar
 * vuelve a ser un acto explícito del administrador). Nunca se restaura a `MAINTENANCE`.
 */
export function publicationStatusAfterUnblock(
  previousStatus: string | null | undefined,
): RoomPublicationStatus {
  const allowed: readonly RoomPublicationStatus[] = [
    "DRAFT",
    "PUBLISHED",
    "PAUSED",
    "OUT_OF_SERVICE",
  ];
  const candidate = typeof previousStatus === "string" ? (previousStatus as RoomPublicationStatus) : null;
  return candidate !== null && allowed.includes(candidate) ? candidate : "DRAFT";
}

/**
 * ¿La habitación está fuera del canal público por mantenimiento? Regla pura para la UI y el catálogo:
 * o su publicación es `MAINTENANCE`, o tiene una incidencia abierta que bloquea la venta (D-53).
 */
export function isRoomBlockedByMaintenance(
  publicationStatus: string | null | undefined,
  hasOpenBlockingIncident = false,
): boolean {
  return publicationStatus === MAINTENANCE_PUBLICATION_STATUS || hasOpenBlockingIncident;
}
