/**
 * Vocabulario de mantenimiento (F4 · D-52…D-54).
 *
 * Vive en el dominio **isomorfo** (`@hotel/shared/domain`) para que los componentes de cliente
 * puedan ofrecer las mismas opciones que valida el servidor sin importar el barril raíz (que
 * arrastra `pg`/BullMQ). El repositorio de mantenimiento consume estas constantes.
 */

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
