"use client";

import type { ReactNode, RefObject } from "react";
import { useModalDialog } from "./useModalDialog";

/**
 * **Diálogo flotante** compartido por las suites de personal (Admin, Recepción, Mantenimiento y
 * Ama de llaves).
 *
 * Estructura fija en tres partes, para que todos los formularios y fichas se vean y se comporten
 * igual (2026-10-06):
 *
 *   · **Título** (`<header>`): título, subtítulo opcional, acciones de cabecera y el botón de cierre.
 *   · **Cuerpo** (`<div>`): el contenido, con scroll propio si no cabe.
 *   · **Pie** (`<footer>`, opcional): los botones de la operación (Cancelar / Guardar / Confirmar…).
 *
 * El comportamiento accesible (foco al abrir, trampa de foco, `Escape`, devolución del foco al
 * disparador) lo aporta `useModalDialog`.
 */

const CLOSE =
  "min-h-touch min-w-touch flex-none rounded-brand text-h4 leading-none text-ink-soft transition-colors hover:bg-mist-2";

/** Botón principal del pie (acción que confirma la operación). */
export const MODAL_PRIMARY =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/** Botón secundario del pie (cancelar, cerrar, volver). */
export const MODAL_SECONDARY =
  "min-h-touch rounded-pill border border-line px-4 font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/** Botón destructivo del pie (quemar, revocar, archivar). */
export const MODAL_DANGER =
  "min-h-touch rounded-pill bg-coral-text px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";

export interface ModalShellProps {
  /** Título del diálogo; se pinta en el `<h2>` que referencia `aria-labelledby`. */
  title: ReactNode;
  /** Texto bajo el título (opcional). */
  subtitle?: ReactNode;
  /** Nombre accesible del botón de cierre (texto visible: «×»). */
  closeLabel: string;
  /** Cierra el diálogo (botón de cierre, velo o `Escape`). */
  onClose: () => void;
  /** `false` cuando hay otro diálogo apilado encima: ese otro manda con `Escape` y con `Tab`. */
  enabled?: boolean;
  /** `data-testid` del panel para las pruebas. */
  testId: string;
  /** Acciones del encabezado (pausar, publicar, archivar…). */
  actions?: ReactNode;
  /** Control que recibe el foco al abrir; por defecto, el primer control del panel. */
  initialFocus?: RefObject<HTMLElement>;
  /** Utilidad de ancho del panel (`max-w-2xl` por defecto). */
  panelClassName?: string;
  /**
   * Botones del pie. Se suele pasar un `<ModalFooter>`; si se omite, no se pinta el pie.
   */
  footer?: ReactNode;
  /** `data-testid` del pie (opcional). */
  footerTestId?: string;
  children: ReactNode;
}

export function ModalShell({
  title,
  subtitle,
  closeLabel,
  onClose,
  enabled = true,
  testId,
  actions,
  initialFocus,
  panelClassName = "max-w-2xl",
  footer,
  footerTestId,
  children,
}: ModalShellProps) {
  const { panelRef, titleId } = useModalDialog({ onClose, enabled, initialFocus });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4"
      onMouseDown={(event) => {
        // Clic en el velo = cerrar (solo si el gesto empezó fuera del panel).
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={`my-8 flex max-h-[calc(100vh-4rem)] w-full ${panelClassName} flex-col rounded-brand-lg bg-shell text-ink shadow-modal`}
      >
        {/* Título */}
        <header className="flex items-start justify-between gap-3 border-b border-line p-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-h3 font-semibold text-ink">
              {title}
            </h2>
            {subtitle !== undefined && <p className="mt-1 text-small text-ink-soft">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className={CLOSE}>
            ×
          </button>
        </header>

        {actions !== undefined && (
          <div className="flex flex-wrap gap-2 border-b border-line px-6 py-3">{actions}</div>
        )}

        {/* Cuerpo */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>

        {/* Pie */}
        {footer !== undefined && (
          <footer
            data-testid={footerTestId}
            className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-6 pt-4"
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
