import type { LlmUsage } from "./types";

/**
 * Modelo de coste del asistente (RNF-22).
 *
 * El precio vive aquí y no repartido por el código: cambiar de modelo o corregir una tarifa es editar
 * una tabla. Los valores son **de lista y orientativos** (agregadores públicos, verificados a mano);
 * la fuente de verdad del gasto es la facturación de GCP, y por eso esto se usa para *estimar* y
 * avisar, no para contabilizar.
 */

export interface ModelPrice {
  /** USD por millón de tokens de entrada. */
  readonly inputPerMillionUsd: number;
  /** USD por millón de tokens de salida. */
  readonly outputPerMillionUsd: number;
}

/** Tarifas conocidas, por identificador de modelo. */
export const KNOWN_PRICES: Readonly<Record<string, ModelPrice>> = {
  "gemini-2.5-flash-lite": { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  "gemini-2.0-flash-lite": { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
  "gemini-2.5-flash": { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  "claude-sonnet-4-6": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
};

/**
 * Tarifa de reserva para un modelo desconocido: la del modelo caro por defecto, para que un cambio de
 * modelo sin actualizar la tabla **sobreestime** el coste en lugar de esconderlo.
 */
export const FALLBACK_PRICE: ModelPrice = { inputPerMillionUsd: 3, outputPerMillionUsd: 15 };

export interface PriceOverrides {
  /** Permite pasar `process.env` directamente (su índice encaja con esta firma). */
  readonly [key: string]: string | undefined;
  readonly ASSISTANT_PRICE_INPUT_PER_M?: string;
  readonly ASSISTANT_PRICE_OUTPUT_PER_M?: string;
}

/** Tarifa de un modelo, con posibilidad de sobrescribirla por entorno (una sola vez, para todo). */
export function priceOf(model: string, env: PriceOverrides = {}): ModelPrice {
  const input = Number.parseFloat(env.ASSISTANT_PRICE_INPUT_PER_M ?? "");
  const output = Number.parseFloat(env.ASSISTANT_PRICE_OUTPUT_PER_M ?? "");
  if (Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
    return { inputPerMillionUsd: input, outputPerMillionUsd: output };
  }
  return KNOWN_PRICES[model] ?? FALLBACK_PRICE;
}

/**
 * Coste estimado en USD de un consumo de tokens.
 *
 * Los tokens servidos desde caché del proveedor se cobran más baratos, pero aquí se cuentan a tarifa
 * completa: estimar de más es más seguro que de menos para vigilar un presupuesto.
 */
export function estimateCostUsd(model: string, usage: LlmUsage, env: PriceOverrides = {}): number {
  const price = priceOf(model, env);
  const input = (usage.inputTokens / 1_000_000) * price.inputPerMillionUsd;
  const output = (usage.outputTokens / 1_000_000) * price.outputPerMillionUsd;
  return Number((input + output).toFixed(6));
}
