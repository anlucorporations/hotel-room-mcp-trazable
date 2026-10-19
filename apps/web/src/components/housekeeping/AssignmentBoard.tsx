"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AssignmentDto, RoomCandidateDto } from "@/lib/housekeeping-suite/types";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Reparto y avance de **asignaciones** (F6 · T6.2, CU-V-17/18).
 *
 * Permite asignar una habitación a una camarera, arrancar el trabajo y completarlo (lo que deja la
 * habitación `CLEAN` y descuenta lencería). La inspección posterior vive en `/inspecciones`.
 */
export function AssignmentBoard({
  date,
  shifts,
  assignments,
  rooms,
  assignees,
}: {
  readonly date: string;
  readonly shifts: readonly { id: string; label: string }[];
  readonly assignments: readonly AssignmentDto[];
  readonly rooms: readonly RoomCandidateDto[];
  readonly assignees: readonly string[];
}) {
  const t = useTranslations("amaDeLlaves");
  const router = useRouter();
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? "");
  const [roomId, setRoomId] = useState(rooms[0]?.roomId ?? "");
  const [assignee, setAssignee] = useState(assignees[0] ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown): Promise<void> {
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
    router.refresh();
  }

  async function patch(id: string, action: "start" | "complete"): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/housekeeping/assignments/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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
    <div className="flex flex-col gap-4" data-testid="assignment-board">
      <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("assignments.assignTitle")}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("assignments.shift")}
            <select className={FIELD} value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {t(`shiftLabel.${shift.label}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("assignments.room")}
            <select className={FIELD} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  {room.roomNumber} · {room.roomType}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("assignments.assignee")}
            <select className={FIELD} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              {assignees.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={BUTTON}
            disabled={!shiftId || !roomId || !assignee}
            onClick={() => void post("/api/housekeeping/assignments", { shiftId, roomId, assignee })}
          >
            {t("assignments.assign")}
          </button>
        </div>
        {rooms.length === 0 && (
          <p data-testid="empty-state" className="text-small text-ink-soft">{t("assignments.noRooms")}</p>
        )}
      </section>

      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}

      <section className="rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("assignments.listTitle", { date })}</h2>
        {assignments.length === 0 ? (
          <p data-testid="empty-state" className="mt-1 text-small text-ink-soft">{t("assignments.empty")}</p>
        ) : (
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-wrap items-center gap-2 py-2 text-small text-ink">
                <span className="min-w-0 flex-1">
                  {t("assignments.room")} {assignment.roomNumber ?? "—"} · {assignment.assignee} ·{" "}
                  {t(`assignmentStatus.${assignment.status}`)}
                </span>
                {assignment.status === "PENDING" && (
                  <button type="button" className={BUTTON} disabled={busyId === assignment.id} onClick={() => void patch(assignment.id, "start")}>
                    {t("assignments.start")}
                  </button>
                )}
                {assignment.status === "IN_PROGRESS" && (
                  <button type="button" className={BUTTON} disabled={busyId === assignment.id} onClick={() => void patch(assignment.id, "complete")}>
                    {t("assignments.complete")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
