import { getTranslations } from "next-intl/server";
import { currentMaintenanceSession } from "@/lib/mantenimiento/session";
import { ValidationBoard } from "@/components/maintenance/ValidationBoard";

export const dynamic = "force-dynamic";

/** Cola de validación del jefe (F8 · T8.5): tareas cerradas por el terminal, SLA 24 h. */
export default async function MaintenanceValidationPage() {
  const session = await currentMaintenanceSession();
  if (!session.ok) return null;
  const t = await getTranslations("validaciones");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("tagline")}</p>
      </header>
      <section className="rounded-brand border border-line px-4 py-3">
        <ValidationBoard />
      </section>
    </>
  );
}
