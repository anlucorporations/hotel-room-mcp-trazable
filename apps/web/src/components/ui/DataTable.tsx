import type { ReactNode } from "react";

/**
 * `DataTable` — tabla **densa** de las suites de personal (propuesta de imagen visual §3.7 · Fase C.3).
 *
 * La usan recepción, housekeeping, mantenimiento y administración: pantallas con muchas filas y
 * operadores con prisa, donde la legibilidad y el objetivo táctil importan más que el aire editorial
 * del escaparate. No tiene estado ni efectos (es un componente de servidor utilizable en cualquier
 * árbol) y **no conoce el dominio**: recibe columnas y filas.
 *
 * Accesibilidad (lo vigila `table-semantics.test.ts`):
 *   - `<caption>` siempre presente —visible solo para lectores de pantalla—, porque una tabla sin
 *     nombre obliga a adivinar qué se está mirando.
 *   - `scope="col"` en las cabeceras y `scope="row"` en la **primera celda**, que es el identificador
 *     de la fila (habitación, código, operador…).
 *   - El contenedor con desplazamiento horizontal es una **región con nombre** y `tabIndex={0}`: sin
 *     eso, quien navega con teclado no puede recorrer una tabla ancha (WCAG 2.1.1).
 *   - `hideOnMobile` **oculta la columna, no la elimina**: en móvil se ve menos, pero el contenido
 *     sigue disponible para quien usa lector de pantalla.
 */

export interface DataTableColumn<T> {
  /** Identificador estable de la columna (clave de React). */
  readonly key: string;
  readonly header: ReactNode;
  /** Contenido de la celda; en la primera columna se pinta como encabezado de fila. */
  readonly cell: (row: T) => ReactNode;
  readonly align?: "left" | "right" | "center";
  /** Oculta la columna en móvil (el dato sigue en el DOM para lectores de pantalla). */
  readonly hideOnMobile?: boolean;
  /** Clase extra para afinar el ancho (p. ej. `w-24`). */
  readonly className?: string;
}

export interface DataTableProps<T> {
  /** Nombre accesible de la tabla; se pinta como `<caption>` solo para lectores. */
  readonly caption: string;
  readonly columns: ReadonlyArray<DataTableColumn<T>>;
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** Texto que se muestra cuando no hay filas (nunca una tabla vacía sin explicación). */
  readonly emptyLabel: ReactNode;
  /** `compact` para listados largos (móvil del personal), `comfortable` por defecto. */
  readonly density?: "compact" | "comfortable";
  /** Fija la cabecera al desplazar listados largos. */
  readonly stickyHeader?: boolean;
  /** Nombre de la región desplazable (por defecto, el de la tabla). */
  readonly scrollLabel?: string;
  readonly className?: string;
}

const ALIGN: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyLabel,
  density = "comfortable",
  stickyHeader = false,
  scrollLabel,
  className = "",
}: DataTableProps<T>) {
  const padding = density === "compact" ? "px-3 py-2" : "px-3 py-3";

  return (
    <div
      role="region"
      aria-label={scrollLabel ?? caption}
      tabIndex={0}
      className={`overflow-x-auto rounded-brand border border-line bg-shell ${className}`.trim()}
    >
      <table
        className={`w-full border-collapse ${density === "compact" ? "text-body-sm" : "text-small"}`}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className={stickyHeader ? "sticky top-0 z-10 bg-sand-2" : "bg-sand-2"}>
          <tr className="border-b border-line text-left text-micro uppercase tracking-wide text-ink-soft">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${padding} font-semibold ${ALIGN[column.align ?? "left"]} ${
                  column.hideOnMobile ? "hidden tablet:table-cell" : ""
                } ${column.className ?? ""}`.trim()}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${padding} text-center text-ink-soft`}>
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line/60 last:border-b-0 odd:bg-sand/40">
                {columns.map((column, index) =>
                  index === 0 ? (
                    <th
                      key={column.key}
                      scope="row"
                      className={`${padding} font-medium text-ink ${ALIGN[column.align ?? "left"]} ${
                        column.hideOnMobile ? "hidden tablet:table-cell" : ""
                      } ${column.className ?? ""}`.trim()}
                    >
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td
                      key={column.key}
                      className={`${padding} text-ink-soft ${ALIGN[column.align ?? "left"]} ${
                        column.hideOnMobile ? "hidden tablet:table-cell" : ""
                      } ${column.className ?? ""}`.trim()}
                    >
                      {column.cell(row)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
