"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";

const SUBMIT =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/**
 * Fondos (CU-15, docs/SRS.md §9, TREASURER): muestra el balance BRUTO del contrato (`getBalance`/`useBalance`),
 * el residual REALMENTE retirable (`totalPending()` reservado de reventas → retirable = bruto −
 * pendiente, MINOR#32) y la tesorería destino, y permite `withdraw`. Si el residual es 0 el botón
 * se deshabilita (evita el revert `NoFunds`).
 *
 * CORREGIDO en M7 (H5): esta pantalla bloqueaba `withdraw` con el contrato en pausa «porque es
 * `whenNotPaused`», y **no lo es**: `HotelNights.withdraw()` solo lleva `onlyRole(TREASURER_ROLE)
 * nonReentrant` y el propio test del contrato lo declara permitido en pausa («remediación»). Se
 * retira el bloqueo: durante una pausa, retirar el residual es precisamente la vía de escape. La
 * retirada transfiere ETH y es irreversible: exige confirmación explícita en el `TxModal` (UX#21)
 * con copy genérica (MAJOR#9).
 */
export function AdminFunds() {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
  const balance = useBalance({ address: contractAddress });
  const treasury = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "treasury",
  });
  const pending = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "totalPending",
  });
  const paused = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  const { send, reset, status, hash, error } = useAdminWrite();

  const [confirming, setConfirming] = useState(false);

  const busy = status === "signing" || status === "pending";
  const balanceWei = balance.data?.value ?? null;
  const pendingWei = pending.data !== undefined ? (pending.data as bigint) : null;
  const isPaused = paused.data === true;
  const txErrorKind = error ? classifyAdminTxError(error) : null;

  // Residual realmente retirable = balance bruto − pagos pendientes reservados (ADR-15).
  const withdrawableWei =
    balanceWei !== null && pendingWei !== null
      ? balanceWei > pendingWei
        ? balanceWei - pendingWei
        : 0n
      : null;
  const nothingToWithdraw = withdrawableWei !== null && withdrawableWei === 0n;

  const { refetch: refetchBalance } = balance;
  const { refetch: refetchPending } = pending;
  useEffect(() => {
    if (status === "confirmed") {
      void refetchBalance();
      void refetchPending();
    }
  }, [status, refetchBalance, refetchPending]);

  const phase = confirming && status === "idle" ? "review" : status;

  function closeModal(): void {
    setConfirming(false);
    reset();
  }

  function confirm(): void {
    send("withdraw", []);
  }

  return (
    <AdminCard>
      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-small text-ink-soft">{t("fundsBalance")}</dt>
          <dd data-testid="funds-balance" className="font-display text-h3 font-bold text-ink">
            {balance.isPending
              ? t("loadingValue")
              : balanceWei === null
                ? t("readError")
                : `${formatEther(balanceWei)} ETH`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-small text-ink-soft">{t("fundsWithdrawable")}</dt>
          <dd data-testid="funds-withdrawable" className="font-display text-h3 font-bold text-ink">
            {pending.isPending || balance.isPending
              ? t("loadingValue")
              : withdrawableWei === null
                ? t("readError")
                : `${formatEther(withdrawableWei)} ETH`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-small text-ink-soft">{t("fundsTreasury")}</dt>
          <dd data-testid="funds-treasury" className="break-all text-small text-ink">
            {treasury.isPending ? t("loadingValue") : (treasury.data ?? t("readError"))}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-micro text-ink-soft">{t("fundsResidualNote")}</p>

      {isPaused && (
        // Informativo, NO bloqueante: `withdraw` sigue disponible durante la pausa (H5, M7).
        <p data-testid="funds-paused" role="status" className="mt-3 text-small text-ink-soft">
          {t("fundsPausedWithdrawAllowed")}
        </p>
      )}
      {nothingToWithdraw && (
        <p className="mt-3 text-small text-ink-soft">{t("fundsNoneWithdrawable")}</p>
      )}

      <button
        type="button"
        data-testid="funds-withdraw"
        disabled={busy || nothingToWithdraw}
        onClick={() => setConfirming(true)}
        className={`${SUBMIT} mt-4`}
      >
        {t("fundsWithdraw")}
      </button>

      {txErrorKind && (
        <p role="alert" className="mt-3 text-coral-text">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        copy={txCopy}
        reviewBody={
          <div data-testid="funds-confirm" className="flex flex-col gap-2 text-small text-ink">
            <p>{t("fundsConfirm")}</p>
            {withdrawableWei !== null && (
              <p className="font-display text-h3 font-bold text-ink">
                {t("fundsWithdrawable")}: {formatEther(withdrawableWei)} ETH
              </p>
            )}
          </div>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="funds-confirm-action"
              onClick={confirm}
              className={SUBMIT}
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
