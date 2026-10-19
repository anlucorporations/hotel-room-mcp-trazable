import { getTranslations } from "next-intl/server";
import { ReceptionIncidentPanel } from "@/components/reception/ReceptionIncidentPanel";

export const dynamic = "force-dynamic";

/** Recepción reporta incidencias (F10 · T10.1): ticket a Mantenimiento sin firma on-chain (D-C37). */
export default async function ReceptionIncidentsPage() {
  const t = await getTranslations("reception");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("incidents.pageTitle")}</h1>
        <p className="text-body text-ink-soft">{t("incidents.pageTagline")}</p>
      </header>
      <ReceptionIncidentPanel />
    </>
  );
}
