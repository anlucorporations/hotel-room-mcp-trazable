import { getTranslations } from "next-intl/server";
import { currentMaintenanceSession } from "@/lib/mantenimiento/session";
import { MaintenanceReports } from "@/components/maintenance/MaintenanceReports";

export const dynamic = "force-dynamic";

/** Informes de la suite (F4 · T4.1/T4.4): agregados por estado, tipo, técnico y área. */
export default async function MaintenanceReportsPage() {
  // Defensa en profundidad (M7 · H1): el payload RSC de la página no debe generarse sin sesión.
  const session = await currentMaintenanceSession();
  if (!session.ok) return null;
  const t = await getTranslations("maintenance");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("reportsTitle")}</h1>
        <p className="text-body text-ink-soft">{t("reportsTagline")}</p>
      </header>
      <MaintenanceReports />
    </>
  );
}
