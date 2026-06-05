"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TxModal } from "@/components/buy/TxModal";
import { formatEth } from "@/lib/format";
import { useClaim } from "./useClaim";

const BTN = "min-h-touch rounded-md px-4 py-2 font-semibold text-white disabled:opacity-60";

/** Panel de cobro (pull-payment) del saldo pendiente de reventas (CU-07). */
export function ClaimPanel({
  pendingWei,
  onConfirmed,
}: {
  pendingWei: string;
  onConfirmed: () => void;
}) {
  const t = useTranslations("myNights");
  const { claim, reset, status, hash } = useClaim();

  const busy = status === "signing" || status === "pending";

  useEffect(() => {
    if (status === "confirmed") onConfirmed();
  }, [status, onConfirmed]);

  return (
    <section
      data-testid="claim-panel"
      className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 className="font-semibold text-emerald-900">{t("pendingTitle")}</h2>
        <p className="text-sm text-emerald-800">{t("pendingHint")}</p>
      </div>
      <button
        type="button"
        data-testid="claim"
        disabled={busy}
        onClick={claim}
        className={`${BTN} bg-emerald-700`}
      >
        {busy ? t("processing") : t("claim", { amount: formatEth(pendingWei) })}
      </button>
      <TxModal phase={status} onClose={reset} hash={hash} />
    </section>
  );
}
