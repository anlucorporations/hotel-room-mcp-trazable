"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { OfflineNotice } from "./TerminalLogin";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";
const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink";

interface IncidentDto {
  readonly id: string;
  readonly kind: string;
  readonly description: string | null;
  readonly priority: string;
  readonly status: string;
  readonly roomNumber: number | null;
  readonly blocksSale: boolean;
  readonly assignedTo: string | null;
  readonly createdAt: string;
}
interface TaskDto {
  readonly id: string;
  readonly dueDate: string;
  readonly status: string;
  readonly overdue: boolean;
  readonly planName: string | null;
  readonly equipment: string | null;
  readonly roomNumber: number | null;
  readonly areaName: string | null;
  readonly requiresSignature: boolean;
  readonly validationStatus: string | null;
  readonly updatedAt: string | null;
}
interface Operator {
  readonly username: string;
  readonly fullName: string;
  readonly role: string;
}

/**
 * Tablero del **terminal del técnico** (F5 · T5.1/T5.2/T5.5).
 *
 * Solo muestra lo asignado a la sesión (D-C35): incidencias y tareas preventivas. El cierre de tarea
 * avisa al jefe (`PENDING_VERIFICATION`, CU-V-14) y usa bloqueo optimista con `updatedAt` (T5.5).
 * Sin conexión, el aviso `terminal-offline` bloquea las escrituras (RNF-M-18).
 */
export function TerminalBoard() {
  const t = useTranslations("terminal");
  const [operator, setOperator] = useState<Operator | null>(null);
  const [incidents, setIncidents] = useState<readonly IncidentDto[]>([]);
  const [tasks, setTasks] = useState<readonly TaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/terminal/tasks", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setOperator(data.operator as Operator);
      setIncidents((data.incidents ?? []) as IncidentDto[]);
      setTasks((data.tasks ?? []) as TaskDto[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const update = (): void => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [load]);

  async function act(kind: "task" | "incident", id: string, action: string, expectedUpdatedAt?: string | null): Promise<void> {
    if (offline) {
      setError(t("offline"));
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/terminal/tasks", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          action,
          notes: notes[id] ?? null,
          ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
        }),
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
    <div className="flex flex-col gap-4" data-testid="terminal-board">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-h3 font-semibold text-ink">{t("boardTitle")}</h2>
          <p className="text-small text-ink-soft">{operator?.fullName ?? ""} · {t(`role.${operator?.role ?? "MAINTENANCE_TECH"}`)}</p>
        </div>
        <a href="/terminal/reportar" className="min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell">
          {t("reportCta")}
        </a>
      </header>
      <OfflineNotice />

      <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="terminal-tasks">
        <h2 className="text-h4 font-semibold text-ink">{t("tasksTitle")}</h2>
        {tasks.length === 0 ? (
          <p data-testid="empty-state" className="text-small text-ink-soft">{t("tasksEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {tasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-2 py-3 text-small text-ink" data-testid="terminal-task">
                <span className="font-semibold">
                  {task.planName ?? task.equipment ?? t("task")}
                  {task.roomNumber !== null ? ` · ${t("room")} ${task.roomNumber}` : ""}
                  {task.areaName !== null ? ` · ${task.areaName}` : ""}
                </span>
                <span className="text-ink-soft">
                  {t("due")} {task.dueDate}
                  {task.overdue ? ` · ${t("overdue")}` : ""}
                  {task.requiresSignature ? ` · ${t("critical")}` : ""}
                </span>
                <input
                  className={FIELD}
                  maxLength={200}
                  placeholder={t("notesPlaceholder")}
                  value={notes[task.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))}
                />
                <div>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={busyId === task.id || task.requiresSignature || offline}
                    onClick={() => void act("task", task.id, "close", task.updatedAt)}
                  >
                    {t("closeTask")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="terminal-incidents">
        <h2 className="text-h4 font-semibold text-ink">{t("incidentsTitle")}</h2>
        {incidents.length === 0 ? (
          <p data-testid="empty-state" className="text-small text-ink-soft">{t("incidentsEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {incidents.map((incident) => (
              <li key={incident.id} className="flex flex-col gap-2 py-3 text-small text-ink" data-testid="terminal-incident">
                <span className="font-semibold">
                  {t(`kind.${incident.kind}`)} · {t("room")} {incident.roomNumber ?? "—"} · {t(`priority.${incident.priority}`)}
                </span>
                {incident.description !== null && <span className="text-ink-soft">{incident.description}</span>}
                <input
                  className={FIELD}
                  maxLength={200}
                  placeholder={t("notesPlaceholder")}
                  value={notes[incident.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [incident.id]: event.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  {incident.status === "OPEN" && (
                    <button type="button" className={BUTTON} disabled={busyId === incident.id || offline} onClick={() => void act("incident", incident.id, "start")}>
                      {t("startIncident")}
                    </button>
                  )}
                  <button type="button" className={BUTTON} disabled={busyId === incident.id || offline} onClick={() => void act("incident", incident.id, "resolve")}>
                    {t("resolveIncident")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
