/**
 * Estrellas de calificación (átomo de la suite pública, propuesta de imagen visual · Fase C).
 *
 * Lógica **pura** para poder probarla sin entorno DOM: el componente `Stars` solo pinta el
 * resultado. La nota de una reseña es un entero 1–5, pero la función **acota** cualquier entrada
 * (0, 4,7, 9) para que un dato corrupto no rompa la interfaz ni pinte más estrellas de las debidas.
 */

/** Número de estrellas de la escala. */
export const MAX_RATING = 5;

/**
 * Reparte una nota en la escala: `true` = estrella rellena.
 *
 * @example starsFor(3) // [true, true, true, false, false]
 */
export function starsFor(rating: number): boolean[] {
  const safe = Number.isFinite(rating) ? Math.round(rating) : 0;
  const filled = Math.min(MAX_RATING, Math.max(0, safe));
  return Array.from({ length: MAX_RATING }, (_, index) => index < filled);
}

/** Número de estrellas rellenas (para textos del tipo «3 de 5 estrellas»). */
export function filledStars(rating: number): number {
  return starsFor(rating).filter(Boolean).length;
}
