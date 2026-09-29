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
  | "actividades"
  | "resenas"
  | "contenido"
  | "mantenimiento"
  | "incidencias"
  | "preventivo"
  | "administracion"
  | "plataforma"
  // Migas de pan de la plantilla (distribución AdminLTE, 2026-09-29).
  | "home"
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
export type AdminSectionKey =
  | "habitacion"
  | "recepcion"
  | "housekeeping"
  | "actividades"
  | "mantenimiento"
  | "administracion"
  | "plataforma";

/**
 * Icono de una sección (AdminLTE). El catálogo vive en `adminIcons.tsx` como
 * `Record<AdminIconKey, …>`, así que una clave nueva **sin dibujo** rompe `tsc`.
 */
export type AdminIconKey = "bed" | "bell" | "sparkles" | "ticket" | "gear" | "chart" | "sliders" | "server";

/** Sección del sidebar: una cabecera desplegable con sus entradas (D-29). */
export interface AdminNavSection {
  readonly key: AdminSectionKey;
  readonly labelKey: AdminNavLabelKey;
  /** Icono de la cabecera; es lo único visible con el sidebar plegado a mini. */
  readonly icon: AdminIconKey;
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
    icon: "bed",
    items: [
      { href: "/admin/habitacion", labelKey: "rooms", role: "DEFAULT_ADMIN_ROLE" },
      { href: "/admin/mint", labelKey: "mint", role: "MINTER_ROLE" },
    ],
  },
  {
    key: "recepcion",
    labelKey: "recepcion",
    icon: "bell",
    items: [{ href: "/admin/caducadas", labelKey: "expired", role: "BURNER_ROLE" }],
  },
  {
    // Sección 4 del plan (F3 · D-51/D-64): el tablero vive en /housekeeping (rol HOUSEKEEPING) y el
    // panel de Lencería con las alertas de stock, en Administración.
    key: "housekeeping",
    labelKey: "housekeeping",
    icon: "sparkles",
    items: [{ href: "/admin/housekeeping/lenceria", labelKey: "lenceria", role: "DEFAULT_ADMIN_ROLE" }],
  },
  {
    // Sección 3 del plan (F5 · D-44): catálogo, horarios con cupo y precios. La recepción inscribe.
    key: "actividades",
    labelKey: "actividades",
    icon: "ticket",
    items: [{ href: "/admin/actividades", labelKey: "actividades", role: "DEFAULT_ADMIN_ROLE" }],
  },
  {
    // Sección 6 del plan (F4 · D-52…D-54): supervisión de incidencias y cronograma preventivo.
    key: "mantenimiento",
    labelKey: "mantenimiento",
    icon: "gear",
    items: [
      { href: "/admin/mantenimiento/incidencias", labelKey: "incidencias", role: "DEFAULT_ADMIN_ROLE" },
      { href: "/admin/mantenimiento/preventivo", labelKey: "preventivo", role: "DEFAULT_ADMIN_ROLE" },
    ],
  },
  {
    key: "administracion",
    labelKey: "administracion",
    icon: "chart",
    items: [
      { href: "/admin/dashboard", labelKey: "dashboard", role: null },
      { href: "/admin/royalty", labelKey: "royalty", role: "DEFAULT_ADMIN_ROLE" },
      { href: "/admin/fondos", labelKey: "funds", role: "TREASURER_ROLE" },
      { href: "/admin/roles", labelKey: "roles", role: "DEFAULT_ADMIN_ROLE" },
      // F6 · D-58: moderación previa de las reseñas de los huéspedes.
      { href: "/admin/resenas", labelKey: "resenas", role: "DEFAULT_ADMIN_ROLE" },
    ],
  },
  {
    key: "plataforma",
    labelKey: "plataforma",
    icon: "sliders",
    items: [
      { href: "/admin/pausa", labelKey: "pause", role: "PAUSER_ROLE" },
      // F6 · D-73/D-74: galería y planes informativos de la home.
      { href: "/admin/contenido", labelKey: "contenido", role: "DEFAULT_ADMIN_ROLE" },
    ],
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

/** Icono del grupo Sistemas (el único que queda visible con el sidebar plegado). */
export const ADMIN_SYSTEMS_ICON: AdminIconKey = "server";

// ---------------------------------------------------------------------------
// Derivaciones puras de la ruta (sin React): son la parte verificable del shell.
// ---------------------------------------------------------------------------

/**
 * ¿`pathname` es `href` o una ruta hija suya? Se exige el separador para que `/admin/mint` no se
 * confunda con un futuro `/admin/mintaje` (defecto clásico del `startsWith` a pelo).
 */
export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sección del acordeón que contiene la ruta activa, o `null` si la ruta es del grupo **Sistemas**
 * (que no es acordeón) o no pertenece a ninguna sección. Devolver `null` en vez de «la primera» es
 * intencionado: con el sidebar plegado/expandido no queremos abrir una sección que no es la actual.
 */
export function sectionForPathname(pathname: string): AdminSectionKey | null {
  return (
    ADMIN_NAV_SECTIONS.find((section) => section.items.some((item) => isActiveHref(pathname, item.href)))?.key ?? null
  );
}

/**
 * Entrada de `href` **más específica** que casa con la ruta: con destinos anidados
 * (`/admin/sistemas` ⊂ `/admin/sistemas/ajustes`) hay que quedarse con el más largo, no con el
 * primero que case (defecto detectado por el guardián del shell).
 */
function bestMatch<T extends { readonly href: string }>(pathname: string, items: readonly T[]): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (!isActiveHref(pathname, item.href)) continue;
    if (best === null || item.href.length > best.href.length) best = item;
  }
  return best;
}

