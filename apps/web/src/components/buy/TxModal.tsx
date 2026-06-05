"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { TxStatus } from "@/components/tx/txStatus";

/**
 * Fase del modal de compra. `review` es el paso previo a la firma (ADR-11): el usuario
 * confirma una transacción LEGIBLE antes de firmar. El resto refleja `TxStatus`.
 */
export type TxPhase = "review" | TxStatus;

export interface TxModalProps {
  /** Fase actual; `idle`/no `review` mantiene el modal cerrado. */
  readonly phase: TxPhase;
  /** Cierra el modal (cancelar en revisar, cerrar al terminar). */
  readonly onClose: () => void;
  /** Contenido decodificado de la tx para el paso «Revisar» (importe/habitación/fecha/to). */
  readonly reviewBody?: ReactNode;
  /** Acciones del paso «Revisar» (p. ej. firmar/cancelar). */
  readonly reviewActions?: ReactNode;
  /** Hash de la tx para el recibo del estado «Hecho». */
  readonly hash?: `0x${string}`;
  /** Acciones del estado «Error» (p. ej. reintentar). */
  readonly errorActions?: ReactNode;
}

/** Mapea cada fase al `data-testid` esperado por el plan de pruebas (§7). */
const TESTID: Partial<Record<TxPhase, string>> = {
  review: "tx-review",
  signing: "tx-pending",
  pending: "tx-pending",
  confirmed: "receipt",
  reverted: "tx-reverted",
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * Modal accesible del flujo de compra (DISEÑO-UX §5.3, WCAG 2.4.3/4.1.2/1.3.1):
 * `role="dialog" aria-modal`, `aria-labelledby` (título) + `aria-describedby` (resumen
 * decodificado), foco inicial al primer control, focus trap, Escape cierra (salvo durante el
 * minado), retorno de foco al disparador. Presentacional: la lógica vive en el contenedor.
 */
export function TxModal({
  phase,
  onClose,
  reviewBody,
  reviewActions,
  hash,
  errorActions,
}: TxModalProps) {
  const t = useTranslations("buy");
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const isOpen = phase !== "idle";
  // Durante la firma/minado el modal NO se puede cerrar (no hay marcha atrás segura, §5.3).
  const isClosable = phase === "review" || phase === "confirmed" || phase === "reverted";

  // Recuerda el elemento que abrió el modal para devolverle el foco al cerrarse.
  useEffect(() => {
    if (isOpen && !triggerRef.current) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    }
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus?.();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // Foco inicial al primer control del modal al abrirse / cambiar de fase.
  useEffect(() => {
    if (!isOpen) return;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [isOpen, phase]);

  // Escape cierra (salvo minado) y focus trap dentro del panel.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isClosable) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, isClosable, onClose]);

  if (!isOpen) return null;

  // En el bloque «no review» `phase` ya nunca es "review" ni "idle"; estrechamos el tipo.
  const statusPhase = phase as Exclude<TxPhase, "review" | "idle">;
  const heading = phase === "review" ? t("review") : t(`status.${statusPhase}`);
  const hint = phase === "review" ? t("reviewHint") : t(`statusHint.${statusPhase}`);
  const isWorking = phase === "signing" || phase === "pending";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && isClosable) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid={TESTID[phase]}
        className="w-full max-w-md rounded-brand-lg bg-shell p-6 shadow-modal"
      >
        <h2 id={titleId} className="font-display text-h3 font-semibold text-ink">
          {heading}
        </h2>

        {phase === "review" ? (
          <>
            <p id={descId} className="mt-1 text-small text-ink-soft">
              {hint}
            </p>
            <div className="mt-4">{reviewBody}</div>
            <div className="mt-5 flex flex-col gap-2">{reviewActions}</div>
          </>
        ) : (
          <>
            <p
              id={descId}
              className="mt-2 flex items-center gap-2 text-small text-ink-soft"
              role={phase === "reverted" ? "alert" : "status"}
              aria-live={phase === "reverted" ? "assertive" : "polite"}
            >
              {isWorking && (
                <span
                  aria-hidden="true"
                  aria-busy="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-sea"
                />
              )}
              {hint}
            </p>

            {phase === "confirmed" && hash && (
              <p className="mt-3 break-all rounded-brand bg-sand-2 px-3 py-2 text-micro text-ink-soft">
                <span className="font-semibold text-ink">{t("receipt")}</span> {hash}
              </p>
            )}

            {phase === "reverted" && errorActions && (
              <div className="mt-5 flex flex-col gap-2">{errorActions}</div>
            )}

            {(phase === "confirmed" || phase === "reverted") && (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink"
              >
                {t("close")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
