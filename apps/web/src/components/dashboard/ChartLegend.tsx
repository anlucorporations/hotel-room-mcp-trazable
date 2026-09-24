"use client";

import { PALETTE } from "@/lib/a11y/palette";

/**
 * Leyenda de una gráfica en HTML (no en SVG): cada serie lleva su nombre en texto real, junto a
 * una muestra de color. Es la parte que hace que el color deje de ser el único canal (WCAG 1.4.1)
 * y, al ser HTML, se puede leer con lector de pantalla y seleccionar con el teclado.
 */
export function ChartLegend({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly color: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-2 text-micro text-ink-soft">
          <span
            aria-hidden="true"
            data-color={item.color}
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Colores de las dos series de venta, tomados de la paleta real (una sola fuente). */
export const SERIES_COLORS = {
  primary: PALETTE.sea,
  secondary: PALETTE["terracotta-text"],
} as const;
