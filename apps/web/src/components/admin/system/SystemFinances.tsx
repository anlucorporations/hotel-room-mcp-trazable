"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { AdminCard } from "@/components/admin/AdminPanel";
import { useAdminContext } from "@/components/admin/AdminLayout";

interface Metrics {
  primaryVolumeWei?: string;
  secondaryVolumeWei?: string;
  royaltiesWei?: string;
  soldCount?: number;
  mintedCount?: number;
  burnedCount?: number;
  occupancyRatioPercent?: number;
  updatedAt?: string;
}

/**
 * Resumen financiero (RF-44, CU-44): lee los **agregados únicos** del worker
 * (`/api/admin/metrics`, la misma fuente que el dashboard) y los presenta. La retirada a
 * tesorería la aporta `AdminFunds`, embebido en la misma página.
 */
export function SystemFinances() {
  const t = useTranslations("system");
  const { apiFetch } = useAdminContext();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await apiFetch("/api/admin/metrics");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("loadError"));
      setMetrics(data as Metrics);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadError"));
    }
  }, [apiFetch, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eth = (wei?: string): string => (wei ? formatEther(BigInt(wei)) : t("loadingValue"));

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-h3 font-semibold">{t("financesSummaryTitle")}</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-touch rounded-pill border border-line px-4 text-small font-semibold text-ink transition-colors hover:bg-sand-2"
        >
          {t("refresh")}
        </button>
      </div>

      {error && (
        <p role="alert" data-testid="finances-error" className="mt-3 rounded-brand border border-terracotta-text/40 bg-sand-2 px-4 py-3 text-small text-terracotta-text">
          {error}
        </p>
      )}

      {metrics && (
        <dl data-testid="finances-summary" className="mt-3 grid gap-2 text-small tablet:grid-cols-3">
          <div><dt className="text-ink-soft">{t("fieldPrimaryVolume")}</dt><dd className="font-semibold">{eth(metrics.primaryVolumeWei)} ETH</dd></div>
          <div><dt className="text-ink-soft">{t("fieldSecondaryVolume")}</dt><dd className="font-semibold">{eth(metrics.secondaryVolumeWei)} ETH</dd></div>
          <div><dt className="text-ink-soft">{t("fieldRoyalties")}</dt><dd className="font-semibold">{eth(metrics.royaltiesWei)} ETH</dd></div>
          <div><dt className="text-ink-soft">{t("fieldSold")}</dt><dd>{metrics.soldCount ?? 0}</dd></div>
          <div><dt className="text-ink-soft">{t("fieldMinted")}</dt><dd>{metrics.mintedCount ?? 0}</dd></div>
          <div><dt className="text-ink-soft">{t("fieldBurned")}</dt><dd>{metrics.burnedCount ?? 0}</dd></div>
        </dl>
      )}
    </AdminCard>
  );
}
