import { useTranslations } from "next-intl";

/**
 * Hero editorial de la home (docs/SRS.md §7): eyebrow en terracota, titular en serif
 * con la palabra «Mediterráneo» en teal y subcopy en tono secundario. Mobile-first.
 *
 * El `<h1>` conserva «Hotel Marina del Sol» (sr-only) como título del documento por
 * accesibilidad/SEO, manteniendo visible la frase editorial.
 */
export function Hero() {
  const t = useTranslations("hero");

  return (
    <section aria-labelledby="hero-title" className="relative px-5 pb-7 pt-12 desktop:pb-8 desktop:pt-16">
      <div className="mx-auto w-full max-w-6xl">
        <svg
          aria-hidden="true"
          viewBox="0 0 200 60"
          className="absolute right-0 top-10 hidden w-56 text-sea opacity-50 tablet:block"
          fill="none"
        >
          <path
            d="M0 30 Q 25 8 50 30 T 100 30 T 150 30 T 200 30"
            stroke="currentColor"
            strokeWidth="2.5"
            opacity="0.5"
          />
          <path
            d="M0 44 Q 25 22 50 44 T 100 44 T 150 44 T 200 44"
            stroke="currentColor"
            strokeWidth="2.5"
            opacity="0.3"
          />
        </svg>

        <p className="mb-3.5 text-micro font-bold uppercase tracking-[0.18em] text-terracotta-text">
          {t("eyebrow")}
        </p>
        <h1 id="hero-title" className="max-w-[16ch] font-display text-h1 font-medium">
          <span className="sr-only">Hotel Marina del Sol — </span>
          {t("titleLead")} <em className="not-italic text-sea">{t("titleHighlight")}</em>
          {t("titleTail")}
        </h1>
        <p className="mt-4 max-w-prose text-body text-ink-soft">{t("subcopy")}</p>
      </div>
    </section>
  );
}
