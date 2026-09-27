import { getTranslations } from "next-intl/server";
import { ReservationsAdmin } from "@/components/reception/ReservationsAdmin";

export const dynamic = "force-dynamic";

/** Motor de reservas del Front Office (F2 · D-34…D-43). Anida en `/recepcion` (D-32). */
export default async function ReservationsPage() {
  const t = await getTranslations("reception");
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">
          {t("reservationsPageTitle")}
        </h1>
        <p className="text-body text-ink-soft">{t("reservationsPageTagline")}</p>
      </header>
      <ReservationsAdmin />
    </section>
  );
}
