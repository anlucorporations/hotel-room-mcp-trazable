"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { classifyTxError } from "@/components/tx/txError";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";

const ROYALTY_MIN_BPS = 0;
const ROYALTY_MAX_BPS = 2000;

const FIELD = "min-h-touch w-32 rounded-brand border border-line bg-shell px-3 text-ink";
const SUBMIT =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

const bpsToPercent = (bps: number): string => (bps / 100).toFixed(2).replace(/\.?0+$/, "");

/**
 * Royalty (CU-12, ROYALTY_ADMIN): muestra el bps actual leído del getter directo `royaltyBps()`
 * del ABI y permite fijarlo en [0, 2000] con `setRoyaltyBps`. El rango se valida en UI (evita la
 * tx fallida); el contrato sigue siendo la autoridad (`RoyaltyOutOfRange` on-chain).
 */
export function AdminRoyalty() {
  const t = useTranslations("admin");
  const current = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "royaltyBps",
  });
  const { send, reset, status, hash, error } = useAdminWrite();

  const [bps, setBps] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const currentBps = current.data !== undefined ? Number(current.data) : null;
  const busy = status === "signing" || status === "pending";
  const txErrorKind = error ? classifyTxError(error) : null;

  // Tras confirmar, refresca el bps mostrado (`refetch` es estable; evita re-ejecutar por render).
  const { refetch: refetchCurrent } = current;
  useEffect(() => {
    if (status === "confirmed") void refetchCurrent();
  }, [status, refetchCurrent]);

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    const value = Number(bps);
    if (!Number.isInteger(value) || value < ROYALTY_MIN_BPS || value > ROYALTY_MAX_BPS) {
      return setFormError(t("royaltyOutOfRange", { min: ROYALTY_MIN_BPS, max: ROYALTY_MAX_BPS }));
    }
    reset();
    send("setRoyaltyBps", [BigInt(value)]);
  }

  return (
    <AdminCard>
      <p data-testid="royalty-current" className="text-ink">
        {current.isPending
          ? t("loadingValue")
          : currentBps === null
            ? t("readError")
            : t("royaltyCurrent", { bps: currentBps, percent: bpsToPercent(currentBps) })}
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("royaltyField")}
          <input
            data-testid="royalty-input"
            type="number"
            min={ROYALTY_MIN_BPS}
            max={ROYALTY_MAX_BPS}
            step="1"
            value={bps}
            onChange={(e) => setBps(e.target.value)}
            required
            className={FIELD}
          />
        </label>
        <button type="submit" data-testid="royalty-submit" disabled={busy} className={SUBMIT}>
          {busy ? t("processing") : t("royaltySet")}
        </button>
        {formError && (
          <p data-testid="royalty-error" role="alert" className="text-terracotta-text">
            {formError}
          </p>
        )}
        {!formError && txErrorKind && (
          <p role="alert" className="text-terracotta-text">
            {t(`txError.${txErrorKind}`)}
          </p>
        )}
      </form>
      <TxModal phase={status} onClose={reset} hash={hash} />
    </AdminCard>
  );
}
