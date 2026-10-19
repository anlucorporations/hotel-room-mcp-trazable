"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";
const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink";

interface FlagDto {
  readonly key: string;
  readonly label: string;
  readonly mandatory: boolean;
  readonly value: "true" | "false";
}

/** Gobernanza de **flags operativos** con TOTP y firma CONFIG para flags obligatorios (F9 · T9.3). */
export function FlagsPanel() {
  const t = useTranslations("admin");
  const [flags, setFlags] = useState<readonly FlagDto[]>([]);
  const [totp, setTotp] = useState("");
  const [signatureId, setSignatureId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/settings/flags", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setFlags((data?.flags ?? []) as FlagDto[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("flags.error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(flag: FlagDto, next: "true" | "false"): Promise<void> {
    setBusyKey(flag.key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings/flags", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: flag.key, value: next, totpCode: totp, ...(signatureId ? { signatureId } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setMessage(t("flags.saved", { key: flag.key }));
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("flags.error"));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="flags-panel">
      <h2 className="text-h4 font-semibold text-ink">{t("flags.title")}</h2>
      <p className="text-small text-ink-soft">{t("flags.hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("flags.totp")}
          <input className={FIELD} inputMode="numeric" maxLength={6} value={totp} onChange={(event) => setTotp(event.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("flags.signatureId")}
          <input className={FIELD} value={signatureId} onChange={(event) => setSignatureId(event.target.value)} placeholder="uuid CONFIG" />
        </label>
      </div>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      {message !== null && <p role="status" className="text-small text-success">{message}</p>}
      <ul className="flex flex-col divide-y divide-line text-small text-ink">
        {flags.map((flag) => (
          <li key={flag.key} className="flex flex-wrap items-center gap-2 py-2" data-testid="flag-row">
            <span className="min-w-0 flex-1">
              <strong>{flag.label}</strong> · <code>{flag.key}</code> ·{" "}
              {flag.value === "true" ? t("flags.on") : t("flags.off")}
              {flag.mandatory ? ` · ${t("flags.mandatory")}` : ""}
            </span>
            <button
              type="button"
              className={BUTTON}
              disabled={busyKey === flag.key || totp.length !== 6}
              onClick={() => void apply(flag, flag.value === "true" ? "false" : "true")}
            >
              {flag.value === "true" ? t("flags.disable") : t("flags.enable")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
