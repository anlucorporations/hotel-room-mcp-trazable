"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { CredentialForm } from "@/components/admin/CredentialForm";
import { ReportIncidentPanel } from "@/components/maintenance/ReportIncidentPanel";

/** Fecha local del puesto (no UTC), formato ISO `YYYY-MM-DD`. */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

type ShiftLabel = "MANANA" | "TARDE" | "NOCHE";
type AssignmentStatus = "PENDING" | "IN_PROGRESS" | "DONE";
type CleaningReason = "CHECKOUT" | "DIRTY" | "STAYOVER";

interface Shift {
  id: string;
  label: ShiftLabel;
  supervisor: string;
}
interface Assignment {
  id: string;
  shiftId: string;
  roomId: string;
  roomNumber: number | null;
  assignee: string;
  status: AssignmentStatus;
}
interface SupplyItem {
  id: string;
  code: string;
  nameEs: string;
  unit: string;
  stockQty: number;
  thresholdQty: number;
}
interface RoomToClean {
  roomId: string;
  roomNumber: number;
  reason: CleaningReason;
}
interface BoardSnapshot {
  date: string;
  shifts: Shift[];
  assignments: Assignment[];
  lowStock: SupplyItem[];
}

/**
 * Tablero del servicio de habitaciones (F3 · D-19, D-30, D-48, D-50, D-62).
 *
 * Ruta **independiente** `/housekeeping`, pensada para el móvil del personal y con **rol limitado sin
 * wallet** (`HOUSEKEEPING`, D-50/D-56). El tablero se actualiza por **SSE** (<2 s, D-30) y todo se
 * opera con un toque: empezar y terminar una habitación, y ver el reparto del día. La lencería baja
 * de umbral se avisa aquí mismo además de en el panel de Administración (D-64).
 */
