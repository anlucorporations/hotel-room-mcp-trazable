import type { ReactNode } from "react";

/**
 * Iconos de la tabla de habitaciones del back-office (2026-10-04, tablero Admin).
 *
 * Se dibujan **en línea** y con `currentColor` — misma regla que `adminIcons.tsx`: no entra ninguna
 * dependencia de iconos de terceros y el color sale siempre de un token por la clase del contenedor
 * (nunca un HEX suelto, que el guardián de identidad rechaza).
 *
 * Todos son **decorativos** (`aria-hidden`): el nombre accesible lo aporta el texto/`title` de la celda,
 * de modo que el icono nunca es la única fuente de información (WCAG 1.1.1 / 2.4.4).
 */

export interface RoomIconProps {
  readonly className?: string;
  /** Tamaño en px (por defecto 14, más chico que el 18 del nav del back-office). */
  readonly size?: number;
}

function RoomGlyph({ className, size = 14, children }: RoomIconProps & { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
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

/** Borrador: lápiz. */
export function DraftIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-2.2-2.2a2 2 0 0 0-2.8 0L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </RoomGlyph>
  );
}

/** Publicada: marca en círculo. */
export function PublishedIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </RoomGlyph>
  );
}

/** Pausada: dos barras. */
export function PausedIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M9.5 5.5v13M14.5 5.5v13" />
    </RoomGlyph>
  );
}

/** En mantenimiento: engranaje. */
export function MaintenanceIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </RoomGlyph>
  );
}

/** Fuera de servicio: círculo con diagonal. */
export function OutOfServiceIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.8 5.8l12.4 12.4" />
    </RoomGlyph>
  );
}

/** Limpia: destellos. */
export function CleanIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M11 3.5 12.5 7.5 16.5 9 12.5 10.5 11 14.5 9.5 10.5 5.5 9 9.5 7.5z" />
      <path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </RoomGlyph>
  );
}

/** Sucia: gota. */
export function DirtyIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z" />
    </RoomGlyph>
  );
}

/** Ocupada: cama. */
export function OccupiedIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M3 19V6" />
      <path d="M3 16h18v3" />
      <path d="M3 12h18v4" />
      <circle cx="7.5" cy="9.5" r="1.5" />
      <path d="M11 12V8.5h6a2 2 0 0 1 2 2V12" />
    </RoomGlyph>
  );
}

/** Con noches reservadas: calendario con punto. */
export function ReservedIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </RoomGlyph>
  );
}

/** Acción rápida «Publicar»: flecha de publicar (subir a los viajeros). */
export function QuickPublishIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 16v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V16" />
    </RoomGlyph>
  );
}

/** Acción rápida «Reservar»: calendario con signo de suma. */
export function QuickReserveIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M12 12.5v4M10 14.5h4" />
    </RoomGlyph>
  );
}

/** Acción rápida «Activar/Desactivar»: botón de encendido. */
export function QuickToggleIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M12 3v8" />
      <path d="M6.3 6.5a8 8 0 1 0 11.4 0" />
    </RoomGlyph>
  );
}

/** Cabecera masiva: grid de selección (cuadrados con marca). */
export function BulkSelectIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M15.5 17l1.5 1.5 3-3" />
    </RoomGlyph>
  );
}

/** Acción masiva «Liberar»: candado abierto. */
export function BulkReleaseIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 7.8-1.2" />
      <path d="M12 14.5v2" />
    </RoomGlyph>
  );
}

/** Cerrar el modo de selección masiva: X. */
export function BulkCancelIcon(props: RoomIconProps) {
  return (
    <RoomGlyph {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </RoomGlyph>
  );
}
