import { describe, expect, it } from "vitest";
import {
  ROYALTY_FALLBACK_BPS,
  ROYALTY_ROOM_RANGES,
  ROYALTY_ROOM_TYPES,
  formatRoyaltyBps,
  isValidRoyaltyBps,
} from "./royalty-bps";

/**
 * Reglas del royalty configurable (RF-08 · C1, 2026-10-13). Se prueban sin navegador: son las que
 * deciden si el panel habilita el botón de firmar y cómo enseña el porcentaje.
 */
describe("isValidRoyaltyBps · regla 0–2000 bps del pliego", () => {
  it("acepta los extremos y valores intermedios", () => {
    expect(isValidRoyaltyBps("0")).toBe(true);
    expect(isValidRoyaltyBps("500")).toBe(true);
    expect(isValidRoyaltyBps("2000")).toBe(true);
    expect(isValidRoyaltyBps(" 1500 ")).toBe(true); // se recorta
  });

  it("rechaza por encima del tope, negativos, decimales y vacío", () => {
    expect(isValidRoyaltyBps("2001")).toBe(false);
    expect(isValidRoyaltyBps("-1")).toBe(false);
    expect(isValidRoyaltyBps("12.5")).toBe(false);
    expect(isValidRoyaltyBps("")).toBe(false);
    expect(isValidRoyaltyBps("mil")).toBe(false);
    expect(isValidRoyaltyBps("1e3")).toBe(false);
  });
});

describe("formatRoyaltyBps · porcentaje legible", () => {
  it("convierte bps en porcentaje", () => {
    expect(formatRoyaltyBps(0)).toBe("0");
    expect(formatRoyaltyBps(500)).toBe("5");
    expect(formatRoyaltyBps(1000)).toBe("10");
    expect(formatRoyaltyBps(2000)).toBe("20");
  });

  it("admite medios puntos sin perder el decimal", () => {
    expect(formatRoyaltyBps(1250)).toMatch(/^12[.,]5$/);
  });
});

describe("valores iniciales del panel", () => {
  it("los tres tipos del vocabulario tienen rango y valor de partida", () => {
    for (const type of ROYALTY_ROOM_TYPES) {
      expect(ROYALTY_ROOM_RANGES[type]).toBeTruthy();
      expect(ROYALTY_FALLBACK_BPS[type]).toBeGreaterThanOrEqual(0);
      expect(ROYALTY_FALLBACK_BPS[type]).toBeLessThanOrEqual(2000);
    }
  });

  it("los valores de partida son los de D-06: 5 % simple/doble y 10 % suite", () => {
    expect(ROYALTY_FALLBACK_BPS.simple).toBe(500);
    expect(ROYALTY_FALLBACK_BPS.doble).toBe(500);
    expect(ROYALTY_FALLBACK_BPS.suite).toBe(1000);
  });
});