/** Entrada de navegación (con su sección de origen) que corresponde a la ruta activa. */
export function navEntryForPathname(
  pathname: string,
): { readonly section: AdminNavSection; readonly item: AdminNavItem } | null {
  for (const section of ADMIN_NAV_SECTIONS) {
    const item = bestMatch(pathname, section.items);
    if (item) return { section, item };
  }
  return null;
}

/** Miga de pan: destino y clave de etiqueta. */
export interface AdminBreadcrumb {
  readonly href: string;
  readonly labelKey: AdminNavLabelKey;
}

/**
 * Migas de pan de la plantilla (AdminLTE): **Inicio → sección → entrada**. Se derivan de la ruta,
 * no de props, para no tener que tocar las 23 páginas del back-office (alcance acordado del
 * rediseño: solo el shell y el dashboard). Ruta desconocida ⇒ sin migas (la plantilla no inventa
 * un camino que no existe).
 */
export function breadcrumbForPathname(pathname: string): readonly AdminBreadcrumb[] {
  const systems = bestMatch(pathname, ADMIN_SYSTEMS_NAV);
  if (systems) {
    // El grupo Sistemas es plano: Inicio → Sistemas → entrada (sin repetir la portada).
    return systems.href === ADMIN_SYSTEMS_NAV[0]?.href
      ? [{ href: systems.href, labelKey: systems.labelKey }]
      : [{ href: ADMIN_SYSTEMS_NAV[0]!.href, labelKey: ADMIN_SYSTEMS_NAV[0]!.labelKey }, { href: systems.href, labelKey: systems.labelKey }];
  }

  const entry = navEntryForPathname(pathname);
  if (!entry) return [];

  const crumbs: AdminBreadcrumb[] = [{ href: entry.section.items[0]!.href, labelKey: entry.section.labelKey }];
  // Si la etiqueta de la entrada repite la de la sección (p. ej. Actividades), una sola miga.
  if (entry.item.labelKey !== entry.section.labelKey && entry.item.href !== crumbs[0]!.href) {
    crumbs.push({ href: entry.item.href, labelKey: entry.item.labelKey });
  }
  return crumbs;
}
