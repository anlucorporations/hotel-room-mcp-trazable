import { ROYALTY_BPS_MAX, ROYALTY_BPS_STANDARD, ROYALTY_BPS_SUITE } from "@hotel/shared/domain";

/**
 * Reglas puras del **royalty configurable** (RF-08 · C1, 2026-10-13), sin React ni wagmi: el panel
 * del back-office las usa para validar y formatear antes de firmar, y las pruebas las cubren sin
 * navegador.
 */

/** Tipos de habitación del vocabulario cerrado (D-10). */
export const ROYALTY_ROOM_TYPES = ["simple", "doble", "suite"] as const;
export type RoyaltyRoomType = (typeof ROYALTY_ROOM_TYPES)[number];

/** Rangos del maestro (RF-18a), solo para el texto de ayuda del panel. */
export const ROYALTY_ROOM_RANGES: Readonly<Record<RoyaltyRoomType, string>> = {
  simple: "101–115",
  doble: "116–130",
  suite: "201–220",
};

/**
 * Valores INICIALES del contrato (los de D-06). Se usan como respaldo cuando el contrato
 * desplegado todavía no expone `royaltyBpsOf` (versión previa al redeploy de C1).
 */
export const ROYALTY_FALLBACK_BPS: Readonly<Record<RoyaltyRoomType, number>> = {
  simple: ROYALTY_BPS_STANDARD,
  doble: ROYALTY_BPS_STANDARD,
  suite: ROYALTY_BPS_SUITE,
};

/** bps → porcentaje legible (500 → «5», 1000 → «10», 1250 → «12,5»). */
export function formatRoyaltyBps(bps: number): string {
  return (bps / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** `true` si el texto es un entero de 0 a `ROYALTY_BPS_MAX` (regla del pliego, RF-08). */
export function isValidRoyaltyBps(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const bps = Number(value);
  return Number.isInteger(bps) && bps >= 0 && bps <= ROYALTY_BPS_MAX;
}
