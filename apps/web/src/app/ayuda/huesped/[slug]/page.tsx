import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { HUESPED_MANUALS, HUESPED_PRINTABLE } from "@/lib/help/huesped.generated";
import { groupTopics } from "@/lib/help/group-topics";
import styles from "../../manual.module.css";

/**
 * Un caso del manual del huésped, navegable por secciones (rol INTEGRADOR, 2026-10-07).
 *
 * El cuerpo llega ya convertido a HTML y escapado por `apps/web/scripts/build-huesped-manuals.mjs`
 * desde `docs/Manuales/06-huesped/<NN>-<caso>.md`; aquí solo se aporta la estructura (encabezados,
 * índice lateral, ilustración y descarga de la versión imprimible completa).
 */
export function generateStaticParams() {
  return HUESPED_MANUALS.map((manual) => ({ slug: manual.slug }));
}

export default async function HuespedManualPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("help");
  const manual = HUESPED_MANUALS.find((candidate) => candidate.slug === params.slug);
  if (!manual) notFound();

  const topics = groupTopics(manual.sections);

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10">
        <nav aria-label={t("huespedTitle")} className="text-small">
          <Link
            href="/ayuda/huesped"
            className="font-medium text-ink-soft underline transition-colors hover:text-ink"
          >
            ← {t("huespedBackToIndex")}
          </Link>
        </nav>

        <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="font-display text-h2 font-semibold tracking-tight">{manual.title}</h1>
          <a
            href={HUESPED_PRINTABLE}
            download
            aria-label={t("downloadPdfAria")}
            className="inline-flex flex-none items-center justify-center gap-2 rounded-brand border border-line bg-shell px-4 py-2 text-small font-semibold text-ink shadow-sm transition hover:bg-mist-2 focus:outline-none focus:ring-2 focus:ring-azure"
          >
            {t("huespedDownloadAll")}
          </a>
        </header>

        <div className="flex flex-col gap-10 tablet:flex-row tablet:items-start">
          <nav
            aria-label={t("sectionsLabel")}
            className="w-full flex-none rounded-brand border border-line bg-mist-2 p-4 tablet:sticky tablet:top-[88px] tablet:max-h-[calc(100vh-120px)] tablet:w-64 tablet:overflow-y-auto"
          >
            <p className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-soft">
              {t("topicsLabel")}
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-small">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <a href={`#${topic.id}`} className="font-medium text-ink hover:text-azure">
                    {topic.title}
                  </a>
                  {topic.children.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1 border-l border-line pl-3 text-ink-soft">
                      {topic.children.map((child) => (
                        <li key={child.id}>
                          <a href={`#${child.id}`} className="hover:text-ink">
                            {child.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>

          <article className={`${styles.manual} min-w-0 max-w-prose flex-1`}>
            <div dangerouslySetInnerHTML={{ __html: manual.lead }} />
            {topics.map((topic) => (
              <section key={topic.id} aria-labelledby={topic.id} className="mt-8 first:mt-0">
                <h2 id={topic.id}>{topic.title}</h2>
                <div dangerouslySetInnerHTML={{ __html: topic.html }} />
                {topic.children.map((child) => (
                  <section key={child.id} aria-labelledby={child.id}>
                    <h3 id={child.id}>{child.title}</h3>
                    <div dangerouslySetInnerHTML={{ __html: child.html }} />
                  </section>
                ))}
              </section>
            ))}

            <p className="mt-10 border-t border-line pt-4 text-small text-ink-soft">
              {t("huespedSourceNote")} <code>{manual.source}</code>
            </p>
          </article>
        </div>
      </div>
    </PublicShell>
  );
}
