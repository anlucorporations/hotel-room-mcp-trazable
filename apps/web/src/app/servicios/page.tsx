import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("services");
  return { title: t("title"), description: t("lead") };
}

/** Los seis servicios de la casa: se leen del mismo catálogo que la home (una sola fuente). */
const SERVICES = ["wifi", "breakfast", "pool", "spa", "parking", "beach"] as const;
const STAY = ["activities", "reception", "languages", "help"] as const;

/**
 * Página **Servicios** de la suite pública (petición del responsable, 2026-09-28 · 1.1).
 *
 * Amplía la banda de servicios de la home: los seis servicios con su descripción (claves
 * compartidas con la home, sin duplicar textos) y lo que incluye cualquier estancia.
 */
export default async function ServicesPage() {
  const t = await getTranslations("services");
  const home = await getTranslations("home");

  return (
    <PublicShell>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      <PageSection id="services-list" title={home("services.title")} subtitle={home("services.subtitle")}>
        <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {SERVICES.map((key) => (
            <li key={key} className="rounded-brand border border-line bg-shell p-5">
              <h3 className="font-display text-body font-semibold text-ink">
                {home(`services.items.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-small text-ink-soft">{home(`services.items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection id="services-stay" title={t("stay.title")} tone="band">
        <ul className="grid gap-3 tablet:grid-cols-2">
          {STAY.map((key) => (
            <li key={key} className="flex gap-2 rounded-brand border border-line bg-shell p-4 text-small text-ink">
              <span aria-hidden="true" className="text-azure-deep">
                ·
              </span>
              {t(`stay.${key}`)}
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection id="services-help" title={t("help.title")} subtitle={t("help.body")}>
        <p>
          <Link
            href="/ayuda"
            className="inline-flex min-h-touch items-center rounded-pill bg-azure px-5 text-small font-semibold text-shell transition-colors hover:bg-azure-deep"
          >
            {t("help.button")}
          </Link>
        </p>
      </PageSection>
    </PublicShell>
  );
}
