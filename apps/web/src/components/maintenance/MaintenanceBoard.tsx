"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { CredentialForm } from "@/components/admin/CredentialForm";
import { ReportIncidentPanel } from "./ReportIncidentPanel";

/** Fecha local del puesto, formato ISO `YYYY-MM-DD`. */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

interface Incident {
  id: string;
  roomNumber: number | null;
  kind: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  assignedTo: string | null;
}
interface Task {
  id: string;
  planCode: string | null;
  planName: string | null;
  equipment: string | null;
  dueDate: string;
  roomNumber: number | null;
  overdue: boolean;
}
interface MaintenanceBoardData {
  date: string;
  incidents: readonly Incident[];
  dueTasks: readonly Task[];
  blockedRoomIds: readonly string[];
}

/**
 * Tablero del técnico de mantenimiento (F4 · D-52…D-54, D-63).
 *
 * Ruta independiente `/mantenimiento`, rol `MAINTENANCE` sin wallet. Muestra las **incidencias
 * abiertas** (se las puede asignar y resolver), las **tareas preventivas vencidas o de hoy** (aviso,
 * D-54) y permite **reportar** una avería. Al resolver una incidencia, la habitación vuelve a estar
 * disponible para la venta (D-53).
 */
export function MaintenanceBoard() {
  const t = useTranslations("maintenance");
  const session = useAdminSession();
  const { sessionUsername, isLoading } = session;

  const [date, setDate] = useState<string>(todayIso);
  const [board, setBoard] = useState<MaintenanceBoardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = session.isOwner || (session.roles as readonly string[]).includes("MAINTENANCE");

  const load = useCallback(
    async (targetDate: string): Promise<void> => {
      setError(null);
      try {
        const res = await session.apiFetch(`/api/mantenimiento/board?date=${encodeURIComponent(targetDate)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { message?: string }).message || t("loadError"));
        setBoard(data as MaintenanceBoardData);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("loadError"));
      }
    },
    [session, t],
  );

  useEffect(() => {
    if (!sessionUsername || !allowed) return;
    void load(date);
    // `session.apiFetch` es estable; recargar solo al cambiar fecha/sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUsername, allowed, date]);

  const mutate = useCallback(
    async (input: string, init: RequestInit): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const res = await session.apiFetch(input, init);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { message?: string }).message || t("actionError"));
        }
        await load(date);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("actionError"));
      } finally {
        setBusy(false);
      }
    },
    [session, t, date, load],
  );

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }
  if (!sessionUsername) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 rounded-brand-lg border border-line bg-shell p-6 shadow-card">
        <h2 className="font-display text-h3 font-semibold">{t("gateTitle")}</h2>
        <CredentialForm session={session} />
      </div>
    );
  }
  if (!allowed) {
    return (
      <p data-testid="maintenance-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  const incidents = board?.incidents ?? [];
  const dueTasks = board?.dueTasks ?? [];
  const incidentAction = (id: string, action: "assign" | "resolve" | "cancel"): void => {
    void mutate(`/api/mantenimiento/incidents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
  };
  const taskAction = (id: string, action: "complete" | "skip"): void => {
    void mutate(`/api/mantenimiento/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-small text-ink-soft">{t("signedAs", { username: sessionUsername })}</p>
        <label className="flex items-center gap-2 text-small">
          <span className="font-medium text-ink">{t("date")}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            data-testid="maintenance-date"
            className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      <section aria-labelledby="maint-incidents-title" className="flex flex-col gap-3">
        <h2 id="maint-incidents-title" className="font-display text-h3 font-semibold text-ink">
          {t("incidentsTitle")}
        </h2>
        {incidents.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noIncidents")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incidents.map((incident) => (
              <li key={incident.id} data-testid={`maint-incident-${incident.roomNumber}`} className="flex flex-col gap-2 rounded-brand-lg border border-line bg-shell p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-h3 font-semibold text-ink">
                    {t("room")} {incident.roomNumber ?? "—"}
                  </span>
                  <span className={`rounded-pill px-2 py-0.5 text-micro font-semibold ${incident.priority === "HIGH" ? "bg-terracotta/20 text-ink" : "bg-sand-2 text-ink-soft"}`}>
                    {t(`priority.${incident.priority}`)}
                  </span>
                  <span className="rounded-pill bg-sand-2 px-2 py-0.5 text-micro font-semibold text-ink-soft">
                    {t(incident.status === "IN_PROGRESS" ? "statusInProgress" : "statusOpen")}
                  </span>
                </div>
                <p className="text-small text-ink">
                  {t(`kind.${incident.kind}` as "kind.OTROS")}
                  {incident.description ? ` · ${incident.description}` : ""}
                </p>
                {incident.assignedTo && <p className="text-micro text-ink-soft">{t("assignedTo", { name: incident.assignedTo })}</p>}
                <div className="flex flex-wrap gap-2">
                  {incident.status === "OPEN" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => incidentAction(incident.id, "assign")}
                      className="min-h-touch rounded-pill border border-sea px-3 text-small font-semibold text-sea disabled:opacity-40"
                    >
                      {t("assignMe")}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => incidentAction(incident.id, "resolve")}
                    className="min-h-touch rounded-pill bg-olive px-3 text-small font-semibold text-shell disabled:opacity-40"
                  >
                    {t("resolve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => incidentAction(incident.id, "cancel")}
                    className="min-h-touch rounded-pill border border-line px-3 text-small font-semibold text-ink-soft disabled:opacity-40"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="maint-tasks-title" className="flex flex-col gap-3">
        <h2 id="maint-tasks-title" className="font-display text-h3 font-semibold text-ink">
          {t("tasksTitle")}
        </h2>
        {dueTasks.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noTasks")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dueTasks.map((task) => (
              <li key={task.id} data-testid={`maint-task-${task.planCode}`} className={`flex flex-wrap items-center gap-2 rounded-brand-lg border px-4 py-2 ${task.overdue ? "border-terracotta/50 bg-terracotta/10" : "border-line bg-sand-2"}`}>
                <span className="font-medium text-ink">{task.planName ?? task.planCode}</span>
                <span className="text-micro text-ink-soft">
                  {task.equipment}
                  {task.roomNumber ? ` · ${t("room")} ${task.roomNumber}` : ""} · {t("dueDate", { date: task.dueDate })}
                </span>
                {task.overdue && <span className="rounded-pill bg-terracotta/20 px-2 py-0.5 text-micro font-semibold text-ink">{t("overdue")}</span>}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => taskAction(task.id, "complete")}
                    className="min-h-touch rounded-pill bg-olive px-3 text-small font-semibold text-shell disabled:opacity-40"
                  >
                    {t("complete")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => taskAction(task.id, "skip")}
                    className="min-h-touch rounded-pill border border-line px-3 text-small font-semibold text-ink-soft disabled:opacity-40"
                  >
                    {t("skip")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReportIncidentPanel apiFetch={session.apiFetch} />
    </div>
  );
}
