"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { classifyTxError } from "@/components/tx/txError";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";

const SUBMIT =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

/**
 * Fondos (CU-15, TREASURER): muestra el balance del contrato (`getBalance`) y la tesorería
 * destino, y permite `withdraw`. El contrato transfiere el RESIDUAL (balance menos los
 * `pendingWithdrawals` reservados de reventas, ADR-15); ese total reservado no es un getter
 * único (es por-cuenta), así que mostramos el balance bruto y lo aclaramos en el texto.
 */
export function AdminFunds() {
  const t = useTranslations("admin");
  const balance = useBalance({ address: contractAddress });
  const treasury = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "treasury",
  });
  const { send, reset, status, hash, error } = useAdminWrite();

  const busy = status === "signing" || status === "pending";
  const balanceWei = balance.data?.value ?? null;
  const txErrorKind = error ? classifyTxError(error) : null;

  const { refetch: refetchBalance } = balance;
  useEffect(() => {
    if (status === "confirmed") void refetchBalance();
  }, [status, refetchBalance]);

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
          <dt className="text-small text-ink-soft">{t("fundsTreasury")}</dt>
          <dd data-testid="funds-treasury" className="break-all text-small text-ink">
            {treasury.isPending ? t("loadingValue") : (treasury.data ?? t("readError"))}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-micro text-ink-soft">{t("fundsResidualNote")}</p>

      <button
        type="button"
        data-testid="funds-withdraw"
        disabled={busy || balanceWei === 0n}
        onClick={() => {
          reset();
          send("withdraw", []);
        }}
        className={`${SUBMIT} mt-4`}
      >
        {busy ? t("processing") : t("fundsWithdraw")}
      </button>

      {txErrorKind && (
        <p role="alert" className="mt-3 text-terracotta-text">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}
      <TxModal phase={status} onClose={reset} hash={hash} />
    </AdminCard>
  );
}
