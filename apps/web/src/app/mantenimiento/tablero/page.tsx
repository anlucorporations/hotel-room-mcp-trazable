import { getTranslations } from "next-intl/server";
import { currentMaintenanceSession } from "@/lib/mantenimiento/session";
import { MaintenanceBoard } from "@/components/maintenance/MaintenanceBoard";

export const dynamic = "force-dynamic";

/**
 * **Tablero heredado del técnico** (D-52…D-54, D-63) que antes vivía en `/mantenimiento`.
 *
 * La ruta principal pasa a ser el dashboard del jefe (F4); el tablero del día se conserva aquí para
 * el rol `MAINTENANCE` y para no romper los flujos existentes hasta que llegue el terminal de F5.
 */
export default async function MaintenanceBoardPage() {
  // Defensa en profundidad (M7 · H1): el payload RSC de la página no debe generarse sin sesión.
  const session = await currentMaintenanceSession();
  if (!session.ok) return null;
  const t = await getTranslations("maintenance");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("boardTitle")}</h1>
        <p className="text-body text-ink-soft">{t("tagline")}</p>
      </header>
      <MaintenanceBoard />
    </>
  );
}
