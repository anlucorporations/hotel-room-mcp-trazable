"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { classifyTxError } from "@/components/tx/txError";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";

const PRIMARY =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const DANGER =
  "min-h-touch rounded-pill bg-terracotta px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";

/**
 * Pausa de emergencia (CU-14, PAUSER): muestra `paused()` y permite `pause`/`unpause`. Pausar
 * es una acción destructiva de servicio → variante `danger` (terracotta). Reanudar usa el sea.
 */
export function AdminPause() {
  const t = useTranslations("admin");
  const paused = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  const { send, reset, status, hash, error } = useAdminWrite();

  const busy = status === "signing" || status === "pending";
  const isPaused = paused.data === true;
  const txErrorKind = error ? classifyTxError(error) : null;

  const { refetch: refetchPaused } = paused;
  useEffect(() => {
    if (status === "confirmed") void refetchPaused();
  }, [status, refetchPaused]);

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
          onClick={() => {
            reset();
            send("pause", []);
          }}
          className={DANGER}
        >
          {t("pausePause")}
        </button>
        <button
          type="button"
          data-testid="unpause-action"
          disabled={busy || !isPaused}
          onClick={() => {
            reset();
            send("unpause", []);
          }}
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
      <TxModal phase={status} onClose={reset} hash={hash} />
    </AdminCard>
  );
}
