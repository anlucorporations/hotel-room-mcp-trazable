import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Pie público (docs/SRS.md §7): marca, sello «red segura · pagos verificados»
 * clicable hacia el histórico público (respaldado por su verificación on-chain, UX#41),
 * enlaces (histórico + términos/privacidad reales) y dirección del hotel.
 */
export function SiteFooter() {
  const t = useTranslations("shell");

  return (
    <footer className="mt-8 border-t border-line bg-sand-2">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-9 tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-soft">
          <span className="font-display font-semibold text-ink">{t("brandTitle")}</span>
          <span>{t("footerAddress")}</span>
          <Link
            href="/historico"
            aria-label={t("footerSealAria")}
            className="inline-flex items-center gap-2 rounded-pill border border-olive/30 bg-olive/10 px-3 py-1 text-micro font-semibold text-ink-soft transition-colors hover:border-olive/60 hover:text-ink"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-olive" />
            {t("footerTagline")}
          </Link>
        </div>
        <nav aria-label={t("footerNavLabel")} className="flex flex-wrap gap-x-5 gap-y-2 text-small text-ink-soft">
          <Link href="/historico" className="transition-colors hover:text-ink">
            {t("footerHistory")}
          </Link>
          <Link href="/ayuda" className="transition-colors hover:text-ink">
            {t("footerHelp")}
          </Link>
          <Link href="/terminos" className="transition-colors hover:text-ink">
            {t("footerTerms")}
          </Link>
          <Link href="/privacidad" className="transition-colors hover:text-ink">
            {t("footerPrivacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
