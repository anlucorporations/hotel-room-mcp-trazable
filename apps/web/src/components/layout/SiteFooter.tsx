import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Pie público (DISEÑO-UX §3/§4.1): marca, sello «red segura · pagos verificados»,
 * enlaces (histórico real + legales placeholder) y dirección del hotel.
 */
export function SiteFooter() {
  const t = useTranslations("shell");

  return (
    <footer className="mt-8 border-t border-line bg-sand-2">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-9 tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-soft">
          <span className="font-display font-semibold text-ink">{t("brandTitle")}</span>
          <span>{t("footerAddress")}</span>
          <span className="inline-flex items-center gap-2 rounded-pill border border-olive/30 bg-olive/10 px-3 py-1 text-micro font-semibold text-ink-soft">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-olive" />
            {t("footerTagline")}
          </span>
        </div>
        <nav aria-label={t("footerTagline")} className="flex flex-wrap gap-x-5 gap-y-2 text-small text-ink-soft">
          <Link href="/historico" className="transition-colors hover:text-ink">
            {t("footerHistory")}
          </Link>
          <a href="#" className="transition-colors hover:text-ink">
            {t("footerTerms")}
          </a>
          <a href="#" className="transition-colors hover:text-ink">
            {t("footerPrivacy")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
