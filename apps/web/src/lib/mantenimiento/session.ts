import "server-only";
import { currentAdminSession } from "@/lib/admin-session";
import type { GuardResult } from "@/lib/guard";
import { MAINTENANCE_SUITE_ROLES } from "./roles";

/**
 * Sesión verificada de la **Suite de Mantenimiento** (F4).
 *
 * Se comprueba en el **layout** (puerta visible) y otra vez en **cada página RSC** antes de leer
 * datos. Motivo (lección de M7 · H1, comprobada otra vez en F4): el layout decide si pinta a sus
 * hijos, pero el payload RSC de la página puede generarse y viajar en la respuesta aunque la puerta
 * muestre el acceso. Sin esta segunda comprobación, un anónimo recibía en el HTML los datos del
 * dashboard. La página devuelve `null` cuando no hay sesión: el layout ya pinta `AdminSignInScreen`.
 */
export async function currentMaintenanceSession(): Promise<GuardResult> {
  return currentAdminSession([...MAINTENANCE_SUITE_ROLES]);
}
