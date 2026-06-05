"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { TxStatus } from "@/components/tx/txStatus";
import { TxReceipt } from "@/components/tx/TxReceipt";

/**
 * Fase del modal de compra. `review` es el paso previo a la firma (ADR-11): el usuario
 * confirma una transacción LEGIBLE antes de firmar. El resto refleja `TxStatus`.
 */
export type TxPhase = "review" | TxStatus;

/**
 * Copy del modal parametrizable por CONTEXTO (MAJOR#9). El flujo de compra usa el copy de
 * dominio («Reservando tu noche…»); el back-office inyecta copy genérica del ciclo de tx
 * («Esperando confirmación»). Cada campo es opcional: lo no provisto cae al copy de compra
 * (`buy.*`), de modo que los consumidores existentes (compra/handoff/claim) NO necesitan
 * cambios (retrocompatible).
 */
export interface TxModalCopy {
  /** Título del paso «Revisar». Por defecto `buy.review`. */
  readonly review?: string;
  /** Hint del paso «Revisar». Por defecto `buy.reviewHint`. */
  readonly reviewHint?: string;
  /** Título por fase de estado (signing/pending/confirmed/reverted). Por defecto `buy.status.*`. */
  readonly status?: Partial<Record<Exclude<TxPhase, "review" | "idle">, string>>;
  /** Hint por fase de estado. Por defecto `buy.statusHint.*`. */
  readonly statusHint?: Partial<Record<Exclude<TxPhase, "review" | "idle">, string>>;
}

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
  /**
   * Acción primaria opcional del estado «Hecho», justo encima de «Cerrar» (UX#2/#8/#14):
   * el flujo de compra inyecta aquí «Ver en Mis noches». Si no se pasa, solo se muestra
   * «Cerrar» (back-office / acciones genéricas: el recibo ya es genérico).
   */
  readonly confirmedActions?: ReactNode;
  /**
   * Nota opcional del estado «Minando» (UX#5): el flujo de compra explica que se puede cerrar
   * sin perder la reserva. Sin ella no se muestra copy de dominio (back-office).
   */
  readonly pendingNote?: ReactNode;
  /**
   * Copy por contexto (MAJOR#9): el back-office pasa textos genéricos del ciclo de tx.
   * Lo no provisto cae al copy del flujo de compra (`buy.*`), por lo que es retrocompatible.
   */
  readonly copy?: TxModalCopy;
}

