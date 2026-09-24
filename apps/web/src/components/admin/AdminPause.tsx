"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";

const PRIMARY =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const DANGER =
  "min-h-touch rounded-pill bg-terracotta px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";

/** Acción de pausa pendiente de confirmación explícita (UX#21). */
type PendingAction = "pause" | "unpause";

/**
 * Pausa de emergencia (CU-14, docs/SRS.md §9, PAUSER): muestra `paused()` y permite `pause`/`unpause`. Pausar
 * es una acción destructiva de servicio → variante `danger` (terracotta). Reanudar usa el sea.
 * Ambas son acciones de servicio críticas: exigen confirmación explícita en el `TxModal`
 * (fase `review`) antes de firmar (UX#21), con copy genérica del ciclo de tx (MAJOR#9).
 */
export function AdminPause() {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
  const paused = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  const { send, reset, status, hash, error } = useAdminWrite();

  const [pending, setPending] = useState<PendingAction | null>(null);

  const busy = status === "signing" || status === "pending";
  const isPaused = paused.data === true;
  const txErrorKind = error ? classifyAdminTxError(error) : null;

  const { refetch: refetchPaused } = paused;
  useEffect(() => {
    if (status === "confirmed") void refetchPaused();
  }, [status, refetchPaused]);

  // Fase del modal: `review` mientras hay acción pendiente de confirmar; si no, el estado de la tx.
  const phase = pending && status === "idle" ? "review" : status;

  function closeModal(): void {
    setPending(null);
    reset();
  }

  function confirm(): void {
    if (!pending) return;
    send(pending, []);
  }

  return (
    <AdminCard>
      <p data-testid="pause-state" className="text-ink">
        {paused.isPending
          ? t("loadingValue")
          : paused.data === undefined
            ? t("readError")
            : isPaused
              ? t("pausePaused")
              : t("pauseActive")}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="pause-action"
          disabled={busy || isPaused || paused.isPending}
          onClick={() => setPending("pause")}
          className={DANGER}
        >
          {t("pausePause")}
        </button>
        <button
          type="button"
          data-testid="unpause-action"
          disabled={busy || !isPaused}
          onClick={() => setPending("unpause")}
          className={PRIMARY}
        >
          {t("pauseUnpause")}
        </button>
      </div>

      {txErrorKind && (
        <p role="alert" className="mt-3 text-terracotta-text">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        copy={txCopy}
        reviewBody={
          <p data-testid="pause-confirm" className="text-small text-ink">
            {pending === "pause" ? t("pauseConfirm") : t("unpauseConfirm")}
          </p>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="pause-confirm-action"
              onClick={confirm}
              className={pending === "pause" ? DANGER : PRIMARY}
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink"
            >
              {t("cancel")}
            </button>
          </>
        }
      />
    </AdminCard>
  );
}
