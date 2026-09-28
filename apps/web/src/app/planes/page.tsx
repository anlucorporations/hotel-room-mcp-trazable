import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick } from "@/lib/home-view";
import { getHomeContent } from "@/lib/home-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("plans.title"), description: t("plans.subtitle") };
}

/**
 * Página **Planes** de la suite pública (2026-09-28 · 1.1): planes informativos activos (D-69),
 * sin lógica de precios, tal como los gestiona el hotel desde el back-office.
 */
export default async function PlansPage() {
  const home = await getTranslations("home");
  const shell = await getTranslations("shell");
  const locale = await getLocale();
  const { offers } = await getHomeContent();

  return (
    <PublicShell>
      <PageHeader eyebrow={shell("navPlans")} title={home("plans.title")} lead={home("plans.subtitle")} />

      <PageSection id="plans-list" title={home("plans.title")}>
        {offers.length === 0 ? (
          <p className="text-small text-ink-soft">{home("plans.empty")}</p>
        ) : (
          <ul className="grid gap-4 tablet:grid-cols-2">
            {offers.map((offer) => (
              <li key={offer.id} className="overflow-hidden rounded-brand border border-line bg-shell">
                {offer.imageFileName && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={contentImageUrl(offer.imageFileName)}
                    alt=""
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <h3 className="font-display text-body font-semibold text-ink">
                    {pick(locale, offer.titleEs, offer.titleEn, offer.titleRu)}
                  </h3>
                  <p className="mt-1.5 text-small text-ink-soft">
                    {pick(locale, offer.bodyEs, offer.bodyEn, offer.bodyRu)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PublicShell>
  );
}
