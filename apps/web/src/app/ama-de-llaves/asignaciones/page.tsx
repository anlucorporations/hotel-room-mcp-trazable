import { getTranslations } from "next-intl/server";
import { HousekeepingRepository } from "@hotel/shared";
import { defaultBoardDate } from "@/lib/housekeeping-board";
import { currentHousekeepingSession } from "@/lib/housekeeping-suite/session";
import { AssignmentBoard } from "@/components/housekeeping/AssignmentBoard";
import type { AssignmentDto, RoomCandidateDto } from "@/lib/housekeeping-suite/types";

export const dynamic = "force-dynamic";

/** Reparto y avance de asignaciones (F6 · T6.1/T6.2, CU-V-17/18). */
export default async function AmaDeLlavesAssignmentsPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  const repo = new HousekeepingRepository();
  const date = defaultBoardDate();
  const [shifts, assignments, rooms] = await Promise.all([
    repo.listShifts(date).catch(() => []),
    repo.listAssignmentsByDate(date).catch(() => []),
    repo.listRoomsToClean(date).catch(() => []),
  ]);
  const assignmentRows: AssignmentDto[] = assignments.map((assignment) => ({
    id: assignment.id,
    shiftId: assignment.shiftId,
    roomId: assignment.roomId,
    roomNumber: assignment.roomNumber,
    assignee: assignment.assignee,
    status: assignment.status,
    assignedAt: assignment.assignedAt.toISOString(),
    completedAt: assignment.completedAt?.toISOString() ?? null,
  }));
  const roomRows: RoomCandidateDto[] = rooms.map((room) => ({
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    roomType: room.roomType,
    operationalStatus: room.operationalStatus,
    reason: room.reason,
  }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("assignments.title")}</h1>
        <p className="text-body text-ink-soft">{t("assignments.tagline")}</p>
      </header>
      <AssignmentBoard
        date={date}
        shifts={shifts.map((shift) => ({ id: shift.id, label: shift.label }))}
        assignments={assignmentRows}
        rooms={roomRows}
        assignees={
          assignmentRows.length > 0
            ? [...new Set(assignmentRows.map((assignment) => assignment.assignee))]
            : [t("shifts.defaultKeeper1"), t("shifts.defaultKeeper2")]
        }
      />
    </>
  );
}
