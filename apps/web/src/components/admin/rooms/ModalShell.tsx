"use client";

import type { ReactNode, RefObject } from "react";
import { useModalDialog } from "./useModalDialog";

/**
 * **Cáscara de diálogo flotante** de la sección Habitación (2026-10-02).
 *
 * Un solo sitio para el velo, el panel, el título referenciado por `aria-labelledby` y el botón de
 * cierre con nombre accesible; el comportamiento (foco al abrir, trampa de foco, `Escape`, devolución
 * del foco al disparador) lo pone `useModalDialog`, que es el mismo patrón accesible del TOTP de
 * publicación. Los tres diálogos de la sección —alta/edición, ficha de detalle y confirmación
 * TOTP— comparten esta cáscara para no reimplementar (peor) la accesibilidad tres veces.
 */

const CLOSE =
  "min-h-touch min-w-touch flex-none rounded-brand text-h4 leading-none text-ink-soft transition-colors hover:bg-mist-2";

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
        className={`my-8 w-full ${panelClassName} rounded-brand-lg bg-shell p-6 text-ink shadow-modal`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-h3 font-semibold text-ink">
              {title}
            </h2>
            {subtitle !== undefined && <p className="mt-1 text-small text-ink-soft">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className={CLOSE}>
            ×
          </button>
        </div>
        {actions !== undefined && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        {children}
      </div>
    </div>
  );
}