/** Mapea cada fase al `data-testid` esperado por el plan de pruebas (§7). */
const TESTID: Partial<Record<TxPhase, string>> = {
  review: "tx-review",
  signing: "tx-pending",
  pending: "tx-pending",
  confirmed: "tx-confirmed",
  reverted: "tx-reverted",
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Devuelve el foco al disparador si sigue en el DOM; si no, a un destino estable (MAJOR#6). */
function returnFocusTo(trigger: HTMLElement | null): void {
  if (trigger && trigger.isConnected) {
    trigger.focus?.();
    return;
  }
  // El disparador desapareció (p. ej. `router.refresh()` reemplazó la tarjeta vendida).
  // Enfocamos el <body> de forma programática para no perder el foco en el documento (WCAG 2.4.3).
  const body = document.body;
  if (!body) return;
  const hadTabindex = body.hasAttribute("tabindex");
  body.setAttribute("tabindex", "-1");
  body.focus();
  if (!hadTabindex) body.removeAttribute("tabindex");
}

/**
 * Modal accesible del flujo de compra (DISEÑO-UX §5.3, WCAG 2.4.3/4.1.2/1.3.1):
 * `role="dialog" aria-modal`, `aria-labelledby` (título) + `aria-describedby` (resumen
 * decodificado), foco inicial al primer control, focus trap, Escape cierra (salvo durante la
 * FIRMA), retorno de foco al disparador. Una región `aria-live` persistente anuncia los cambios
 * de estado de la tx aunque el contenido cambie (MAJOR#7). Presentacional: la lógica vive en
 * el contenedor.
 */
export function TxModal({
  phase,
  onClose,
  reviewBody,
  reviewActions,
  hash,
  errorActions,
  confirmedActions,
  pendingNote,
  copy,
}: TxModalProps) {
  const t = useTranslations("buy");
  const titleId = useId();
  const liveId = useId();
  const reviewHintId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const isOpen = phase !== "idle";
  // Solo la FIRMA bloquea el cierre (no hay marcha atrás segura). Durante el minado SÍ se puede
  // cerrar: la reserva continúa en la red y aparecerá en «Mis noches» (UX#5).
  const isClosable = phase !== "signing";

  // Recuerda el elemento que abrió el modal para devolverle el foco al cerrarse.
  useEffect(() => {
    if (isOpen && !triggerRef.current) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    }
    if (!isOpen && triggerRef.current) {
      returnFocusTo(triggerRef.current);
      triggerRef.current = null;
    }
  }, [isOpen]);

  // Foco inicial al primer control del modal al abrirse / cambiar de fase.
  useEffect(() => {
    if (!isOpen) return;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [isOpen, phase]);

  // Escape cierra (salvo durante la firma) y focus trap dentro del panel.
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
  const isReview = phase === "review";
  const statusPhase = phase as Exclude<TxPhase, "review" | "idle">;
  // Copy por contexto (MAJOR#9): el `copy` opcional sobrescribe; lo no provisto cae a `buy.*`.
  const heading = isReview
    ? (copy?.review ?? t("review"))
    : (copy?.status?.[statusPhase] ?? t(`status.${statusPhase}`));
  const hint = isReview
    ? (copy?.reviewHint ?? t("reviewHint"))
    : (copy?.statusHint?.[statusPhase] ?? t(`statusHint.${statusPhase}`));
  const isWorking = phase === "signing" || phase === "pending";
  // Texto que anuncia la región live persistente: vacío en «Revisar», el hint del estado si no.
  const liveText = isReview ? "" : hint;

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
        aria-describedby={isReview ? reviewHintId : liveId}
        data-testid={TESTID[phase]}
        className="w-full max-w-md rounded-brand-lg bg-shell p-6 shadow-modal"
      >
        <h2 id={titleId} className="font-display text-h3 font-semibold text-ink">
          {heading}
        </h2>

        {/*
          Región live SIEMPRE montada desde la apertura (MAJOR#7): así los lectores de pantalla
          anuncian los cambios de estado de la tx aunque el resto del contenido se reemplace.
          Vacía en «Revisar»; en «Revisar» el hint visible va aparte como descripción del diálogo.
        */}
        <p
          id={liveId}
          className="mt-2 flex items-center gap-2 text-small text-ink-soft empty:mt-0"
          role="status"
          aria-live="polite"
        >
          {isWorking && (
            <span
              aria-hidden="true"
              aria-busy="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-sea"
            />
          )}
          {liveText}
        </p>

        {/* Aviso ASERTIVO separado solo para el fallo de la tx (MAJOR#7). Respeta el copy por
            contexto (MAJOR#9): en back-office el mensaje es genérico, no «no se completó la reserva». */}
        {phase === "reverted" && (
          <p role="alert" className="mt-2 text-small text-terracotta-text">
            {copy?.statusHint?.reverted ?? t("statusHint.reverted")}
          </p>
        )}

        {isReview ? (
          <>
            <p id={reviewHintId} className="mt-1 text-small text-ink-soft">
              {hint}
            </p>
            <div className="mt-4">{reviewBody}</div>
            <div className="mt-5 flex flex-col gap-2">{reviewActions}</div>
          </>
        ) : (
          <>
            {/* Recibo verificable disponible ya en minado: el usuario puede cerrar con seguimiento.
                En «confirmed» el id es `receipt` (éxito, §7); en minado uno distinto para no
                confundir el seguimiento con el éxito. */}
            {phase === "confirmed" && hash && <TxReceipt hash={hash} />}
            {phase === "pending" && hash && <TxReceipt hash={hash} testId="tx-pending-receipt" />}

            {phase === "pending" && pendingNote && (
              <p className="mt-2 text-small text-ink-soft">{pendingNote}</p>
            )}

            {phase === "reverted" && errorActions && (
              <div className="mt-5 flex flex-col gap-2">{errorActions}</div>
            )}

            {phase === "confirmed" && confirmedActions && (
              <div className="mt-5 flex flex-col gap-2">{confirmedActions}</div>
            )}

            {isClosable && (
              <button
                type="button"
                data-testid="tx-close"
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
