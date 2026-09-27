import { getTranslations } from "next-intl/server";
import { ActivitiesAdmin } from "@/components/admin/activities/ActivitiesAdmin";

export const dynamic = "force-dynamic";

/** Administración del catálogo de actividades (F5 · D-44) — solo owner. */
export default async function ActividadesPage() {
  const t = await getTranslations("activities");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("adminTitle")}</h1>
        <p className="text-body text-ink-soft">{t("adminTagline")}</p>
      </header>
      <ActivitiesAdmin />
    </div>
  );
}
