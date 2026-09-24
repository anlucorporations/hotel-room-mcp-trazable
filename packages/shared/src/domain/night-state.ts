import type { NightState } from "./types";

/** Señales on-chain de una noche para derivar su estado (docs/SRS.md §9). */
export interface NightOnChainSignals {
  readonly exists: boolean;
  readonly soldOnce: boolean;
  readonly expired: boolean;
  readonly listed: boolean;
}

/**
 * Deriva el estado del NFT-noche a partir de las señales on-chain (máquina de estados,
 * docs/SRS.md §9). La expiración es una condición superpuesta que prevalece sobre comprable/listada.
 * Devuelve `null` si la noche no existe.
 */
export function computeNightState(signals: NightOnChainSignals): NightState | null {
  if (!signals.exists) return null;
  if (signals.expired) return "EXPIRADA";
  if (signals.listed) return "LISTADA_SECUNDARIO";
  if (signals.soldOnce) return "EN_PODER_CLIENTE";
  return "DISPONIBLE";
}

/** ¿La noche es comprable ahora? (DISPONIBLE primaria o LISTADA secundaria, no expirada). */
export function isPurchasable(signals: NightOnChainSignals): boolean {
  const state = computeNightState(signals);
  return state === "DISPONIBLE" || state === "LISTADA_SECUNDARIO";
}
