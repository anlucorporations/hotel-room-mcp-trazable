import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { MANUALS } from "@/lib/help/manuals.generated";
import styles from "./manual.module.css";

/**
 * Sección de Ayuda (M9, D-14/D-17): índice de los manuales del sistema.
 *
 * El contenido **no** se escribe aquí: `docs/manual-*.md` es la fuente única y
 * `apps/web/scripts/build-manuals.mjs` genera `MANUALS` (y los PDF de `docs/pdf/`) a partir de
 * ella. Así la ayuda que ve el usuario, el PDF descargable y el manual del repositorio no pueden
 * divergir; el invariante lo comprueba `manuals-sync.test.ts`.
 *
 * Los manuales están en español (el idioma en que se escribieron y se entregan al hotel); los
 * rótulos de la interfaz sí se traducen con el resto de la web.
 */
export default async function AyudaPage() {
  const t = await getTranslations("help");

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-10">
        <header>
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-body text-ink-soft">{t("tagline")}</p>
        </header>

        <p className="rounded-brand border border-line bg-sand-2 px-4 py-3 text-small text-ink-soft">
          {t("testNetworkNote")} {t("spanishOnly")}
        </p>

        <nav aria-label={t("manualsLabel")}>
          <ul className="grid gap-5 tablet:grid-cols-3">
            {MANUALS.map((manual) => (
              <li key={manual.slug} className="flex">
                <article className="flex w-full flex-col gap-3 rounded-brand border border-line bg-shell p-5 shadow-sm">
                  <h2 className="font-display text-h3 font-semibold leading-snug">
                    <Link href={`/ayuda/${manual.slug}`} className="transition-colors hover:text-sea">
                      {manual.title}
                    </Link>
                  </h2>
                  <div
                    className={`${styles.manual} text-small`}
                    // Cita inicial del manual, ya convertida a HTML por el generador (contenido propio).
                    dangerouslySetInnerHTML={{ __html: manual.lead }}
                  />
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    <Link
                      href={`/ayuda/${manual.slug}`}
                      className="text-small font-semibold text-sea-deep underline transition-colors hover:text-terracotta-text"
                    >
                      {t("read")}
                    </Link>
                    <a
                      href={manual.pdf}
                      download
                      className="text-small font-medium text-ink-soft underline transition-colors hover:text-ink"
                    >
                      {t("downloadPdf")}
                    </a>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </PublicShell>
  );
}
