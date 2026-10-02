import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";
import { TestimonialCard } from "@/components/home/TestimonialCard";
import { getPublicReviews } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("reviews.title"), description: t("reviews.subtitle") };
}

/**
 * Página **Reseñas** de la suite pública (2026-09-28 · 1.1).
 *
 * La home enseña tres como resumen; aquí está el listado completo de reseñas **aprobadas** (D-58:
 * la moderación es previa) con la nota media. Si no hay ninguna, la página lo declara.
 */
export default async function ReviewsPage() {
  const home = await getTranslations("home");
  const shell = await getTranslations("shell");
  const { reviews, summary } = await getPublicReviews();

  return (
    <PublicShell>
      <PageHeader
        eyebrow={shell("navReviews")}
        title={home("reviews.title")}
        lead={home("reviews.subtitle")}
      >
        {summary.average !== null && (
          <p
            className="mt-4 font-display text-h3 font-semibold text-azure-deep"
            data-testid="reviews-average"
          >
            {home("reviews.average", {
              average: summary.average.toFixed(2),
              count: summary.count,
            })}
          </p>
        )}
      </PageHeader>

      <PageSection id="reviews-list" title={home("reviews.title")}>
        {reviews.length === 0 ? (
          <p className="text-small text-ink-soft">{home("reviews.empty")}</p>
        ) : (
          <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {reviews.map((review) => (
              <TestimonialCard key={review.id} review={review} />
            ))}
          </ul>
        )}
      </PageSection>
    </PublicShell>
  );
}
