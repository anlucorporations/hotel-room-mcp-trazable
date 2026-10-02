import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { MANUALS, type ManualDoc } from "@/lib/help/manuals.generated";
import styles from "./manual.module.css";

/**
 * Sección de Ayuda (M9, D-14/D-17): índice de los manuales del sistema.
 *
 * El contenido **no** se escribe aquí: los `.md` de `docs/` son la fuente única y
 * `apps/web/scripts/build-manuals.mjs` genera `MANUALS` (y los PDF de `docs/pdf/`) a partir de
 * ellos. Así la ayuda que ve el usuario, el PDF descargable y el manual del repositorio no pueden
 * divergir; el invariante lo comprueba `manuals-sync.test.ts`.
 *
 * El índice tiene dos partes: los **tres manuales generales** (cliente, comprador, recepción) y los
 * **32 manuales por caso de uso**, agrupados por el bloque de iniciación del sistema (CU-16 roles →
 * CU-46 seguridad). La agrupación la aporta `ManualDoc.group`/`ManualDoc.block`, generados desde el
 * orden de `docs/Manuales/05-casos-de-uso/**`.
 *
 * Los manuales están en español (el idioma en que se escribieron y se entregan al hotel); los
 * rótulos de la interfaz sí se traducen con el resto de la web.
 */

/** Tarjeta de un manual: enlace de lectura, cita inicial e infografía, y descarga del PDF. */
function ManualCard({
  manual,
  read,
  downloadPdf,
}: {
  readonly manual: ManualDoc;
  readonly read: string;
  readonly downloadPdf: string;
}) {
  return (
    <li className="flex">
      <article className="flex w-full flex-col gap-3 rounded-brand border border-line bg-shell p-5 shadow-sm">
        <h3 className="font-display text-h3 font-semibold leading-snug">
          <Link href={`/ayuda/${manual.slug}`} className="transition-colors hover:text-azure">
            {manual.title}
          </Link>
        </h3>
        <div
          className={`${styles.manual} text-small`}
          // Cita inicial del manual, ya convertida a HTML por el generador (contenido propio).
          dangerouslySetInnerHTML={{ __html: manual.lead }}
        />
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <Link
            href={`/ayuda/${manual.slug}`}
            className="text-small font-semibold text-azure-deep underline transition-colors hover:text-coral-text"
          >
            {read}
          </Link>
          <a
            href={manual.pdf}
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

export default async function AyudaPage() {
  const t = await getTranslations("help");

  const general = MANUALS.filter((manual) => manual.group === "general");
  const cases = MANUALS.filter((manual) => manual.group === "casos-de-uso");

  // Agrupa los casos de uso por bloque conservando el orden de iniciación de `MANUALS`.
  const blocks: Array<{ block: string; manuals: ManualDoc[] }> = [];
  for (const manual of cases) {
    const block = manual.block ?? "";
    const last = blocks[blocks.length - 1];
    if (last && last.block === block) last.manuals.push(manual);
    else blocks.push({ block, manuals: [manual] });
  }

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-10">
        <header>
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-body text-ink-soft">{t("tagline")}</p>
        </header>

        <p className="rounded-brand border border-line bg-mist-2 px-4 py-3 text-small text-ink-soft">
          {t("testNetworkNote")} {t("spanishOnly")}
        </p>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="font-display text-h3 font-semibold tracking-tight">{t("generalTitle")}</h2>
            <p className="mt-1 text-small text-ink-soft">{t("generalTagline")}</p>
          </div>
          <nav aria-label={t("generalTitle")}>
            <ul className="grid gap-5 tablet:grid-cols-3">
              {general.map((manual) => (
                <ManualCard
                  key={manual.slug}
                  manual={manual}
                  read={t("read")}
                  downloadPdf={t("downloadPdf")}
                />
              ))}
            </ul>
          </nav>
        </section>

        <section className="flex flex-col gap-8">
          <div>
            <h2 className="font-display text-h3 font-semibold tracking-tight">{t("cuTitle")}</h2>
            <p className="mt-1 text-small text-ink-soft">{t("cuTagline")}</p>
          </div>

          <figure className="overflow-hidden rounded-brand border border-line bg-mist-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG de manual servido estático */}
            <img
              src="/manual/imagenes/doc-mapa-iniciacion-sistema.svg"
              alt={t("mapAlt")}
              className="h-auto w-full"
            />
          </figure>

          {blocks.map((group) => (
            <div key={group.block} className="flex flex-col gap-4">
              <h3 className="font-display text-h4 font-semibold tracking-tight text-azure-deep">
                {group.block}
              </h3>
              <nav aria-label={group.block}>
                <ul className="grid gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
                  {group.manuals.map((manual) => (
                    <ManualCard
                      key={manual.slug}
                      manual={manual}
                      read={t("read")}
                      downloadPdf={t("downloadPdf")}
                    />
                  ))}
                </ul>
              </nav>
            </div>
          ))}
        </section>
      </div>
    </PublicShell>
  );
}
