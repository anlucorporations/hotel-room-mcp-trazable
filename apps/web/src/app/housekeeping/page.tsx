import { getTranslations } from "next-intl/server";
import { HousekeepingBoard } from "@/components/housekeeping/HousekeepingBoard";

export const dynamic = "force-dynamic";

/**
 * Tablero del servicio de habitaciones (F3 · D-30, D-48, D-50, D-62).
 *
 * Ruta independiente `/housekeeping` con rol `HOUSEKEEPING` sin wallet. El componente cliente exige
 * la sesion antes de leer ningun dato y se actualiza en tiempo real por SSE.
 */
export default async function HousekeepingPage() {
  const t = await getTranslations("housekeeping");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("tagline")}</p>
      </header>
      <HousekeepingBoard />
    </>
  );
}
