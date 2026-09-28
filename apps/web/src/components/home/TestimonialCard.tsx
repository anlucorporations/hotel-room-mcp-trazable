import { getTranslations } from "next-intl/server";
import type { HomeReview } from "@/lib/home-view";
import { Stars } from "./Stars";

/**
 * Tarjeta de **testimonio** (reseñas de la home · propuesta de imagen visual §3.7 · Fase C).
 *
 * Solo llegan reseñas **`APPROVED`** (D-58: la moderación es previa), así que la tarjeta no necesita
 * estados intermedios. La nota va como **imagen con nombre accesible** (`Stars`), nunca como color
 * suelto, y la cita se destaca con la serif editorial.
 */
export async function TestimonialCard({ review }: { review: HomeReview }) {
  const t = await getTranslations("home");
  const roomType = await getTranslations("roomType");

  return (
    <li className="flex flex-col gap-3 rounded-brand border border-line bg-shell p-5">
      <Stars rating={review.rating} label={t("reviews.ratingLabel", { rating: review.rating })} />
      {review.comment && (
        <blockquote className="font-display text-body-lg leading-snug text-ink">
          “{review.comment}”
        </blockquote>
      )}
      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-soft">
        <span className="font-semibold text-ink">{roomType(review.roomType)}</span>
        <span aria-hidden="true">·</span>
        <span>{t("reviews.verified")}</span>
      </footer>
    </li>
  );
}
