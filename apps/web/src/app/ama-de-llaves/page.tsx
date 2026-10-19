import { getTranslations } from "next-intl/server";
import { HousekeepingRepository } from "@hotel/shared";
import { defaultBoardDate } from "@/lib/housekeeping-board";
import { currentHousekeepingSession, canReportIncidentsAs } from "@/lib/housekeeping-suite/session";
import { fetchRoomStateBoard } from "@/lib/housekeeping-state";
import { RoomStateBoard } from "@/components/housekeeping/RoomStateBoard";
import { ReportIncidentFromHousekeeping } from "@/components/housekeeping/ReportIncidentFromHousekeeping";

export const dynamic = "force-dynamic";

/** Dashboard de la **Suite Ama de llaves** (F6 · T6.1/T6.2): tablero operativo en vivo y reporte. */
export default async function AmaDeLlavesPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  const repo = new HousekeepingRepository();
  const date = defaultBoardDate();
  const [board, inspections] = await Promise.all([
    fetchRoomStateBoard(date),
    repo.listInspections().catch(() => []),
  ]);
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("dashboardTagline")}</p>
        <p className="text-micro text-ink-soft">
          {t("dashboardInspectionCount", { count: inspections.length })}
        </p>
      </header>
      <RoomStateBoard initial={board} />
      <ReportIncidentFromHousekeeping rooms={board.rooms} canReport={canReportIncidentsAs(session.session.role)} />
    </>
  );
}
