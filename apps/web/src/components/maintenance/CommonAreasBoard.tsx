"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AreaDto, AreaLogDto } from "@/lib/mantenimiento/types";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Tablero de **áreas comunes** (F4 · T4.2/T4.4).
 *
 * Registrar una ejecución no exige firma; verificarla sí la enlaza si se aporta (`signature_id`).
 * Las áreas críticas se marcan en la UI para que el jefe sepa qué revisiones son las sensibles.
 */
export function CommonAreasBoard({
  areas,
  pendingLogs,
}: {
  readonly areas: readonly AreaDto[];
  readonly pendingLogs: readonly AreaLogDto[];
}) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function registerLog(taskId: string): Promise<void> {
    setBusyId(taskId);
    setError(null);
    try {
      const response = await fetch("/api/mantenimiento/areas-comunes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "log", taskId, notes: notes[taskId]?.trim() || null }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function verifyLog(logId: string): Promise<void> {
    setBusyId(logId);
    setError(null);
    try {
      const response = await fetch("/api/mantenimiento/areas-comunes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", logId }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="common-areas-board">
      {error !== null && (
        <p role="alert" className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-error">
          {error}
        </p>
      )}

      {areas.length === 0 ? (
        <p data-testid="empty-state" className="rounded-brand border border-dashed border-line px-4 py-6 text-small text-ink-soft">
          {t("noAreas")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {areas.map((area) => (
            <li key={area.id} className="rounded-brand border border-line px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-h4 font-semibold text-ink">{area.name}</h2>
                <p className="text-micro text-ink-soft">{area.areaTypeName ?? area.areaTypeCode}</p>
                {area.isCritical && (
                  <p className="rounded-pill bg-info-bg px-2 py-0.5 text-micro font-semibold text-info">{t("criticalArea")}</p>
                )}
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {area.tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-2 text-small text-ink">
                    <span className="min-w-0 flex-1">
                      {task.label} · {t(`periodicity.${task.periodicity}`)}
                    </span>
                    <input
                      className="min-h-touch w-56 rounded-brand-sm border border-line-strong bg-shell px-3 text-small"
                      placeholder={t("notesPlaceholder")}
                      maxLength={200}
                      value={notes[task.id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))}
                    />
                    <button type="button" className={BUTTON} disabled={busyId === task.id} onClick={() => void registerLog(task.id)}>
                      {t("registerExecution")}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-h4 font-semibold text-ink">{t("pendingVerificationTitle")}</h2>
        {pendingLogs.length === 0 ? (
          <p data-testid="empty-state" className="text-small text-ink-soft">
            {t("pendingVerificationEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-brand border border-line">
            {pendingLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-small text-ink">
                <span className="min-w-0 flex-1">
                  {log.taskLabel ?? log.taskId} · {log.areaName ?? "—"} · {new Date(log.performedAt).toLocaleString()}
                </span>
                <button type="button" className={BUTTON} disabled={busyId === log.id} onClick={() => void verifyLog(log.id)}>
                  {t("verify")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
