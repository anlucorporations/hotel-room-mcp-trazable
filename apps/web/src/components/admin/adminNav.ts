import type { RoleName } from "@hotel/shared/domain";

/** Claves i18n de las etiquetas del sidebar del back-office (namespace `admin.nav`). */
export type AdminNavLabelKey =
  | "mint"
  | "dashboard"
  | "royalty"
  | "pause"
  | "funds"
  | "expired"
  | "roles";

export interface AdminNavItem {
  readonly href: string;
  readonly labelKey: AdminNavLabelKey;
  /**
   * Rol on-chain que habilita el panel (gating de UI, CU-01, docs/SRS.md §9). `null` = cualquier sesión
   * válida (p. ej. Métricas, rol de visor: basta tener ≥1 rol para autenticarse).
   */
  readonly role: RoleName | null;
}

/**
 * Entradas del back-office (docs/SRS.md §7). Una sola fuente para el sidebar y el gating
 * por rol de cada página, alineada con los CU: Royalty→DEFAULT_ADMIN (D-06, panel informativo
 * de gobierno del propietario: el contrato ya no tiene un rol de royalty), Pausa→PAUSER
 * (CU-14), Fondos→TREASURER (CU-15), Caducadas→BURNER (CU-13), Roles→DEFAULT_ADMIN (CU-16).
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin/mint", labelKey: "mint", role: "MINTER_ROLE" },
  { href: "/admin/dashboard", labelKey: "dashboard", role: null },
  { href: "/admin/royalty", labelKey: "royalty", role: "DEFAULT_ADMIN_ROLE" },
  { href: "/admin/pausa", labelKey: "pause", role: "PAUSER_ROLE" },
  { href: "/admin/fondos", labelKey: "funds", role: "TREASURER_ROLE" },
  { href: "/admin/caducadas", labelKey: "expired", role: "BURNER_ROLE" },
  { href: "/admin/roles", labelKey: "roles", role: "DEFAULT_ADMIN_ROLE" },
];
