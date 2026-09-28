import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { getHotelDistribution } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("facilities");
  return { title: t("title"), description: t("lead") };
}

const COMMON_AREAS = ["reception", "breakfast", "pool", "parking"] as const;

/**
 * Página **Instalaciones** de la suite pública (petición del responsable, 2026-09-28 · 1.3).
 *
 * Explica la **distribución del hotel** (plantas y numeración) a partir del inventario real y
 * enlaza con la página de habitaciones para las características de cada tipo. La tabla usa el
 * `DataTable` del sistema (nombre accesible, `scope` de columna y de fila y región desplazable).
 */
export default async function FacilitiesPage() {
  const t = await getTranslations("facilities");
  const roomType = await getTranslations("roomType");
  const distribution = await getHotelDistribution();

  return (
    <PublicShell>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      <PageSection id="facilities-floors" title={t("floors.title")} subtitle={t("floors.body")}>
        <DataTable
          caption={t("floors.title")}
          density="comfortable"
          rows={distribution.floors}
          rowKey={(floor) => floor.key}
          emptyLabel={t("rooms.body")}
          columns={[
            {
              key: "floor",
              header: t("floors.columnFloor"),
              cell: (floor) => (floor.key === "ground" ? t("floors.ground") : t("floors.first")),
            },
            {
              key: "range",
              header: t("floors.columnRange"),
              cell: (floor) => `${floor.from}–${floor.to}`,
            },
            {
              key: "types",
              header: t("floors.columnTypes"),
              cell: (floor) =>
                floor.types.map((entry) => roomType(entry.roomType as "simple")).join(" · "),
            },
            { key: "count", header: t("floors.columnCount"), cell: (floor) => String(floor.count) },
          ]}
        />
      </PageSection>

      <PageSection id="facilities-common" title={t("common.title")} tone="band">
        <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {COMMON_AREAS.map((area) => (
            <li key={area} className="rounded-brand border border-line bg-shell p-5">
              <p className="text-small text-ink">{t(`common.${area}`)}</p>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection id="facilities-accessibility" title={t("accessibility.title")}>
        <p className="max-w-prose text-body text-ink-soft">{t("accessibility.body")}</p>
      </PageSection>

      <PageSection id="facilities-rooms" title={t("rooms.title")} tone="band">
        <p className="max-w-prose text-body text-ink-soft">{t("rooms.body")}</p>
        <p className="mt-5">
          <Link
            href="/habitaciones"
            className="inline-flex min-h-touch items-center rounded-pill bg-sea px-5 text-small font-semibold text-shell transition-colors hover:bg-sea-deep"
          >
            {t("rooms.button")}
          </Link>
        </p>
      </PageSection>

      <PageSection id="facilities-contact" title={t("contact.title")}>
        <p className="max-w-prose text-body text-ink-soft">{t("contact.body")}</p>
        <p className="mt-5">
          <Link
            href="/contacto"
            className="inline-flex min-h-touch items-center rounded-pill border border-sea px-5 text-small font-semibold text-sea transition-colors hover:bg-sea-deep hover:text-shell"
          >
            {t("contact.button")}
          </Link>
        </p>
      </PageSection>
    </PublicShell>
  );
}
