import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { pick } from "@/lib/home-view";
import { getHomeContent } from "@/lib/home-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("activities.title"), description: t("activities.subtitle") };
}

/** Página **Actividades** de la suite pública (2026-09-28 · 1.1): catálogo activo con su precio. */
export default async function ActivitiesPage() {
  const home = await getTranslations("home");
  const shell = await getTranslations("shell");
  const locale = await getLocale();
  const { activities } = await getHomeContent();

  return (
    <PublicShell>
      <PageHeader
        eyebrow={shell("navActivities")}
        title={home("activities.title")}
        lead={home("activities.subtitle")}
      />

      <PageSection id="activities-list" title={home("activities.title")}>
        {activities.length === 0 ? (
          <p className="text-small text-ink-soft">{home("activities.empty")}</p>
        ) : (
          <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {activities.map((activity) => (
              <li key={activity.id} className="rounded-brand border border-line bg-shell p-5">
                <h3 className="font-display text-body font-semibold text-ink">
                  {pick(locale, activity.nameEs, activity.nameEn, activity.nameRu)}
                </h3>
                <p className="mt-1.5 text-small text-ink-soft">
                  {pick(locale, activity.descriptionEs, activity.descriptionEn, activity.descriptionRu)}
                </p>
                {activity.priceCents > 0 && (
                  <p className="mt-2 text-small font-semibold text-azure-deep">
                    {home("activities.price", {
                      price: (activity.priceCents / 100).toFixed(2),
                      currency: activity.currency,
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PublicShell>
  );
}
