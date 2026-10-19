import { getTranslations } from "next-intl/server";
import { HousekeepingRepository } from "@hotel/shared";
import { defaultBoardDate } from "@/lib/housekeeping-board";
import { currentHousekeepingSession } from "@/lib/housekeeping-suite/session";
import { ShiftPlanner } from "@/components/housekeeping/ShiftPlanner";
import type { ShiftDto } from "@/lib/housekeeping-suite/types";

export const dynamic = "force-dynamic";

/** Turnos y reparto automático (F6 · T6.1/T6.2, CU-V-17). */
export default async function AmaDeLlavesShiftsPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  const repo = new HousekeepingRepository();
  const date = defaultBoardDate();
  const [shifts, assignments] = await Promise.all([
    repo.listShifts(date).catch(() => []),
    repo.listAssignmentsByDate(date).catch(() => []),
  ]);
  const rows: ShiftDto[] = shifts.map((shift) => ({
    id: shift.id,
    shiftDate: shift.shiftDate,
    label: shift.label,
    supervisor: shift.supervisor,
  }));
  const assignees = [...new Set(assignments.map((assignment) => assignment.assignee))];

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("shifts.title")}</h1>
        <p className="text-body text-ink-soft">{t("shifts.tagline")}</p>
      </header>
      <ShiftPlanner
        date={date}
        shifts={rows}
        assignees={assignees.length > 0 ? assignees : [t("shifts.defaultKeeper1"), t("shifts.defaultKeeper2")]}
      />
    </>
  );
}
