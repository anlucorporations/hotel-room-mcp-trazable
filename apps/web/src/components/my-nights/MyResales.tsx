"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { useWebPush } from "@/components/push/useWebPush";
import { formatEth, formatNightDate } from "@/lib/format";
import { ClaimPanel } from "./ClaimPanel";
import { MyNightCard } from "./MyNightCard";
import { useMyNights, type ResaleSale } from "./useMyNights";

const SEEN_KEY_PREFIX = "hotel-resales-seen:";

/**
 * «Mis reventas» (RF-36/RF-37, CU-36/CU-37).
 *
 * Reúne en un sitio lo que el usuario tiene **publicado** (editar precio / retirar), lo que ya ha
 * **vendido** y su saldo pendiente de cobro. Las acciones reutilizan `MyNightCard`/`useListNight`
 * (punto único de verdad on-chain, RF-36.1). Los avisos son in-app (contador de novedades desde la
 * última visita) y Web Push anónimo, sin recoger ningún dato personal (RNF-30).
 */
export function MyResales() {
  const t = useTranslations("myResales");
  const { isConnected, isWrongNetwork, address } = useOnboarding();
  const query = useMyNights(isConnected && !isWrongNetwork ? address : undefined);
  const push = useWebPush();
  const [seenBlock, setSeenBlock] = useState<bigint>(0n);

  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Última visita (bloque visto) por dirección. Es estado de UI, no un dato del huésped.
  useEffect(() => {
    if (!address) return;
    const stored = window.localStorage.getItem(`${SEEN_KEY_PREFIX}${address.toLowerCase()}`);
    setSeenBlock(stored ? BigInt(stored) : 0n);
  }, [address]);

  const data = query.data;
  const listed = useMemo(
    () => (data?.nights ?? []).filter((night) => night.listingPriceWei !== null),
    [data],
  );
  const resales = useMemo<readonly ResaleSale[]>(() => data?.resales ?? [], [data]);
  const newSales = useMemo(
    () => resales.filter((sale) => sale.blockNumber > seenBlock),
    [resales, seenBlock],
  );

  function markSeen(): void {
    if (!address) return;
    const highest = resales.reduce(
      (max, sale) => (sale.blockNumber > max ? sale.blockNumber : max),
      seenBlock,
    );
    window.localStorage.setItem(`${SEEN_KEY_PREFIX}${address.toLowerCase()}`, highest.toString());
    setSeenBlock(highest);
  }

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
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-coral-text">{t("loadError")}</p>
        <button type="button" onClick={refresh} className="min-h-touch rounded-pill border border-line px-5 font-semibold text-ink">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {newSales.length > 0 && (
        <div data-testid="resales-news" role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-brand-lg border border-success/40 bg-success-bg px-4 py-3">
          <p className="text-ink">{t("news", { count: newSales.length })}</p>
          <button type="button" onClick={markSeen} data-testid="resales-mark-seen" className="min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell">
            {t("markSeen")}
          </button>
        </div>
      )}

      <section aria-labelledby="published-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="published-title" className="font-display text-h3 font-semibold">
            {t("publishedTitle")}
          </h2>
          <Link href="/mis-noches" className="text-small font-semibold text-azure-deep underline">
            {t("publishMore")}
          </Link>
        </div>
        {listed.length === 0 ? (
          <p data-testid="resales-published-empty" className="text-ink-soft">{t("publishedEmpty")}</p>
        ) : (
          <ul data-testid="resales-published" className="grid grid-cols-1 gap-6 tablet:grid-cols-2">
            {listed.map((night) => (
              <li key={night.tokenId}>
                <MyNightCard night={night} onConfirmed={refresh} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sold-title" className="flex flex-col gap-3">
        <h2 id="sold-title" className="font-display text-h3 font-semibold">
          {t("soldTitle")}
        </h2>
        {resales.length === 0 ? (
          <p data-testid="resales-sold-empty" className="text-ink-soft">{t("soldEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="resales-sold" className="w-full border-collapse text-small">
              <caption className="sr-only">{t("soldTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th scope="col" className="px-2 py-2">{t("colNight")}</th>
                  <th scope="col" className="px-2 py-2">{t("colPrice")}</th>
                  <th scope="col" className="px-2 py-2">{t("colBuyer")}</th>
                </tr>
              </thead>
              <tbody>
                {resales.map((sale) => (
                  <tr key={`${sale.tokenId}-${sale.blockNumber}`} className="border-b border-line/60">
                    <td className="px-2 py-2">{formatNightDate(sale.dateYYYYMMDD)} · {sale.room}</td>
                    <td className="px-2 py-2">{formatEth(sale.priceWei)}</td>
                    <td className="px-2 py-2 font-mono text-micro">{`${sale.buyer.slice(0, 8)}…`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && data.pendingWei !== "0" && <ClaimPanel pendingWei={data.pendingWei} onConfirmed={refresh} />}

      <section aria-labelledby="notices-title" className="flex flex-wrap items-center justify-between gap-3 rounded-brand-lg border border-line bg-shell px-4 py-4">
        <div>
          <h2 id="notices-title" className="font-display font-semibold text-ink">{t("pushTitle")}</h2>
          <p className="text-small text-ink-soft">{t("pushHint")}</p>
          {push.error && <p className="text-small text-coral-text">{t("pushError")}</p>}
        </div>
        {push.state === "unsupported" ? (
          <span className="text-small text-ink-soft">{t("pushUnsupported")}</span>
        ) : push.state === "subscribed" ? (
          <button type="button" onClick={() => void push.disable()} disabled={push.busy} data-testid="push-disable" className="min-h-touch rounded-pill border border-line px-5 font-semibold text-ink">
            {t("pushDisable")}
          </button>
        ) : (
          <button type="button" onClick={() => void push.enable()} disabled={push.busy} data-testid="push-enable" className="min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell">
            {push.busy ? t("processing") : t("pushEnable")}
          </button>
        )}
      </section>
    </div>
  );
}
