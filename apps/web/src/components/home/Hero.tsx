import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick, type HomeImage } from "@/lib/home-view";

/**
 * `Hero` editorial de la home (propuesta de imagen visual §3.8 · Fase C).
 *
 * Distribución editorial (2026-10-23): **foto a sangre, velo navy al 70 %** y titular serif centrado,
 * con scrim superior para la cabecera. El velo garantiza la lectura sobre cualquier fotografía:
 * blanco sobre el compuesto al 70 % da 5,74:1 (medido en `RepoTecnico/propuestas_v3_identidad/`);
 * por debajo del 70 % no se usa.
 *
 * Sin portada en la BD el hero **no desaparece**: cae al marino plano (`bg-navy`), que también
 * cumple AA/AAA. La imagen se carga **sin** `loading="lazy"` porque es el LCP de la página.
 */
export async function Hero({ image, locale }: { image: HomeImage | null; locale: string }) {
  const t = await getTranslations("home");
  const alt = image === null ? "" : pick(locale, image.altEs, image.altEn, image.altRu);
  // Fallback de marca: si la BD aún no tiene portada (primer arranque, entorno degradado), el hero
  // usa una fotografía del hotel servida desde el propio origen en vez de quedarse en navy plano.
  const src = image === null ? "/images/hero-fallback.jpg" : contentImageUrl(image.fileName);

  return (
    <section aria-labelledby="home-hero" className="relative isolate overflow-hidden bg-navy">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
      />
      {/* Velo medido (70 % navy): blanco sobre el compuesto = 5,74:1. No se baja del 70 %. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-navy/70" />
      {/* Scrim superior: garantiza la lectura de la cabecera sobre cualquier fotografía. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-52 bg-gradient-to-b from-navy/80 via-navy/40 to-transparent"
      />

      <div className="relative mx-auto flex min-h-[660px] w-full max-w-5xl flex-col items-center justify-center px-5 pb-24 pt-32 text-center text-shell tablet:min-h-[78vh] tablet:pt-36">
        <p className="text-micro font-bold uppercase tracking-[0.2em] text-mist">{t("eyebrow")}</p>
        <h1
          id="home-hero"
          className="mt-5 max-w-[20ch] text-balance font-display text-display font-semibold leading-[0.98] tracking-tight text-shell"
        >
          {t("titleLead")}{" "}
          <em className="italic text-mist">{t("titleHighlight")}</em>
          {t("titleTail")}
        </h1>
        <p className="mt-6 max-w-prose text-body-lg leading-relaxed text-mist">{t("subcopy")}</p>
        <p className="mt-3 text-small text-mist">{t("category")}</p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/reservar"
            className="inline-flex min-h-touch items-center rounded-pill bg-shell px-6 text-small font-semibold text-ink transition-colors hover:bg-mist-2"
          >
            {t("ctaReserve")}
          </Link>
          <Link
            href="/catalogo"
            className="inline-flex min-h-touch items-center rounded-pill border border-shell/60 px-6 text-small font-semibold text-shell transition-colors hover:bg-navy-soft"
          >
            {t("ctaCatalog")}
          </Link>
          <Link
            href="#contacto"
            className="inline-flex min-h-touch items-center px-3 text-small font-semibold text-mist underline decoration-mist/50 underline-offset-4 transition-colors hover:text-shell"
          >
            {t("ctaContact")}
          </Link>
        </div>
      </div>
    </section>
  );
}
