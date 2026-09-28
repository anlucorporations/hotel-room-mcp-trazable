import { starsFor } from "@/lib/stars";

/**
 * Átomo `Stars` (propuesta de imagen visual · Fase C).
 *
 * La calificación es una **imagen con nombre accesible** (`role="img"` + `aria-label`): un lector de
 * pantalla anuncia «4 de 5 estrellas» y no cinco glifos sueltos. Los caracteres van `aria-hidden`.
 *
 * Color: `terracotta-text` (6,02:1 sobre blanco, 5,59:1 sobre arena) y no `gold`, que sobre claro se
 * queda en 2,97:1 — el dorado está reservado a superficies oscuras. Las estrellas vacías usan el
 * mismo token con opacidad: la información la lleva el relleno, no el color.
 */
export function Stars({
  rating,
  label,
  className = "",
}: {
  /** Nota 0–5 (se acota; ver `starsFor`). */
  rating: number;
  /** Nombre accesible, p. ej. «4 de 5 estrellas». */
  label: string;
  className?: string;
}) {
  const stars = starsFor(rating);

  return (
    <p
      role="img"
      aria-label={label}
      className={`inline-flex items-center gap-0.5 text-body leading-none ${className}`.trim()}
    >
      {stars.map((filled, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={filled ? "text-terracotta-text" : "text-terracotta-text/25"}
        >
          ★
        </span>
      ))}
    </p>
  );
}
