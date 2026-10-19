"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const BUTTON =
  "min-h-touch rounded-pill bg-azure px-3 text-micro font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

interface ValidationTaskDto {
  readonly id: string;
  readonly planName: string | null;
  readonly equipment: string | null;
  readonly roomNumber: number | null;
  readonly areaName: string | null;
  readonly completedBy: string | null;
  readonly completedAt: string | null;
  readonly validationStatus: string | null;
  readonly remainingMs: number;
  readonly expired: boolean;
}

/**
 * Cola de **validación del jefe** (F8 · T8.5 · RNF-M-21).
 *
 * Muestra las tareas cerradas desde el terminal con su cuenta atrás de 24 h (`sla-countdown`) y las
 * vencidas (`pending-verification`, escaladas al Administrador). Validar deja `VALIDATED`.
 */
export function ValidationBoard() {
  const t = useTranslations("validaciones");
  const [tasks, setTasks] = useState<readonly ValidationTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mantenimiento/validaciones", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setTasks((data?.tasks ?? []) as ValidationTaskDto[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function validate(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/mantenimiento/validaciones", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-small text-ink-soft">{t("loading")}</p>;
  if (error !== null) return <p role="alert" className="text-small text-error">{error}</p>;
  if (tasks.length === 0) return <p data-testid="empty-state" className="text-small text-ink-soft">{t("empty")}</p>;

  return (
    <ul className="flex flex-col divide-y divide-line" data-testid="validation-board">
      {tasks.map((task) => {
        const hours = Math.floor(task.remainingMs / 3_600_000);
        const minutes = Math.floor((task.remainingMs % 3_600_000) / 60_000);
        return (
          <li key={task.id} className="flex flex-wrap items-center gap-2 py-3 text-small text-ink" data-testid="pending-verification">
            <span className="min-w-0 flex-1">
              <strong>{task.planName ?? task.equipment ?? t("task")}</strong>
              {task.roomNumber !== null ? ` · ${t("room")} ${task.roomNumber}` : ""}
              {task.areaName !== null ? ` · ${task.areaName}` : ""}
              <span className="block text-ink-soft">
                {t("closedBy", { name: task.completedBy ?? "—" })}
                {" · "}
                {task.expired ? (
                  <span className="font-semibold text-error" data-testid="sla-expired">{t("expired")}</span>
                ) : (
                  <span data-testid="sla-countdown" className="font-semibold">
                    {t("remaining", { hours, minutes })}
                  </span>
                )}
              </span>
            </span>
            <button type="button" className={BUTTON} disabled={busyId === task.id} onClick={() => void validate(task.id)}>
              {t("validate")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
