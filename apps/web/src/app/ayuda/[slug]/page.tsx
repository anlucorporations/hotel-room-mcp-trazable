import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { MANUALS, type ManualSection } from "@/lib/help/manuals.generated";
import styles from "../manual.module.css";

/**
 * Manual navegable por temas → secciones → sub-secciones (M9, D-14/D-17).
 *
 * El cuerpo de cada sección llega ya convertido a HTML desde `docs/manual-*.md` por
 * `apps/web/scripts/build-manuals.mjs`; aquí solo se aporta la estructura (encabezados, índice
 * lateral y descarga del PDF), de modo que el manual del repositorio sigue siendo la fuente
 * única y no hay texto duplicado a mano.
 */
interface Topic {
  readonly id: string;
  readonly title: string;
  /** Cuerpo del tema (`##`), sin su encabezado. */
  readonly html: string;
  /** Sub-secciones (`###`) del tema. */
  readonly children: readonly ManualSection[];
}

/** Agrupa las sub-secciones (`###`) bajo el tema (`##`) al que pertenecen en el manual. */
function groupTopics(sections: readonly ManualSection[]): readonly Topic[] {
  const topics: { id: string; title: string; html: string; children: ManualSection[] }[] = [];

  for (const section of sections) {
    if (section.level === 2 || topics.length === 0) {
      topics.push({ id: section.id, title: section.title, html: section.html, children: [] });
      continue;
    }
    const parent = topics[topics.length - 1];
    if (!parent) continue;
    parent.children.push(section);
  }

  return topics;
}

export function generateStaticParams() {
  return MANUALS.map((manual) => ({ slug: manual.slug }));
}

export default async function ManualPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("help");
  const manual = MANUALS.find((candidate) => candidate.slug === params.slug);
  if (!manual) notFound();

  const topics = groupTopics(manual.sections);

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10">
        <nav aria-label={t("manualsLabel")} className="text-small">
          <Link
            href="/ayuda"
            className="font-medium text-ink-soft underline transition-colors hover:text-ink"
          >
            ← {t("backToIndex")}
          </Link>
        </nav>

        <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-h2 font-semibold tracking-tight">{manual.title}</h1>
          </div>
          <a
            href={manual.pdf}
            download
            aria-label={t("downloadPdfAria")}
            className="inline-flex flex-none items-center justify-center gap-2 rounded-brand border border-line bg-shell px-4 py-2 text-small font-semibold text-ink shadow-sm transition hover:bg-sand-2 focus:outline-none focus:ring-2 focus:ring-sea"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t("downloadPdf")}
          </a>
        </header>

        <div className="flex flex-col gap-10 tablet:flex-row tablet:items-start">
          <nav
            aria-label={t("sectionsLabel")}
            className="w-full flex-none rounded-brand border border-line bg-sand-2 p-4 tablet:sticky tablet:top-[88px] tablet:max-h-[calc(100vh-120px)] tablet:w-64 tablet:overflow-y-auto"
          >
            <p className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-soft">
              {t("topicsLabel")}
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-small">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <a href={`#${topic.id}`} className="font-medium text-ink hover:text-sea">
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
          </article>
        </div>
      </div>
    </PublicShell>
  );
}
