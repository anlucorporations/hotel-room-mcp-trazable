import { getTranslations } from "next-intl/server";
import { PreventiveAdmin } from "@/components/admin/maintenance/PreventiveAdmin";

export const dynamic = "force-dynamic";

/** Mantenimiento preventivo (F4 · D-54) en Administración → Mantenimiento. Solo owner. */
export default async function PreventivoPage() {
  const t = await getTranslations("maintenance");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("preventiveTitle")}</h1>
        <p className="text-body text-ink-soft">{t("preventiveTagline")}</p>
      </header>
      <PreventiveAdmin />
    </div>
  );
}
