import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { SuiteCard } from "@/components/home/SuiteCard";
import { getRoomTypeOverview } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roomsGuide");
  return { title: t("title"), description: t("lead") };
}

const BUYING_STEPS = ["step1", "step2", "step3"] as const;

/**
 * Página **Habitaciones** de la suite pública (petición del responsable, 2026-09-28 · 1.1 y 1.3).
 *
 * Amplía la sección de estilos de la home con los **tres tipos**, sus rangos reales de capacidad y
 * superficie (calculados del inventario) y una ficha de muestra de cada tipo con su foto. Cuando no
 * hay fichas publicadas, la página lo dice en lugar de mostrar tarjetas vacías.
 */
export default async function RoomsPage() {
  const locale = await getLocale();
  const t = await getTranslations("roomsGuide");
  const roomType = await getTranslations("roomType");
  const overview = await getRoomTypeOverview();

  return (
    <PublicShell>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      <PageSection id="rooms-types" title={t("types.title")}>
        {overview.length === 0 ? (
          <p className="text-small text-ink-soft">{t("types.empty")}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {overview.map((entry) => (
              <div key={entry.roomType} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="font-display text-h3 font-medium text-ink">
                    {roomType(entry.roomType)}
                  </h3>
                  <p className="text-small text-ink-soft">
                    {t("types.count", { count: entry.count })} ·{" "}
                    {t("types.capacityRange", { min: entry.capacityMin, max: entry.capacityMax })}
                    {entry.sizeMin !== null && entry.sizeMax !== null && (
                      <> · {t("types.sizeRange", { min: entry.sizeMin, max: entry.sizeMax })}</>
                    )}
                  </p>
                </div>
                {entry.sample ? (
                  <ul className="flex flex-col gap-5">
                    <SuiteCard suite={entry.sample} locale={locale} />
                  </ul>
                ) : (
                  <p className="text-small text-ink-soft">{t("types.empty")}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection id="rooms-buying" title={t("buying.title")} tone="band">
        <ol className="grid gap-4 tablet:grid-cols-3">
          {BUYING_STEPS.map((step, index) => (
            <li key={step} className="rounded-brand border border-line bg-shell p-5">
              <p className="text-micro font-bold uppercase tracking-[0.14em] text-terracotta-text">
                {index + 1}
              </p>
              <p className="mt-2 text-small text-ink">{t(`buying.${step}`)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/catalogo"
            className="inline-flex min-h-touch items-center rounded-pill bg-sea px-5 text-small font-semibold text-shell transition-colors hover:bg-sea-deep"
          >
            {t("cta")}
          </Link>
          <Link
            href="/ayuda"
            className="inline-flex min-h-touch items-center rounded-pill border border-sea px-5 text-small font-semibold text-sea transition-colors hover:bg-sea-deep hover:text-shell"
          >
            {t("help")}
          </Link>
        </div>
      </PageSection>
    </PublicShell>
  );
}
