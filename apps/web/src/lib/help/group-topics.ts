/**
 * Agrupa las sub-secciones (`###`) bajo el tema (`##`) al que pertenecen, conservando el orden.
 *
 * Se comparte entre la ayuda de los manuales generales (`app/ayuda/[slug]`) y la del manual del
 * huésped (`app/ayuda/huesped/[slug]`): ambas reciben del generador una lista plana de secciones con
 * su nivel y necesitan la misma jerarquía para el índice lateral y los encabezados.
 */
export interface HelpSectionLike {
  readonly id: string;
  readonly title: string;
  readonly level: 2 | 3;
  readonly html: string;
}

export interface HelpTopic<T> {
  readonly id: string;
  readonly title: string;
  /** Cuerpo del tema (`##`), sin su encabezado. */
  readonly html: string;
  /** Sub-secciones (`###`) del tema. */
  readonly children: readonly T[];
}

/** Devuelve los temas (`##`) con sus hijos (`###`); una sección suelta encabeza su propio tema. */
export function groupTopics<T extends HelpSectionLike>(sections: readonly T[]): readonly HelpTopic<T>[] {
  const topics: { id: string; title: string; html: string; children: T[] }[] = [];

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
