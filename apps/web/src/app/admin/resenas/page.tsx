import { getTranslations } from "next-intl/server";
import { ReviewsModeration } from "@/components/admin/reviews/ReviewsModeration";

export const dynamic = "force-dynamic";

/** Moderación de reseñas (F6 · D-58) — solo owner. */
export default async function ResenasPage() {
  const t = await getTranslations("reviews");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("adminTitle")}</h1>
        <p className="text-body text-ink-soft">{t("adminTagline")}</p>
      </header>
      <ReviewsModeration />
    </div>
  );
}
