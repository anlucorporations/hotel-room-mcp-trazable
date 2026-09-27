import type { RoleName } from "@hotel/shared/domain";

/** Claves i18n de las etiquetas del sidebar del back-office (namespace `admin.nav`). */
export type AdminNavLabelKey =
  | "mint"
  | "dashboard"
  | "royalty"
  | "pause"
  | "funds"
  | "expired"
  | "roles"
  // Secciones del acordeón (D-29)
  | "habitacion"
  | "rooms"
  | "recepcion"
  | "housekeeping"
  | "lenceria"
  | "administracion"
  | "plataforma"
  // Grupo «Sistemas» (incremento v3, solo owner): RF-41.
  | "systems"
  | "contracts"
  | "systemUsers"
  | "finances"
  | "operations"
  | "settings";

export interface AdminNavItem {
  readonly href: string;
  readonly labelKey: AdminNavLabelKey;
  /**
   * Rol on-chain que habilita el panel (gating de UI, CU-01, docs/SRS.md §9). `null` = cualquier sesión
   * válida (p. ej. Métricas, rol de visor: basta tener ≥1 rol para autenticarse).
   */
  readonly role: RoleName | null;
}

/** Clave estable de cada sección del acordeón. */
export type AdminSectionKey = "habitacion" | "recepcion" | "housekeeping" | "administracion" | "plataforma";

/** Sección del sidebar: una cabecera desplegable con sus entradas (D-29). */
export interface AdminNavSection {
  readonly key: AdminSectionKey;
  readonly labelKey: AdminNavLabelKey;
  readonly items: readonly AdminNavItem[];
}

/**
 * Secciones del back-office (D-29: sidebar derecha con menú acordeón, **una sección abierta a la vez**).
 *
 * Es la única fuente de la navegación: `ADMIN_NAV` se deriva de aquí para quien necesite la lista plana.
 * Las secciones que aún no tienen pantallas (Actividades, Mantenimiento) se incorporarán en sus fases;
 * hoy se listan solo las que existen, para no ofrecer enlaces muertos. Housekeeping entra en F3 con su
 * panel de Lencería (el tablero vive en la ruta de personal `/housekeeping`, D-62).
 */
export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  {
    key: "habitacion",
    labelKey: "habitacion",
    items: [
      { href: "/admin/habitacion", labelKey: "rooms", role: "DEFAULT_ADMIN_ROLE" },
      { href: "/admin/mint", labelKey: "mint", role: "MINTER_ROLE" },
    ],
  },
  {
    key: "recepcion",
    labelKey: "recepcion",
    items: [{ href: "/admin/caducadas", labelKey: "expired", role: "BURNER_ROLE" }],
  },
  {
    // Sección 4 del plan (F3 · D-51/D-64): el tablero vive en /housekeeping (rol HOUSEKEEPING) y el
    // panel de Lencería con las alertas de stock, en Administración.
    key: "housekeeping",
    labelKey: "housekeeping",
    items: [{ href: "/admin/housekeeping/lenceria", labelKey: "lenceria", role: "DEFAULT_ADMIN_ROLE" }],
  },
  {
    key: "administracion",
    labelKey: "administracion",
    items: [
      { href: "/admin/dashboard", labelKey: "dashboard", role: null },
      { href: "/admin/royalty", labelKey: "royalty", role: "DEFAULT_ADMIN_ROLE" },
      { href: "/admin/fondos", labelKey: "funds", role: "TREASURER_ROLE" },
      { href: "/admin/roles", labelKey: "roles", role: "DEFAULT_ADMIN_ROLE" },
    ],
  },
  {
    key: "plataforma",
    labelKey: "plataforma",
    items: [{ href: "/admin/pausa", labelKey: "pause", role: "PAUSER_ROLE" }],
  },
];

/** Lista plana derivada de las secciones (compatibilidad con consumidores existentes). */
export const ADMIN_NAV: readonly AdminNavItem[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Sección **Sistemas** (incremento v3, RF-41): gestión de la plataforma, visible y accesible
 * **solo** para el owner (`DEFAULT_ADMIN_ROLE`). La primera entrada es la portada del grupo.
 */
export const ADMIN_SYSTEMS_NAV: readonly AdminNavItem[] = [
  { href: "/admin/sistemas", labelKey: "systems", role: "DEFAULT_ADMIN_ROLE" },
  { href: "/admin/sistemas/contratos", labelKey: "contracts", role: "DEFAULT_ADMIN_ROLE" },
  { href: "/admin/sistemas/usuarios", labelKey: "systemUsers", role: "DEFAULT_ADMIN_ROLE" },
  { href: "/admin/sistemas/finanzas", labelKey: "finances", role: "DEFAULT_ADMIN_ROLE" },
  { href: "/admin/sistemas/operaciones", labelKey: "operations", role: "DEFAULT_ADMIN_ROLE" },
  { href: "/admin/sistemas/ajustes", labelKey: "settings", role: "DEFAULT_ADMIN_ROLE" },
];
