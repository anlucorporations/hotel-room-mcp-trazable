import type { ReactElement, ReactNode } from "react";
import type { AdminIconKey } from "./adminNav";

/**
 * Iconos del back-office (distribución AdminLTE, decisión del responsable 2026-09-29).
 *
 * Se dibujan **en línea** y con `currentColor`: no entra ninguna dependencia de iconos en el
 * monorepo (regla de mínima superficie de dependencias) y el color sale siempre de un token por la
 * clase del contenedor (nunca un HEX suelto, que el guardián de identidad rechaza).
 *
 * Todos son **decorativos** (`aria-hidden`): el nombre accesible lo aporta el texto de la entrada,
 * que sigue en el DOM aunque el sidebar esté plegado (se oculta con `sr-only`, no se elimina), de
 * modo que el icono nunca es la única fuente de información (WCAG 1.1.1 y 2.4.4).
 */

export interface AdminIconProps {
  readonly className?: string;
}

function Glyph({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Habitación: cama. */
function BedIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 19V6" />
      <path d="M3 16h18v3" />
      <path d="M3 12h18v4" />
      <circle cx="7.5" cy="9.5" r="1.5" />
      <path d="M11 12V8.5h6a2 2 0 0 1 2 2V12" />
    </Glyph>
  );
}

/** Recepción: campana de mostrador. */
function BellIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 18h16" />
      <path d="M6 18a6 6 0 0 1 12 0" />
      <path d="M10 5.5h4" />
      <path d="M12 5.5V4" />
    </Glyph>
  );
}

/** Housekeeping: destellos de limpieza. */
function SparklesIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M11 3.5 12.5 7.5 16.5 9 12.5 10.5 11 14.5 9.5 10.5 5.5 9 9.5 7.5z" />
      <path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </Glyph>
  );
}

/** Actividades: entrada/tique. */
function TicketIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 9.5V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5z" />
      <path d="M12 6.5v2M12 11v2M12 15.5v2" />
    </Glyph>
  );
}

/** Mantenimiento: engranaje. */
function GearIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </Glyph>
  );
}

/** Administración: barras de métricas. */
function ChartIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 20.5h18" />
      <path d="M6 20.5V12" />
      <path d="M11.5 20.5V5" />
      <path d="M17 20.5v-5.5" />
    </Glyph>
  );
}

/** Plataforma: controles deslizantes. */
function SlidersIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 8h8M17 8h3M4 16h3M12 16h8" />
      <circle cx="14.5" cy="8" r="2.2" />
      <circle cx="9.5" cy="16" r="2.2" />
    </Glyph>
  );
}

/** Sistemas: pilas de servicios. */
function ServerIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="4" width="18" height="6.5" rx="1.5" />
      <rect x="3" y="13.5" width="18" height="6.5" rx="1.5" />
      <path d="M7 7.2h.01M7 16.7h.01" />
    </Glyph>
  );
}

/** Hamburguesa del navbar (móvil). */
export function MenuIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  );
}

/** Plegado del sidebar (desktop): cheurón que apunta al lado del cierre. */
export function CollapseIcon({ collapsed, ...props }: AdminIconProps & { readonly collapsed?: boolean }) {
  return (
    <Glyph {...props}>
      {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
    </Glyph>
  );
}

/** Cheurón del acordeón (gira con la sección abierta). */
export function ChevronIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <path d="M9 6l6 6-6 6" />
    </Glyph>
  );
}

/** Ayuda (único destino de la barra superior, D-81): interrogante en círculo. */
export function HelpIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3" />
      <path d="M12 17.2h.01" />
    </Glyph>
  );
}

/** Cabecera del bloque de sesión del panel Administración (D-81): persona. */
export function UserIcon(props: AdminIconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8" />
    </Glyph>
  );
}

/**
 * Icono de cada sección. El tipo `Record<AdminIconKey, …>` obliga a que **toda** sección del acordeón
 * tenga icono: si se añade una sección sin icono, `tsc` falla (no hay que confiar en una prueba).
 */
export const ADMIN_ICONS: Readonly<Record<AdminIconKey, (props: AdminIconProps) => ReactElement>> = {
  bed: BedIcon,
  bell: BellIcon,
  sparkles: SparklesIcon,
  ticket: TicketIcon,
  gear: GearIcon,
  chart: ChartIcon,
  sliders: SlidersIcon,
  server: ServerIcon,
};
