"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Render **amigable** del texto del asistente (petición del responsable, 2026-10-11).
 *
 * El modelo responde en un markdown ligero y hasta ahora se pintaba en crudo, así que el huésped veía
 * los asteriscos y las viñetas sin jerarquía. Aquí se convierte un subconjunto **seguro** de ese
 * formato en elementos de React:
 *
 *   · `**negrita**` → `<strong>` (precios, fechas, condiciones);
 *   · líneas que empiezan por `* `, `- ` o `• ` → lista con viñetas;
 *   · líneas `1. ` → lista numerada;
 *   · el resto → párrafos.
 *
 * **No se usa `dangerouslySetInnerHTML`**: el texto viene de un modelo, así que se construyen nodos y
 * nunca se inyecta HTML. Lo que no se reconoce se muestra tal cual: mejor un asterisco de más que una
 * frase perdida.
 */
export function MessageText({ text }: { text: string }): ReactNode {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (key: string): void => {
    if (list === null) return;
    const items = list.items.map((item, i) => <li key={`${key}-${i}`}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key} className="ml-4 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={key} className="ml-4 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.length === 0) {
      flush(`b${index}`);
      return;
    }

    const bullet = /^[*-•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      if (list === null || list.ordered !== ordered) {
        flush(`b${index}`);
        list = { ordered, items: [] };
      }
      list.items.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      return;
    }

    flush(`b${index}`);
    blocks.push(
      <p key={`b${index}`} className="whitespace-pre-line">
        {inline(line)}
      </p>,
    );
  });
  flush("b-end");

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

/** Formato en línea: `**negrita**` y `` `código` ``. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={`t${last}`}>{text.slice(last, match.index)}</Fragment>);
    if (match[1] !== undefined) {
      parts.push(
        <strong key={`b${match.index}`} className="font-semibold text-ink">
          {match[1]}
        </strong>,
      );
    } else {
      parts.push(
        <code key={`c${match.index}`} className="rounded bg-mist-2 px-1 font-mono text-small">
          {match[2]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return parts;
}
