"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";
const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink";

interface OperatorDto {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly role: string;
  readonly active: boolean;
  readonly mustChangePin: boolean;
  readonly failedAttempts: number;
  readonly lockedUntil: string | null;
}

/**
 * Alta, rotación de PIN, baja y desbloqueo de **operarios de terminal** (F9 · T9.4, CU-V-44).
 * El PIN generado se muestra **una única vez** (no se guarda en claro).
 */
export function TerminalOperatorsPanel() {
  const t = useTranslations("admin");
  const [operators, setOperators] = useState<readonly OperatorDto[]>([]);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("MAINTENANCE_TECH");
  const [oneTimePin, setOneTimePin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/system/terminal-operators", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setOperators((data?.operators ?? []) as OperatorDto[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("terminalOperators.error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/system/terminal-operators", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, fullName, role }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setOneTimePin(data.pin ?? null);
      setUsername("");
      setFullName("");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("terminalOperators.error"));
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, kind: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/system/terminal-operators", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: kind }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      if (data?.pin) setOneTimePin(data.pin);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("terminalOperators.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="terminal-operators-panel">
      <h2 className="text-h4 font-semibold text-ink">{t("terminalOperators.title")}</h2>
      <p className="text-small text-ink-soft">{t("terminalOperators.hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("terminalOperators.username")}
          <input className={FIELD} value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("terminalOperators.fullName")}
          <input className={FIELD} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("terminalOperators.role")}
          <select className={FIELD} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="MAINTENANCE_TECH">MAINTENANCE_TECH</option>
            <option value="HOUSEKEEPER">HOUSEKEEPER</option>
          </select>
        </label>
        <button type="button" className={BUTTON} disabled={busy || !username || !fullName} onClick={() => void create()}>
          {t("terminalOperators.create")}
        </button>
      </div>
      {oneTimePin !== null && (
        <p role="status" data-testid="terminal-operator-pin" className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-ink">
          {t("terminalOperators.oneTimePin", { pin: oneTimePin })}
        </p>
      )}
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      <ul className="flex flex-col divide-y divide-line text-small text-ink">
        {operators.map((operator) => (
          <li key={operator.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="terminal-operator-row">
            <span className="min-w-0 flex-1">
              {operator.username} · {operator.fullName} · {operator.role} ·{" "}
              {operator.active ? t("terminalOperators.active") : t("terminalOperators.inactive")}
              {operator.lockedUntil !== null ? ` · ${t("terminalOperators.locked")}` : ""}
            </span>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void action(operator.id, "rotate-pin")}>
              {t("terminalOperators.rotatePin")}
            </button>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void action(operator.id, "unlock")}>
              {t("terminalOperators.unlock")}
            </button>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void action(operator.id, operator.active ? "deactivate" : "activate")}>
              {operator.active ? t("terminalOperators.deactivate") : t("terminalOperators.activate")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
