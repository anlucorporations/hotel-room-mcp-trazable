import { getTranslations } from "next-intl/server";
import { IncidentsAdmin } from "@/components/admin/maintenance/IncidentsAdmin";

export const dynamic = "force-dynamic";

/** Supervisión de incidencias (F4 · D-52/D-53) en Administración → Mantenimiento. Solo owner. */
export default async function IncidenciasPage() {
  const t = await getTranslations("maintenance");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("incidentsAdminTitle")}</h1>
        <p className="text-body text-ink-soft">{t("incidentsAdminTagline")}</p>
      </header>
      <IncidentsAdmin />
    </div>
  );
}
