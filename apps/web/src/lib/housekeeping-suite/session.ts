import "server-only";
import { currentAdminSession } from "@/lib/admin-session";
import type { GuardResult } from "@/lib/guard";

/**
 * Sesión de la **Suite Ama de llaves** (F6) y utilidades de rol.
 *
 * `HEAD_KEEPER` (ama, con wallet para la inspección opcional), `HOUSEKEEPER` (camarera, sin wallet)
 * y `HOUSEKEEPING` (rol heredado) entran a la suite; el owner entra siempre por la rama de gestión.
 *
 * Se comprueba en el layout y **otra vez en cada página RSC** (M7 · H1): el payload de la página
 * viaja aunque el layout muestre el acceso, así que sin la segunda comprobación un anónimo recibiría
 * los datos.
 */
export const HOUSEKEEPING_SUITE_ROLES = ["HEAD_KEEPER", "HOUSEKEEPER", "HOUSEKEEPING"] as const;

export async function currentHousekeepingSession(): Promise<GuardResult> {
  return currentAdminSession([...HOUSEKEEPING_SUITE_ROLES]);
}

/**
 * ¿El rol puede **certificar inspecciones**? Solo el ama (`HEAD_KEEPER`) y el owner; las camareras
 * limpian y reportan, no certifican (la venta no se libera por su acción: D-C9).
 */
export function canInspectAs(role: string): boolean {
  return role === "HEAD_KEEPER" || role === "DEFAULT_ADMIN_ROLE";
}

/** ¿El rol puede reportar averías al mantenimiento desde la suite? (CU-V-23; camareras incluidas). */
export function canReportIncidentsAs(role: string): boolean {
  return ["HEAD_KEEPER", "HOUSEKEEPER", "HOUSEKEEPING", "DEFAULT_ADMIN_ROLE"].includes(role);
}
