"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AdminCard } from "@/components/admin/AdminPanel";
import { useAdminContext } from "@/components/admin/AdminLayout";

interface OperationsResponse {
  readonly health?: { status?: string; component?: string; details?: Record<string, unknown> };
  readonly checkedAt?: string;
}

/** Campos de `details` que muestra Operaciones (RF-45, CU-45). */
const DETAIL_KEYS = [
  "lastBlock",
  "headBlock",
  "lag",
  "aggregateLastBlock",
  "aggregateLag",
  "consecutiveRpcFailures",
  "consecutiveAggregateFailures",
  "emailDegraded",
  "processingDegraded",
] as const;

/**
 * Sistemas → Operaciones (RF-45, CU-45): salud del worker indexador. Si no responde se muestra un
 * estado degradado explícito (no ceros), sin romper el resto del panel.
 */
export function SystemOperations() {
  const t = useTranslations("system");
  const { apiFetch } = useAdminContext();
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    setDegraded(false);
    try {
      const res = await apiFetch("/api/admin/system/operations");
      const payload = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setDegraded(true);
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(payload.message || t("loadError"));
      setData(payload as OperationsResponse);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadError"));
    }
  }, [apiFetch, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const details = data?.health?.details ?? {};
  const show = (value: unknown): string => {
    if (value === undefined || value === null) return t("loadingValue");
    if (typeof value === "boolean") return value ? t("yes") : t("no");
    return String(value);
  };

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-h3 font-semibold">{t("operationsTitle")}</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-touch rounded-pill border border-line px-4 text-small font-semibold text-ink transition-colors hover:bg-mist-2"
        >
          {t("refresh")}
        </button>
      </div>

      {degraded && (
        <p data-testid="operations-degraded" role="alert" className="mt-3 rounded-brand border border-coral-text/40 bg-mist-2 px-4 py-3 text-small text-coral-text">
          {t("workerDown")}
        </p>
      )}

      {error && (
        <p role="alert" data-testid="operations-error" className="mt-3 rounded-brand border border-coral-text/40 bg-mist-2 px-4 py-3 text-small text-coral-text">
          {error}
        </p>
      )}

      {data?.health && (
        <>
          <p data-testid="operations-status" className="mt-3 text-small">
            <span className="text-ink-soft">{t("fieldWorkerStatus")}: </span>
            <span className="font-semibold">{data.health.status ?? t("loadingValue")}</span>
            {data.checkedAt && (
              <span className="ml-3 text-micro text-ink-soft">{t("checkedAt", { at: String(data.checkedAt).slice(11, 19) })}</span>
            )}
          </p>
          <dl data-testid="operations-details" className="mt-3 grid gap-2 text-small tablet:grid-cols-3">
            {DETAIL_KEYS.map((key) => (
              <div key={key}>
                <dt className="text-ink-soft">{t(`detail.${key}` as "detail.lag")}</dt>
                <dd className="font-mono">{show(details[key])}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </AdminCard>
  );
}
