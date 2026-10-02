import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { getHotelDistribution } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("company");
  return { title: t("title"), description: t("lead") };
}

const VALUES = ["direct", "privacy", "transparent", "local"] as const;

/**
 * Página **Empresa** de la suite pública (petición del responsable, 2026-09-28 · 1.3).
 *
 * Explica quién es el hotel y cómo trabaja, con las cifras tomadas del **maestro real** de
 * habitaciones (`getHotelDistribution`), no escritas a mano: si mañana cambia el inventario, la
 * página sigue diciendo la verdad.
 */
export default async function CompanyPage() {
  const t = await getTranslations("company");
  const distribution = await getHotelDistribution();

  const facts = [
    { value: String(distribution.totalRooms), label: t("facts.rooms") },
    { value: String(distribution.floors.length), label: t("facts.floors") },
    { value: String(distribution.byType.length), label: t("facts.types") },
    { value: "3", label: t("facts.languages") },
  ];

  return (
    <PublicShell>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      <PageSection id="company-story" title={t("story.title")}>
        <p className="max-w-prose text-body text-ink-soft">{t("story.body")}</p>
      </PageSection>

      <PageSection id="company-values" title={t("values.title")} tone="band">
        <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {VALUES.map((value) => (
            <li key={value} className="rounded-brand border border-line bg-shell p-5">
              <h3 className="font-display text-body font-semibold text-ink">
                {t(`values.${value}.title`)}
              </h3>
              <p className="mt-1.5 text-small text-ink-soft">{t(`values.${value}.body`)}</p>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection id="company-facts" title={t("facts.title")}>
        <dl className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-brand border border-line bg-mist-2/60 p-5">
              <dt className="text-small text-ink-soft">{fact.label}</dt>
              <dd className="mt-1 font-display text-h2 font-semibold text-azure-deep">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </PageSection>

      <PageSection id="company-cta" title={t("cta.title")} tone="band">
        <p className="max-w-prose text-body text-ink-soft">{t("cta.body")}</p>
        <p className="mt-5">
          <Link
            href="/catalogo"
            className="inline-flex min-h-touch items-center rounded-pill bg-azure px-5 text-small font-semibold text-shell transition-colors hover:bg-azure-deep"
          >
            {t("cta.button")}
          </Link>
        </p>
      </PageSection>
    </PublicShell>
  );
}
