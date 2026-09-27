import { getTranslations } from "next-intl/server";
import { SuppliesAdmin } from "@/components/admin/housekeeping/SuppliesAdmin";

export const dynamic = "force-dynamic";

/**
 * Panel de Lencería (F3 · D-51, D-64) dentro de Administración → Housekeeping.
 *
 * Muestra existencias y umbral crítico, resalta lo que está bajo umbral y permite reponer. Solo owner.
 */
export default async function LenceriaPage() {
  const t = await getTranslations("supplies");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("tagline")}</p>
      </header>
      <SuppliesAdmin />
    </div>
  );
}
