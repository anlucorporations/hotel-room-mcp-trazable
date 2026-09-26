import type { RoleName } from "@hotel/shared/domain";

/**
 * Política de gating del back-office (D-30, CU-30).
 *
 * El owner del hotel es la cuenta con `DEFAULT_ADMIN_ROLE` (`admin@hotel.es`). Antes de este
 * incremento, la sesión solo llevaba UN rol y cada panel exigía el suyo (`MINTER_ROLE`,
 * `PAUSER_ROLE`…), así que el owner veía bloqueados Publicar, Pausa, Fondos y Caducadas: era
 * imposible operar el hotel con la cuenta de gobierno.
 *
 * Decisión D-30: `DEFAULT_ADMIN_ROLE` **implica** cualquier rol a efectos de UI y de guard de API.
 * No es una elevación de privilegios on-chain: al firmar, el contrato sigue comprobando `hasRole`
 * con su propia tabla de AccessControl y revierte si la wallet no ostenta el rol. Esto es UX y
 * autorización de aplicación, no autoridad de cadena (RF-30.2).
 */
export function roleSatisfies(
  sessionRoles: readonly RoleName[],
  required: RoleName,
): boolean {
  if (sessionRoles.includes("DEFAULT_ADMIN_ROLE")) return true;
  return sessionRoles.includes(required);
}

/**
 * ¿La sesión satisface el requisito del panel? `required === null` = cualquier sesión válida
 * (p. ej. Métricas, rol de visor).
 */
export function sessionAllows(
  sessionRoles: readonly RoleName[],
  required: RoleName | null,
): boolean {
  return required === null || roleSatisfies(sessionRoles, required);
}
