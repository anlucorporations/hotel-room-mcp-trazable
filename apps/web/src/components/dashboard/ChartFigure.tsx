"use client";

import type { ReactNode } from "react";

/**
 * Envoltorio accesible de una gráfica (WCAG 1.1.1 / 1.3.1 / 4.1.2).
 *
 * Una gráfica SVG es, para un lector de pantalla, un rectángulo vacío: recharts dibuja `<path>`s
 * sin texto alternativo. Por eso TODA gráfica del dashboard va envuelta aquí, que garantiza las
 * tres cosas que la hacen equivalente para quien no ve el dibujo:
 *
 *   1. `<figure>` + `<figcaption>`: el título y el resumen de la gráfica son texto real.
 *   2. `role="img"` + `aria-label` en el contenedor del SVG: el dibujo tiene un nombre accesible
 *      («Ventas por mes: 2026-08, 3 ETH primaria y 1 ETH reventa…»), no queda como imagen muda.
 *   3. `<details>` con una **tabla de datos real**: la misma información en formato tabular, que
 *      es la alternativa exigible cuando el color/geometría es el único canal (WCAG 1.4.1).
 *
 * El botón de resumen es nativo (`<summary>`), así que funciona con teclado y sin JavaScript.
 */
export function ChartFigure({
  id,
  title,
  summary,
  description,
  tableCaption,
  tableHeaders,
  tableRows,
  legend,
  children,
}: {
  /** Identificador estable para enlazar `aria-labelledby`/`aria-describedby`. */
  readonly id: string;
  readonly title: string;
  /** Resumen textual de los datos que se ven en el dibujo (se usa como `aria-label`). */
  readonly summary: string;
  /** Frase que explica qué mide la gráfica (unidad, periodo, criterio). */
  readonly description: string;
  readonly tableCaption: string;
  readonly tableHeaders: readonly string[];
  /** Filas de la tabla alternativa (mismo contenido que el dibujo). */
  readonly tableRows: readonly (readonly ReactNode[])[];
  /** Leyenda en HTML (nombres de serie en texto, no en SVG): el color no es el único canal. */
  readonly legend?: ReactNode;
  readonly children: ReactNode;
}) {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <figure data-testid={id} className="rounded-brand-lg border border-line bg-shell p-4 shadow-card">
      <figcaption className="flex flex-col gap-0.5">
        <h3 id={titleId} className="font-display text-body font-semibold text-ink">
          {title}
        </h3>
        <p id={descriptionId} className="text-micro text-ink-soft">
          {description}
        </p>
      </figcaption>

      <div
        role="img"
        aria-label={summary}
        aria-describedby={descriptionId}
        className="mt-3 h-64 w-full"
      >
        {children}
      </div>

      {legend !== undefined && <div className="mt-2">{legend}</div>}

      <details className="mt-3">
        <summary className="cursor-pointer text-micro font-semibold text-azure underline">
          {`Ver los datos de «${title}»`}
        </summary>
        <table className="mt-3 w-full border-collapse text-small">
          <caption className="sr-only">{tableCaption}</caption>
          <thead>
            <tr>
              {tableHeaders.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="border-b border-line px-2 py-1 text-left text-micro font-semibold text-ink"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => (
              <tr key={index} className="odd:bg-mist-2/50">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-2 py-1 ${cellIndex === 0 ? "text-ink" : "text-ink-soft"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
