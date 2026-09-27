/**
 * Accesos a las suites desde el menú de Usuario de la suite pública (D-76/D-77).
 *
 * Función **pura** para poder probarla sin DOM: dada la lista de roles de la sesión, decide qué
 * suites puede abrir el usuario. Es **solo vista**: cada suite vuelve a exigir su rol en servidor
 * (guard de API y gate de layout), así que ocultar o mostrar un enlace no concede permisos.
 *
 * Criterio acordado con el responsable:
 *   - **Owner** (`DEFAULT_ADMIN_ROLE`): las cuatro suites.
 *   - **Recepción** (`RECEPTION_ROLE`): Front Office.
 *   - **Housekeeping** y **Mantenimiento**: su propia ruta de personal.
 *   - Cualquier otro rol de back-office (minter, pauser, burner, tesorería): Administración.
 *   - **Sin sesión**: ningún acceso (el menú solo ofrece iniciar sesión).
 */

export type SuiteKey = "admin" | "reception" | "housekeeping" | "maintenance";

export interface SuiteLink {
  readonly key: SuiteKey;
  /** Ruta de entrada de la suite. */
  readonly href: string;
  /** Clave i18n de la etiqueta (namespace `walletMenu`). */
  readonly labelKey: "suiteAdmin" | "suiteReception" | "suiteHousekeeping" | "suiteMaintenance";
}

const ADMIN: SuiteLink = { key: "admin", href: "/admin", labelKey: "suiteAdmin" };
const RECEPTION: SuiteLink = { key: "reception", href: "/recepcion", labelKey: "suiteReception" };
const HOUSEKEEPING: SuiteLink = { key: "housekeeping", href: "/housekeeping", labelKey: "suiteHousekeeping" };
const MAINTENANCE: SuiteLink = { key: "maintenance", href: "/mantenimiento", labelKey: "suiteMaintenance" };

/** Roles on-chain que siguen siendo back-office aunque no tengan una suite propia. */
const BACK_OFFICE_ONLY_ROLES = new Set([
  "MINTER_ROLE",
  "PAUSER_ROLE",
  "BURNER_ROLE",
  "TREASURER_ROLE",
]);

/** Suites accesibles para los roles dados, en el orden del plan (Administración primero). */
export function suiteLinksForRoles(roles: readonly string[], isOwner = false): readonly SuiteLink[] {
  const set = new Set(roles);

  if (isOwner || set.has("DEFAULT_ADMIN_ROLE")) {
    return [ADMIN, RECEPTION, HOUSEKEEPING, MAINTENANCE];
  }

  const links: SuiteLink[] = [];
  if (set.has("RECEPTION_ROLE")) links.push(RECEPTION);
  if (set.has("HOUSEKEEPING")) links.push(HOUSEKEEPING);
  if (set.has("MAINTENANCE")) links.push(MAINTENANCE);

  // Un operador de back-office sin suite propia (minter, pauser, burner, tesorería) entra por
  // Administración; sin roles no se ofrece ningún acceso.
  if (links.length === 0 && [...set].some((role) => BACK_OFFICE_ONLY_ROLES.has(role))) {
    links.push(ADMIN);
  }
  return links;
}
