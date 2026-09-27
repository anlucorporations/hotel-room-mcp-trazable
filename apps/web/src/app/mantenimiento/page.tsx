import { getTranslations } from "next-intl/server";
import { MaintenanceBoard } from "@/components/maintenance/MaintenanceBoard";

export const dynamic = "force-dynamic";

/**
 * Tablero del técnico de mantenimiento (F4 · D-52…D-54, D-63).
 *
 * Ruta independiente `/mantenimiento` con rol `MAINTENANCE` sin wallet. El componente cliente exige
 * la sesión antes de leer ningún dato.
 */
export default async function MaintenancePage() {
  const t = await getTranslations("maintenance");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("tagline")}</p>
      </header>
      <MaintenanceBoard />
    </>
  );
}
