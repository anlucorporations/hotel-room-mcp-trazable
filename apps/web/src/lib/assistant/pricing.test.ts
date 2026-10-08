import { describe, expect, it } from "vitest";
import { FALLBACK_PRICE, KNOWN_PRICES, estimateCostUsd, priceOf } from "./pricing";

/** Consumo de un millón de tokens de cada tipo: el coste debe salir directo de la tarifa. */
const MILLON = { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedInputTokens: 0 };

describe("priceOf", () => {
  it("conoce el modelo por defecto de la v3", () => {
    expect(priceOf("gemini-2.5-flash-lite")).toEqual({ inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 });
  });

  it("para un modelo desconocido usa la tarifa más cara, no la más barata", () => {
    // Si alguien cambia de modelo sin actualizar la tabla, el coste debe SOBREESTIMARSE.
    expect(priceOf("modelo-que-no-existe")).toEqual(FALLBACK_PRICE);
    expect(FALLBACK_PRICE.inputPerMillionUsd).toBeGreaterThan(KNOWN_PRICES["gemini-2.5-flash-lite"]!.inputPerMillionUsd);
  });

  it("permite sobrescribir la tarifa por entorno", () => {
    const price = priceOf("gemini-2.5-flash-lite", {
      ASSISTANT_PRICE_INPUT_PER_M: "2",
      ASSISTANT_PRICE_OUTPUT_PER_M: "8",
    });

    expect(price).toEqual({ inputPerMillionUsd: 2, outputPerMillionUsd: 8 });
  });

  it("ignora una sobrescritura inválida y vuelve a la tabla", () => {
    const price = priceOf("gemini-2.5-flash-lite", {
      ASSISTANT_PRICE_INPUT_PER_M: "no-es-un-numero",
      ASSISTANT_PRICE_OUTPUT_PER_M: "8",
    });

    expect(price).toEqual(KNOWN_PRICES["gemini-2.5-flash-lite"]);
  });
});

describe("estimateCostUsd", () => {
  it("calcula el coste de entrada y salida del modelo elegido", () => {
    // 1M de entrada (0,10 USD) + 1M de salida (0,40 USD) = 0,50 USD.
    expect(estimateCostUsd("gemini-2.5-flash-lite", MILLON)).toBe(0.5);
  });

  it("un consumo pequeño cuesta céntimos de céntimo", () => {
    const cost = estimateCostUsd("gemini-2.5-flash-lite", {
      inputTokens: 3_000,
      outputTokens: 400,
      cachedInputTokens: 0,
    });

    expect(cost).toBeCloseTo(0.00046, 6);
  });

  it("cobra los tokens de caché a tarifa completa (estimar de más es lo prudente)", () => {
    const sinCache = estimateCostUsd("gemini-2.5-flash-lite", {
      inputTokens: 1_000,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
    const conCache = estimateCostUsd("gemini-2.5-flash-lite", {
      inputTokens: 1_000,
      outputTokens: 0,
      cachedInputTokens: 900,
    });

    expect(conCache).toBe(sinCache);
  });

  it("con Sonnet el mismo consumo es mucho más caro (justifica el cambio de modelo)", () => {
    const lite = estimateCostUsd("gemini-2.5-flash-lite", MILLON);
    const sonnet = estimateCostUsd("claude-sonnet-4-6", MILLON);

    expect(sonnet).toBeGreaterThan(lite * 30);
  });
});
