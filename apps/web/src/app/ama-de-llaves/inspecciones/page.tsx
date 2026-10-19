import { getTranslations } from "next-intl/server";
import {
  HousekeepingRepository,
  INSPECTION_REQUIRES_SIGNATURE_KEY,
  SettingsRepository,
  requiresInspectionSignature,
} from "@hotel/shared";
import { defaultBoardDate } from "@/lib/housekeeping-board";
import { canInspectAs, currentHousekeepingSession } from "@/lib/housekeeping-suite/session";
import { fetchRoomStateBoard } from "@/lib/housekeeping-state";
import { InspectionPanel } from "@/components/housekeeping/InspectionPanel";
import type { InspectionDto } from "@/lib/housekeeping-suite/types";

export const dynamic = "force-dynamic";

/** Inspección y certificación (F6 · T6.1/T6.4/T6.6, CU-V-21/22). */
export default async function AmaDeLlavesInspectionsPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  const repo = new HousekeepingRepository();
  const settings = new SettingsRepository();
  const date = defaultBoardDate();
  const [board, inspections, flag] = await Promise.all([
    fetchRoomStateBoard(date),
    repo.listInspections().catch(() => []),
    settings.get(INSPECTION_REQUIRES_SIGNATURE_KEY).catch(() => null),
  ]);
  const rows: InspectionDto[] = inspections.map((inspection) => ({
    id: inspection.id,
    roomId: inspection.roomId,
    assignmentId: inspection.assignmentId,
    inspectedBy: inspection.inspectedBy,
    inspectionType: inspection.inspectionType,
    result: inspection.result,
    observations: inspection.observations,
    signatureId: inspection.signatureId,
    createdAt: inspection.createdAt.toISOString(),
  }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("inspections.title")}</h1>
        <p className="text-body text-ink-soft">{t("inspections.tagline")}</p>
      </header>
      <InspectionPanel
        rooms={board.rooms}
        inspections={rows}
        signatureRequired={requiresInspectionSignature(flag)}
        canInspect={canInspectAs(session.session.role)}
      />
    </>
  );
}