export function HousekeepingBoard() {
  const t = useTranslations("housekeeping");
  const session = useAdminSession();
  const { sessionUsername, isLoading } = session;

  const [date, setDate] = useState<string>(todayIso);
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [rooms, setRooms] = useState<readonly RoomToClean[]>([]);
  const [assignees, setAssignees] = useState("Marta, Lucía");
  const [shiftLabel, setShiftLabel] = useState<ShiftLabel>("MANANA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [manualNames, setManualNames] = useState<Record<string, string>>({});

  // `useAdminSession.hasRole` está tipado con los roles del contrato; HOUSEKEEPING es un rol de
  // back-office sin wallet (D-56), así que se comprueba sobre la lista de roles de la sesión.
  const allowed = session.isOwner || (session.roles as readonly string[]).includes("HOUSEKEEPING");

  const loadStatic = useCallback(
    async (targetDate: string): Promise<void> => {
      setError(null);
      try {
        const [boardRes, roomsRes] = await Promise.all([
          session.apiFetch(`/api/housekeeping/shifts?date=${encodeURIComponent(targetDate)}`).then((r) => r.json().catch(() => ({}))),
          session.apiFetch(`/api/housekeeping/rooms?date=${encodeURIComponent(targetDate)}`).then((r) => r.json().catch(() => ({}))),
        ]);
        setRooms((roomsRes.rooms as RoomToClean[]) ?? []);
        // Los turnos se refrescan de inmediato tras crearlos; el resto del tablero llega por SSE.
        setBoard((current) => ({
          date: targetDate,
          shifts: (boardRes.shifts as Shift[]) ?? [],
          assignments: current && current.date === targetDate ? current.assignments : [],
          lowStock: current && current.date === targetDate ? current.lowStock : [],
        }));
      } catch {
        setError(t("loadError"));
      }
    },
    [session, t],
  );

  // Flujo en tiempo real (D-30): la fuente es PostgreSQL, así que funciona con varias instancias.
  useEffect(() => {
    if (!sessionUsername || !allowed) return;
    void loadStatic(date);

    const source = new EventSource(`/api/housekeeping/stream?date=${encodeURIComponent(date)}`);
    source.addEventListener("open", () => setLive(true));
    source.addEventListener("error", () => setLive(false));
    source.addEventListener("board", (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as BoardSnapshot;
        setBoard(snapshot);
        setLive(true);
      } catch {
        /* mensaje no válido: se ignora y se espera al siguiente */
      }
    });
    return () => {
      source.close();
      setLive(false);
    };
    // `session.apiFetch` es estable; reconectar solo al cambiar de sesión o de fecha.
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
        await loadStatic(date);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("actionError"));
      } finally {
        setBusy(false);
      }
    },
    [session, t, date, loadStatic],
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
      <p data-testid="housekeeping-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  const shifts = board?.shifts ?? [];
  const assignments = board?.assignments ?? [];
  const lowStock = board?.lowStock ?? [];
  const selectedShift = shifts.find((shift) => shift.label === shiftLabel) ?? shifts[0];
  const unassigned = rooms.filter((room) => !assignments.some((assignment) => assignment.roomId === room.roomId));
  const people = assignees.split(",").map((name) => name.trim()).filter(Boolean);

  const reasonLabel = (reason: CleaningReason): string =>
    t(reason === "CHECKOUT" ? "reasonCheckout" : reason === "DIRTY" ? "reasonDirty" : "reasonStayover");

  return (
    <div className="flex flex-col gap-6">
      <p className="flex flex-wrap items-center gap-2 text-small text-ink-soft">
        <span>{t("signedAs", { username: sessionUsername })}</span>
        <span
          data-testid="housekeeping-live"
          className={`rounded-pill px-2 py-0.5 text-micro font-semibold ${live ? "bg-olive/15 text-olive" : "bg-sand-2 text-ink-soft"}`}
        >
          {live ? t("live") : t("reconnecting")}
        </span>
      </p>

      {lowStock.length > 0 && (
        <div role="alert" data-testid="housekeeping-low-stock" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3">
          <h2 className="text-small font-semibold text-ink">{t("lowStockTitle")}</h2>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-soft">
            {lowStock.map((item) => (
              <li key={item.id}>
                {item.nameEs}: {item.stockQty} {item.unit} ({t("threshold")} {item.thresholdQty})
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-brand-lg border border-line bg-shell p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("date")}</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              data-testid="housekeeping-date"
              className="min-h-touch rounded-brand-sm border border-line-strong bg-sand px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("shift")}</span>
            <select
              value={shiftLabel}
              onChange={(event) => setShiftLabel(event.target.value as ShiftLabel)}
              data-testid="housekeeping-shift-label"
              className="min-h-touch rounded-brand-sm border border-line-strong bg-sand px-3"
            >
              <option value="MANANA">{t("shiftManana")}</option>
              <option value="TARDE">{t("shiftTarde")}</option>
              <option value="NOCHE">{t("shiftNoche")}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void mutate("/api/housekeeping/shifts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ date, label: shiftLabel, supervisor: sessionUsername }),
              })
            }
            className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell disabled:opacity-50"
          >
            {t("createShift")}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("assignees")}</span>
            <input
              type="text"
              value={assignees}
              onChange={(event) => setAssignees(event.target.value)}
              data-testid="housekeeping-assignees"
              className="min-h-touch rounded-brand-sm border border-line-strong bg-sand px-3"
            />
          </label>
          <button
            type="button"
            disabled={busy || !selectedShift || people.length === 0}
            onClick={() =>
              selectedShift &&
              void mutate("/api/housekeeping/assignments", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ shiftId: selectedShift.id, assignees: people }),
              })
            }
            className="min-h-touch rounded-pill bg-sea-deep px-4 text-small font-semibold text-shell disabled:opacity-50"
          >
            {t("autoAssign")}
          </button>
        </div>
        {!selectedShift && <p className="text-micro text-ink-soft">{t("createShiftFirst")}</p>}
      </section>

      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      <section aria-labelledby="hk-board-title" className="flex flex-col gap-3">
        <h2 id="hk-board-title" className="font-display text-h3 font-semibold text-ink">
          {t("boardTitle")}
        </h2>
        {assignments.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noAssignments")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignments.map((assignment) => (
              <li key={assignment.id} data-testid={`hk-card-${assignment.roomNumber}`} className="flex flex-col gap-2 rounded-brand-lg border border-line bg-shell p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="font-display text-h3 font-semibold text-ink">
                    {t("room")} {assignment.roomNumber ?? "—"}
                  </span>
                  <span className="rounded-pill bg-sand-2 px-2 py-0.5 text-micro font-semibold text-ink-soft">
                    {t(assignment.status === "DONE" ? "statusDone" : assignment.status === "IN_PROGRESS" ? "statusInProgress" : "statusPending")}
                  </span>
                </div>
                <p className="text-micro text-ink-soft">{t("assignee")}: {assignment.assignee}</p>
                {assignment.status !== "DONE" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || assignment.status === "IN_PROGRESS"}
                      onClick={() => void mutate(`/api/housekeeping/assignments/${assignment.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "start" }),
                      })}
                      className="min-h-touch flex-1 rounded-pill border border-sea px-3 text-small font-semibold text-sea disabled:opacity-40"
                    >
                      {t("start")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mutate(`/api/housekeeping/assignments/${assignment.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "complete" }),
                      })}
                      className="min-h-touch flex-1 rounded-pill bg-olive px-3 text-small font-semibold text-shell disabled:opacity-40"
                    >
                      {t("complete")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hk-rooms-title" className="flex flex-col gap-3">
        <h2 id="hk-rooms-title" className="font-display text-h3 font-semibold text-ink">
          {t("roomsToClean")}
        </h2>
        {unassigned.length === 0 ? (
          <p className="text-small text-ink-soft">{t("allAssigned")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unassigned.map((room) => (
              <li key={room.roomId} className="flex flex-wrap items-center gap-2 rounded-brand-lg border border-line bg-sand-2 px-4 py-2">
                <span className="font-medium text-ink">
                  {t("room")} {room.roomNumber}
                </span>
                <span className="text-micro text-ink-soft">{reasonLabel(room.reason)}</span>
                <input
                  type="text"
                  aria-label={t("assignManually")}
                  placeholder={t("assignee")}
                  value={manualNames[room.roomId] ?? ""}
                  onChange={(event) =>
                    setManualNames((current) => ({ ...current, [room.roomId]: event.target.value }))
                  }
                  className="min-h-touch min-w-[10rem] flex-1 rounded-brand-sm border border-line-strong bg-shell px-3 text-small"
                />
                <button
                  type="button"
                  disabled={busy || !selectedShift}
                  onClick={() => {
                    const name = (manualNames[room.roomId] ?? "").trim();
                    if (!name || !selectedShift) return;
                    void mutate("/api/housekeeping/assignments", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ shiftId: selectedShift.id, roomId: room.roomId, assignee: name }),
                    });
                  }}
                  className="min-h-touch rounded-pill border border-sea px-3 text-small font-semibold text-sea disabled:opacity-40"
                >
                  {t("assignManually")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* D-52: limpieza también reporta averías desde su propio tablero. */}
      <ReportIncidentPanel apiFetch={session.apiFetch} />
    </div>
  );
}
