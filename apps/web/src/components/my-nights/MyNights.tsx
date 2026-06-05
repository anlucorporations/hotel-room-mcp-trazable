"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { ClaimPanel } from "./ClaimPanel";
import { MyNightCard } from "./MyNightCard";
import { useMyNights } from "./useMyNights";

/**
 * Página «Mis noches» (CU-06/07): la wallet conectada ve sus NFTs-noche y puede listarlos
 * para reventa, cancelar el listado y cobrar los saldos pendientes. El gating de
 * conexión/red se delega en `useOnboarding`/`WalletBar` (CU-17, DRY).
 */
export function MyNights() {
  const t = useTranslations("myNights");
  const { isConnected, isWrongNetwork, address } = useOnboarding();
  const query = useMyNights(isConnected && !isWrongNetwork ? address : undefined);

  // `query.refetch` es estable; depender de `query` re-ejecutaría efectos en cada render.
  const { refetch: queryRefetch } = query;
  const refetch = useCallback(() => {
    void queryRefetch();
  }, [queryRefetch]);

  // Sin wallet / sin conexión / red incorrecta: reusa la barra de onboarding.
  if (!isConnected || isWrongNetwork) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-soft">{t("connectPrompt")}</p>
        <WalletBar />
      </div>
    );
  }

  if (query.isPending) {
    return (
      <p data-testid="loading-mis-noches" role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }

  if (query.isError) {
    return (
      <div data-testid="error-mis-noches" className="flex flex-col items-start gap-3 rounded-brand bg-sand-2 px-4 py-6 text-ink-soft">
        <p className="text-terracotta-text">{t("loadError")}</p>
        <button
          type="button"
          data-testid="retry"
          onClick={refetch}
          className="inline-flex min-h-touch items-center rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const { nights, pendingWei } = query.data;
  const hasPending = BigInt(pendingWei) > 0n;

  return (
    <section className="flex flex-col gap-6">
      {hasPending && <ClaimPanel pendingWei={pendingWei} onConfirmed={refetch} />}

      {nights.length === 0 ? (
        <p data-testid="empty-mis-noches" className="rounded-brand bg-sand-2 px-4 py-10 text-center text-ink-soft">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
          {nights.map((night) => (
            <li key={night.tokenId}>
              <MyNightCard night={night} onConfirmed={refetch} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
