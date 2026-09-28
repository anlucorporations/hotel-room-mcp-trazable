import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { ExperienceCard } from "@/components/home/ExperienceCard";
import { getHomeContent } from "@/lib/home-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("experience.title"), description: t("experience.subtitle") };
}

/**
 * Página **Experiencias** de la suite pública (2026-09-28 · 1.1).
 *
 * Amplía la galería de la home con **todas** las imágenes de la sección `EXPERIENCE` de
 * `hotel_images` (la home enseña seis). Cada imagen lleva su texto alternativo como pie.
 */
export default async function ExperiencesPage() {
  const home = await getTranslations("home");
  const shell = await getTranslations("shell");
  const locale = await getLocale();
  const content = await getHomeContent();

  return (
    <PublicShell>
      <PageHeader
        eyebrow={shell("navExperiences")}
        title={home("experience.title")}
        lead={home("experience.subtitle")}
      />

      <PageSection id="experiences-gallery" title={home("experience.title")}>
        {content.gallery.length === 0 ? (
          <p className="text-small text-ink-soft">{home("experience.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-3">
            {content.gallery.map((image) => (
              <ExperienceCard
                key={image.id}
                locale={locale}
                image={{
                  fileName: image.fileName,
                  altEs: image.altTextEs,
                  altEn: image.altTextEn,
                  altRu: image.altTextRu,
                }}
              />
            ))}
          </ul>
        )}
      </PageSection>
    </PublicShell>
  );
}
