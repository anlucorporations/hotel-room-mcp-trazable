"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { AdminCard } from "@/components/admin/AdminPanel";

/**
 * Ajustes de plataforma (D-11/D-37/D-42): ventana de acuñado, anticipo y plazo de reserva y hora
 * límite del no-show. Consume `GET/PUT /api/admin/settings` (solo owner). Los valores son
 * **configurables sin desplegar**; sin fila guardada rigen los respaldos (90 días / 30 % / 24 h / 18 h).
 */

interface Settings {
  mint_window_days: number;
  reservation_deposit_percent: number;
  reservation_hold_hours: number;
  no_show_hour: number;
}

const FIELD =
  "min-h-touch w-full rounded-brand border border-line bg-shell px-3 text-ink outline-none focus:border-sea";
const ACTION =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

const FIELDS: ReadonlyArray<{ key: keyof Settings; min: number; max: number; labelKey: string }> = [
  { key: "mint_window_days", min: 1, max: 365, labelKey: "windowDays" },
  { key: "reservation_deposit_percent", min: 0, max: 100, labelKey: "depositPercent" },
  { key: "reservation_hold_hours", min: 1, max: 720, labelKey: "holdHours" },
  { key: "no_show_hour", min: 0, max: 23, labelKey: "noShowHour" },
];

export function SettingsAdmin() {
  const t = useTranslations("settings");
  const { apiFetch } = useAdminContext();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("loadError"));
      setSettings(data.settings ?? null);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setNotice(null);
    try {
      const body: Record<string, number> = {};
      for (const { key } of FIELDS) body[key] = Number(data.get(key));
      const res = await apiFetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t("saveError"));
      setSettings(payload.settings ?? null);
      setNotice({ kind: "ok", text: t("saved") });
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }

  return (
    <AdminCard>
      {notice && (
        <p
          data-testid="settings-notice"
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "text-terracotta-text" : "text-sea-deep"}
        >
          {notice.text}
        </p>
      )}
      <p className="mt-1 text-small text-ink-soft">{t("hint")}</p>
      <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {FIELDS.map(({ key, min, max, labelKey }) => (
          <label key={key} className="flex flex-col gap-1 text-small font-medium text-ink">
            {t(labelKey)}
            <input
              name={key}
              type="number"
              min={min}
              max={max}
              required
              defaultValue={settings?.[key] ?? ""}
              data-testid={`setting-${key}`}
              className={FIELD}
            />
          </label>
        ))}
        <div className="tablet:col-span-2">
          <button type="submit" data-testid="settings-save" disabled={saving} className={ACTION}>
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </AdminCard>
  );
}
