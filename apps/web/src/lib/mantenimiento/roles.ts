/**
 * Roles con acceso a la **Suite de Mantenimiento vNext** (F4 · D-56).
 *
 * `HEAD_MAINTENANCE` (jefe, con wallet) y `MAINTENANCE_TECH` (técnico, sin wallet) son los roles
 * nuevos; `MAINTENANCE` se conserva para la suite heredada del técnico (D-77) y el owner entra
 * siempre por la rama de gestión del guard.
 */
export const MAINTENANCE_SUITE_ROLES = ["HEAD_MAINTENANCE", "MAINTENANCE_TECH", "MAINTENANCE"] as const;

export type MaintenanceSuiteRole = (typeof MAINTENANCE_SUITE_ROLES)[number];
