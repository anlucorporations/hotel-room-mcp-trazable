"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TxModal } from "@/components/buy/TxModal";
import { formatEth } from "@/lib/format";
import { useClaim } from "./useClaim";

const BTN =
  "min-h-touch rounded-pill bg-sea px-5 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

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
      className="flex flex-col gap-3 rounded-brand-lg border border-line bg-sand-2 px-4 py-4 tablet:flex-row tablet:items-center tablet:justify-between"
    >
      <div>
        <h2 className="font-display font-semibold text-ink">{t("pendingTitle")}</h2>
        <p className="text-small text-ink-soft">{t("pendingHint")}</p>
      </div>
      <button
        type="button"
        data-testid="claim"
        disabled={busy}
        aria-busy={busy}
        onClick={claim}
        className={BTN}
      >
        {busy ? t("processing") : t("claim", { amount: formatEth(pendingWei) })}
      </button>
      <TxModal phase={status} onClose={reset} hash={hash} />
    </section>
  );
}
