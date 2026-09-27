import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { ReserveFlow } from "@/components/reserve/ReserveFlow";

export const dynamic = "force-dynamic";

/**
 * Reserva desde la suite pública (F6 · D-65, D-72).
 *
 * La wallet se conecta al inicio del flujo; la noche se retiene, el anticipo se paga por
 * transferencia y la liquidación se concilia al 100 %.
 */
export default async function ReservePage() {
  const t = await getTranslations("reserve");
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-medium">{t("title")}</h1>
          <p className="max-w-prose text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <ReserveFlow />
      </div>
    </PublicShell>
  );
}
