import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Pie público editorial (2026-10-23): wordmark grande, contacto y tres columnas de enlaces,
 * siguiendo la distribución de la referencia Wix wh-1061. Conserva todos los destinos y el sello
 * de verificación on-chain; solo cambia la composición visual.
 */
export function SiteFooter() {
  const t = useTranslations("shell");
  const column = "flex flex-col gap-3";
  const heading = "text-micro font-bold uppercase tracking-[0.14em] text-ink-soft";
  const link = "text-small text-ink/80 transition-colors hover:text-ink";

  return (
    <footer className="border-t border-line bg-shell">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 tablet:px-8 tablet:py-20 desktop:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-[42px] font-semibold leading-none tracking-tight text-ink">
            {t("brandTitle")}
          </p>
          <p className="mt-5 max-w-[30ch] text-small leading-relaxed text-ink-soft">
            {t("footerAddress")}
          </p>
          <Link
            href="/historico"
            aria-label={t("footerSealAria")}
            className="mt-5 inline-flex items-center gap-2 rounded-pill border border-fern/30 bg-fern/10 px-3 py-1 text-micro font-semibold text-ink-soft transition-colors hover:border-fern/60 hover:text-ink"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-fern" />
            {t("footerTagline")}
          </Link>
        </div>

        <nav aria-label={t("footerExplore")} className={column}>
          <p className={heading}>{t("footerExplore")}</p>
          <Link href="/habitaciones" className={link}>{t("navRooms")}</Link>
          <Link href="/experiencias" className={link}>{t("navExperiences")}</Link>
          <Link href="/empresa" className={link}>{t("navCompany")}</Link>
          <Link href="/instalaciones" className={link}>{t("navFacilities")}</Link>
          <Link href="/reventa" className={link}>{t("navResale")}</Link>
        </nav>

        <nav aria-label={t("footerStay")} className={column}>
          <p className={heading}>{t("footerStay")}</p>
          <Link href="/mis-noches" className={link}>{t("navMyNights")}</Link>
          <Link href="/historico" className={link}>{t("footerHistory")}</Link>
          <Link href="/asistente" className={link}>{t("navAssistant")}</Link>
          <Link href="/contacto" className={link}>{t("navContact")}</Link>
          <Link href="/ayuda" className={link}>{t("footerHelp")}</Link>
        </nav>

        <nav aria-label={t("footerLegal")} className={column}>
          <p className={heading}>{t("footerLegal")}</p>
          <Link href="/terminos" className={link}>{t("footerTerms")}</Link>
          <Link href="/privacidad" className={link}>{t("footerPrivacy")}</Link>
          <Link href="/historico" className={link}>{t("footerHistory")}</Link>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-caption text-ink-soft tablet:px-8">
          <span>{t("footerCopyright")}</span>
          <span>ES · EN · RU</span>
          <span>{t("footerTagline")}</span>
        </div>
      </div>
    </footer>
  );
}
