import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { ReceptionDashboard } from "@/components/reception/ReceptionDashboard";

export const dynamic = "force-dynamic";

/**
 * Puesto de recepción (incremento v2, CU-31..CU-35).
 *
 * La vista delega en `ReceptionDashboard`, que exige sesión de `RECEPTION_ROLE` o del owner (D-37)
 * antes de leer ningún dato. Sustituye a la pantalla pública que solo tenía el check-in por QR.
 * El encabezado de nivel 1 vive aquí, de modo que existe en todos los estados (acceso, carga y panel).
 */
export default async function ReceptionPage() {
  const t = await getTranslations("reception");
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <ReceptionDashboard />
      </div>
    </PublicShell>
  );
}
