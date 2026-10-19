import { getTranslations } from "next-intl/server";
import { DamageClaimsPanel } from "@/components/reception/DamageClaimsPanel";

export const dynamic = "force-dynamic";

/** Reclamaciones de daños en recepción (F7 · T7.5): resolver aceptando (folio) o rechazando. */
export default async function ReceptionDamagesPage() {
  const t = await getTranslations("damages");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("receptionTitle")}</h1>
        <p className="text-body text-ink-soft">{t("receptionTagline")}</p>
      </header>
      <DamageClaimsPanel />
    </>
  );
}
