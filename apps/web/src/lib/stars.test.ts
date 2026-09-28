import { describe, expect, it } from "vitest";
import { MAX_RATING, filledStars, starsFor } from "./stars";

/** Pruebas del reparto de estrellas (átomo de la suite pública, Fase C). */

describe("starsFor", () => {
  it("reparte la escala completa para las notas válidas", () => {
    expect(starsFor(5)).toEqual([true, true, true, true, true]);
    expect(starsFor(3)).toEqual([true, true, true, false, false]);
    expect(starsFor(1)).toEqual([true, false, false, false, false]);
    expect(starsFor(0)).toEqual([false, false, false, false, false]);
  });

  it("siempre devuelve exactamente MAX_RATING posiciones", () => {
    for (const rating of [0, 1, 3, 5, 9, -2, 2.4]) {
      expect(starsFor(rating)).toHaveLength(MAX_RATING);
    }
  });

  it("acota los datos corruptos en vez de pintar más estrellas de las debidas", () => {
    expect(starsFor(9)).toEqual([true, true, true, true, true]);
    expect(starsFor(-3)).toEqual([false, false, false, false, false]);
    expect(starsFor(2.4)).toEqual([true, true, false, false, false]);
    // Un valor no finito no es una nota: se pinta sin estrellas (no se inventa una calificación).
    expect(starsFor(Number.NaN)).toEqual([false, false, false, false, false]);
    expect(starsFor(Number.POSITIVE_INFINITY)).toEqual([false, false, false, false, false]);
  });
});

describe("filledStars", () => {
  it("cuenta las estrellas rellenas y coincide con la nota acotada", () => {
    expect(filledStars(4)).toBe(4);
    expect(filledStars(0)).toBe(0);
    expect(filledStars(7)).toBe(MAX_RATING);
  });
});
