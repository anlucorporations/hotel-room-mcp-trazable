"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DamageNotificationView } from "@/lib/damages/types";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Panel de **reclamaciones de daños** en recepción (F7 · T7.5).
 *
 * Muestra los avisos con plazo, importe y descripción, y resuelve la reclamación: aceptar la suma al
 * folio del check-out, rechazar cancela el cargo (D-C11). `data-testid="damage-claims-panel"`.
 */
export function DamageClaimsPanel() {
  const t = useTranslations("damages");
  const [notifications, setNotifications] = useState<readonly DamageNotificationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/reception/damage-charges", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setNotifications((data?.notifications ?? []) as DamageNotificationView[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, accepted: boolean): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/reception/damage-charges", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id, accepted }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-small text-ink-soft">{t("loading")}</p>;
  if (error !== null) return <p role="alert" className="text-small text-error">{error}</p>;

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="damage-claims-panel">
      <h2 className="text-h4 font-semibold text-ink">{t("claims.title")}</h2>
      {notifications.length === 0 ? (
        <p data-testid="empty-state" className="text-small text-ink-soft">{t("claims.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {notifications.map((notification) => (
            <li key={notification.id} className="flex flex-wrap items-center gap-2 py-2 text-small text-ink" data-testid="damage-claim-row">
              <span className="min-w-0 flex-1">
                {notification.concept} · {notification.damageDescription} ·{" "}
                {formatEuros(notification.amountCents, notification.currency)} ·{" "}
                {t(`status.${notification.status}`)} · {t("claims.due", { date: new Date(notification.dueDate).toLocaleDateString() })}
              </span>
              {(notification.status === "DISPUTED" || notification.status === "EXPIRED") && (
                <span className="flex gap-2">
                  <button type="button" className={BUTTON} disabled={busyId === notification.id} onClick={() => void resolve(notification.id, true)}>
                    {t("claims.accept")}
                  </button>
                  <button type="button" className={BUTTON} disabled={busyId === notification.id} onClick={() => void resolve(notification.id, false)}>
                    {t("claims.reject")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatEuros(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amountCents / 100);
}
