import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick, type HomeImage } from "@/lib/home-view";

/**
 * `Hero` editorial de la home (propuesta de imagen visual §3.8 · Fase C).
 *
 * Registro nuevo del sistema: **foto a sangre con velo marino** (`bg-ocean/65`) y texto en arena.
 * El velo es lo que hace legible el titular sobre **cualquier** fotografía: al 65 % el compuesto
 * da 4,93:1 con texto blanco (y 4,57:1 con arena) medido con `scripts/design/contrast-audit.mjs`;
 * al 55 % se quedaba en 3,52:1, que solo vale para texto grande.
 *
 * Sin portada en la BD el hero **no desaparece**: cae al marino plano (`bg-ocean`), que también
 * cumple AA/AAA. La imagen se carga **sin** `loading="lazy"` porque es el LCP de la página.
 */
export async function Hero({ image, locale }: { image: HomeImage | null; locale: string }) {
  const t = await getTranslations("home");
  const alt = image === null ? "" : pick(locale, image.altEs, image.altEn, image.altRu);

  return (
    <section aria-labelledby="home-hero" className="relative isolate overflow-hidden bg-ocean">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={contentImageUrl(image.fileName)}
          alt={alt}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
      )}

      <div className="relative bg-ocean/65 px-5 pb-14 pt-14 text-shell tablet:pb-20 tablet:pt-20">
        <div className="mx-auto w-full max-w-6xl">
          <p className="mb-3.5 text-micro font-bold uppercase tracking-[0.18em] text-champagne">
            {t("eyebrow")}
          </p>
          <h1 id="home-hero" className="max-w-[18ch] font-display text-h1 font-medium text-shell">
            {t("titleLead")} <em className="not-italic text-champagne">{t("titleHighlight")}</em>
            {t("titleTail")}
          </h1>
          <p className="mt-4 max-w-prose text-body-lg text-sand">{t("subcopy")}</p>
          <p className="mt-3 max-w-prose text-small text-sand/90">{t("category")}</p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/reservar"
              className="inline-flex min-h-touch items-center rounded-pill bg-terracotta px-5 text-small font-semibold text-shell transition-colors hover:bg-terracotta-text"
            >
              {t("ctaReserve")}
            </Link>
            <Link
              href="/catalogo"
              className="inline-flex min-h-touch items-center rounded-pill bg-shell px-5 text-small font-semibold text-sea-deep transition-colors hover:bg-sand-2"
            >
              {t("ctaCatalog")}
            </Link>
            <Link
              href="#contacto"
              className="inline-flex min-h-touch items-center rounded-pill border border-champagne px-5 text-small font-semibold text-shell transition-colors hover:bg-ocean-soft"
            >
              {t("ctaContact")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
