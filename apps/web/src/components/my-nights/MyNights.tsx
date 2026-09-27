"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { dateToYYYYMMDD } from "@hotel/shared/domain";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { ClaimPanel } from "./ClaimPanel";
import { MyNightCard } from "./MyNightCard";
import { useMyNights, type OwnedNight } from "./useMyNights";

/** Pestaña activa del toggle de «Mis noches»: próximas (hoy en adelante) o pasadas. */
type NightTab = "upcoming" | "past";

/** Hoy en formato `AAAAMMDD` (UTC), para casar con la codificación de fecha del `tokenId`. */
function todayYYYYMMDD(): number {
  const now = new Date();
  return dateToYYYYMMDD({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  });
}

const SEG_BASE =
  "inline-flex min-h-touch flex-1 items-center justify-center rounded-pill px-4 text-small font-semibold transition-colors";
const SEG_ON = "bg-sea text-shell";
const SEG_OFF = "text-ink-soft hover:text-sea";

/**
 * Página «Mis noches» (CU-06/07, docs/SRS.md §9): la wallet conectada ve sus NFTs-noche y puede listarlos
 * para reventa, cancelar el listado y cobrar los saldos pendientes. El gating de
 * conexión/red se delega en `useOnboarding`/`WalletBar` (CU-17, DRY).
 */
export function MyNights() {
  const t = useTranslations("myNights");
  const { isConnected, isWrongNetwork, address } = useOnboarding();
  const query = useMyNights(isConnected && !isWrongNetwork ? address : undefined);
  const [tab, setTab] = useState<NightTab>("upcoming");

  // `query.refetch` es estable; depender de `query` re-ejecutaría efectos en cada render.
  const { refetch: queryRefetch } = query;
  const refetch = useCallback(() => {
    void queryRefetch();
  }, [queryRefetch]);

  const allNights = query.data?.nights;
  // Filtra en el componente (no en `useMyNights`, la fuente de datos): Próximas = hoy en
  // adelante, Pasadas = anteriores a hoy (ambas en UTC, coherente con el `tokenId`).
  const visibleNights = useMemo<readonly OwnedNight[]>(() => {
    if (!allNights) return [];
    const today = todayYYYYMMDD();
    return allNights.filter((night) =>
      tab === "upcoming" ? night.dateYYYYMMDD >= today : night.dateYYYYMMDD < today,
    );
  }, [allNights, tab]);

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
  const hasAny = nights.length > 0;
  const emptyKey = tab === "upcoming" ? "emptyUpcoming" : "emptyPast";

  return (
    <section className="flex flex-col gap-6">
      {/* Acceso a la gestión de reventas (incremento v2, RF-36). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-ink-soft">{t("resalesHint")}</p>
        <Link
          href="/mis-noches/mis-reventas"
          data-testid="my-resales-link"
          className="text-small font-semibold text-sea-deep underline"
        >
          {t("resalesLink")}
        </Link>
      </div>

      {hasPending && <ClaimPanel pendingWei={pendingWei} onConfirmed={refetch} />}

      <div
        role="group"
        aria-label={t("tabsLabel")}
        className="flex max-w-xs gap-1 rounded-pill border border-line bg-shell p-1"
      >
        <button
          type="button"
          data-testid="tab-upcoming"
          aria-pressed={tab === "upcoming"}
          onClick={() => setTab("upcoming")}
          className={`${SEG_BASE} ${tab === "upcoming" ? SEG_ON : SEG_OFF}`}
        >
          {t("tabUpcoming")}
        </button>
        <button
          type="button"
          data-testid="tab-past"
          aria-pressed={tab === "past"}
          onClick={() => setTab("past")}
          className={`${SEG_BASE} ${tab === "past" ? SEG_ON : SEG_OFF}`}
        >
          {t("tabPast")}
        </button>
      </div>

      {/* Anuncia a lectores de pantalla el cambio de pestaña y cuántas noches hay (UX#24). */}
      <p className="sr-only" role="status" aria-live="polite">
        {t("tabStatus", {
          tab: t(tab === "upcoming" ? "tabUpcoming" : "tabPast"),
          count: visibleNights.length,
        })}
      </p>

      {visibleNights.length === 0 ? (
        <div
          data-testid="empty-mis-noches"
          className="flex flex-col items-center gap-4 rounded-brand bg-sand-2 px-4 py-10 text-center text-ink-soft"
        >
          <p>{t(hasAny ? emptyKey : "empty")}</p>
          {/* Sin ninguna noche: CTA para descubrir el catálogo (UX#24). */}
          {!hasAny && (
            <Link
              href="/"
              data-testid="explore-nights"
              className="inline-flex min-h-touch items-center rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep"
            >
              {t("exploreNights")}
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
          {visibleNights.map((night) => (
            <li key={night.tokenId}>
              <MyNightCard night={night} onConfirmed={refetch} reviewable={tab === "past"} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
