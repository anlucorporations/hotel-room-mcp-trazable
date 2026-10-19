import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { currentHousekeepingSession } from "@/lib/housekeeping-suite/session";

export const dynamic = "force-dynamic";

/**
 * Cargos por daños (F6 · T6.1, ruta reservada).
 *
 * La funcionalidad completa (cargo + notificación al huésped + reclamación + resolución en
 * check-out) es el ciclo **F7**. Aquí la suite deja la entrada y el estado honesto: todavía no se
 * pueden registrar cargos; las averías se reportan desde el dashboard y las gestiona Mantenimiento.
 */
export default async function AmaDeLlavesDamagesPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("damages.title")}</h1>
        <p className="text-body text-ink-soft">{t("damages.tagline")}</p>
      </header>
      <section className="rounded-brand border border-line px-4 py-4" data-testid="damages-pending">
        <p className="text-small text-ink">{t("damages.comingSoon")}</p>
        <p className="mt-2 text-small text-ink-soft">{t("damages.reportHint")}</p>
        <Link href="/ama-de-llaves" className="mt-3 inline-flex min-h-touch items-center rounded-pill bg-azure px-4 text-small font-semibold text-shell">
          {t("damages.backToBoard")}
        </Link>
      </section>
    </>
  );
}
