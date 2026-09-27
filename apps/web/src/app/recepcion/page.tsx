import { getTranslations } from "next-intl/server";
import { ReceptionDashboard } from "@/components/reception/ReceptionDashboard";

export const dynamic = "force-dynamic";

/**
 * Puesto de recepción (incremento v2, CU-31..CU-35).
 *
 * La vista delega en `ReceptionDashboard`, que exige sesión de `RECEPTION_ROLE` o del owner (D-37)
 * antes de leer ningún dato. El `PublicShell` y la barra superior de la suite viven en el layout de
 * `/recepcion` (F2 · D-32). El encabezado de nivel 1 sigue aquí, de modo que existe en todos los
 * estados (acceso, carga y panel).
 */
export default async function ReceptionPage() {
  const t = await getTranslations("reception");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("tagline")}</p>
      </header>
      <ReceptionDashboard />
    </>
  );
}
