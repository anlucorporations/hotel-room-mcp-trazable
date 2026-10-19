"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface AnchorDto {
  readonly id: string;
  readonly entityType: string;
  readonly status: string;
  readonly txHash: string | null;
  readonly createdAt: string;
  readonly retryCount: number;
}

/** Cola de **anclajes** del outbox visible para Soporte (F9 · T9.5, `data-testid="anchor-queue"`). */
export function AnchorQueue() {
  const t = useTranslations("admin");
  const [items, setItems] = useState<readonly AnchorDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/system/operations", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setItems((data?.anchorQueue ?? []) as AnchorDto[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("anchorQueue.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="anchor-queue">
      <h2 className="text-h4 font-semibold text-ink">{t("anchorQueue.title")}</h2>
      <p className="text-small text-ink-soft">{t("anchorQueue.hint")}</p>
      {loading && <p className="text-small text-ink-soft">{t("anchorQueue.loading")}</p>}
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      {!loading && error === null && items.length === 0 && (
        <p data-testid="empty-state" className="text-small text-ink-soft">{t("anchorQueue.empty")}</p>
      )}
      <ul className="flex flex-col divide-y divide-line text-small text-ink">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="anchor-row">
            <span className="min-w-0 flex-1">
              <strong>{item.entityType}</strong> · {item.status}
              {item.retryCount > 0 ? ` · ${t("anchorQueue.retries", { count: item.retryCount })}` : ""}
              {item.txHash ? ` · ${item.txHash.slice(0, 12)}…` : ""}
            </span>
            <span className="text-ink-soft">{new Date(item.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
