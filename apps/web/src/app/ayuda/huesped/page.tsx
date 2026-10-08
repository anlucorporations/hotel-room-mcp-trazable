import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import {
  HUESPED_MANUALS,
  HUESPED_MOMENTS,
  HUESPED_OVERVIEW_IMAGE,
  HUESPED_PRINTABLE,
  type HuespedManual,
} from "@/lib/help/huesped.generated";
import styles from "../manual.module.css";

/**
 * Manual del huésped (rol INTEGRADOR del equipo de manuales, 2026-10-07): índice de los 17 casos que
 * puede solicitar un huésped, agrupados por momento del viaje.
 *
 * El contenido **no** se escribe aquí: los `.md` de `docs/Manuales/06-huesped/` son la fuente única y
 * `apps/web/scripts/build-huesped-manuals.mjs` genera `HUESPED_MANUALS` (con el texto escapado) y
 * publica las ilustraciones y la versión imprimible en `public/manual/`. El invariante lo comprueba
 * `huesped-sync.test.ts`.
 *
 * Los manuales están en español (como el resto de la ayuda); los rótulos de la interfaz se traducen.
 */

/** Tarjeta de un caso: enlace de lectura, cita inicial y acceso a la versión completa. */
function CaseCard({
  manual,
  read,
  downloadPdf,
}: {
  readonly manual: HuespedManual;
  readonly read: string;
  readonly downloadPdf: string;
}) {
  return (
    <li className="flex">
      <article className="flex w-full flex-col gap-3 rounded-brand border border-line bg-shell p-5 shadow-sm">
        <h3 className="font-display text-h3 font-semibold leading-snug">
          <Link href={`/ayuda/huesped/${manual.slug}`} className="transition-colors hover:text-azure">
            {manual.title}
          </Link>
        </h3>
        <div
          className={`${styles.manual} text-small`}
          // Cita inicial del manual, convertida a HTML por el generador (texto escapado).
          dangerouslySetInnerHTML={{ __html: manual.lead }}
        />
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <Link
            href={`/ayuda/huesped/${manual.slug}`}
            className="text-small font-semibold text-azure-deep underline transition-colors hover:text-coral-text"
          >
            {read}
          </Link>
          <a
            href={HUESPED_PRINTABLE}
            download
            className="text-small font-medium text-ink-soft underline transition-colors hover:text-ink"
          >
            {downloadPdf}
          </a>
        </div>
      </article>
    </li>
  );
}

export default async function HuespedPage() {
  const t = await getTranslations("help");

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-10">
        <header>
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("huespedTitle")}</h1>
          <p className="mt-1 text-body text-ink-soft">{t("huespedTagline")}</p>
        </header>

        <p className="rounded-brand border border-line bg-mist-2 px-4 py-3 text-small text-ink-soft">
          {t("huespedPendingNote")} {t("spanishOnly")}
        </p>

        <figure className="overflow-hidden rounded-brand border border-line bg-shell">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG de manual servido estático */}
          <img
            src={`/manual/imagenes/${HUESPED_OVERVIEW_IMAGE}`}
            alt={t("huespedMapAlt")}
            className="h-auto w-full"
          />
        </figure>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a
            href={HUESPED_PRINTABLE}
            download
            className="text-small font-semibold text-azure-deep underline transition-colors hover:text-coral-text"
          >
            {t("huespedDownloadAll")}
          </a>
          <Link
            href="/ayuda"
            className="text-small font-medium text-ink-soft underline transition-colors hover:text-ink"
          >
            {t("backToIndex")}
          </Link>
        </div>

        {HUESPED_MOMENTS.map((moment) => {
          const cases = HUESPED_MANUALS.filter((manual) => manual.moment === moment.id);
          if (cases.length === 0) return null;
          return (
            <section key={moment.id} className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-h3 font-semibold tracking-tight">{moment.label}</h2>
                <p className="mt-1 text-small text-ink-soft">
                  {t("huespedCaseCount", { count: cases.length })}
                </p>
              </div>
              <ul className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
                {cases.map((manual) => (
                  <CaseCard
                    key={manual.slug}
                    manual={manual}
                    read={t("read")}
                    downloadPdf={t("downloadPdf")}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </PublicShell>
  );
}
