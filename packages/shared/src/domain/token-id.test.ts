import { describe, expect, it } from "vitest";
import {
  dateToYYYYMMDD,
  decodeTokenId,
  encodeTokenId,
  isDateInRange,
  isValidCalendarDate,
  splitYYYYMMDD,
} from "./token-id";

describe("token-id", () => {
  it("codifica el tokenId canónico (ejemplo de la Decisión 3)", () => {
    expect(encodeTokenId(102, 20260615)).toBe(10220260615n);
  });

  it("descompone el tokenId en habitación y fecha", () => {
    expect(decodeTokenId(10220260615n)).toEqual({
      room: 102,
      dateYYYYMMDD: 20260615,
    });
  });

  it("hace round-trip habitación/fecha → tokenId → habitación/fecha", () => {
    const tokenId = encodeTokenId(220, 20261231);
    expect(decodeTokenId(tokenId)).toEqual({ room: 220, dateYYYYMMDD: 20261231 });
  });

  it("compone y descompone AAAAMMDD", () => {
    const yyyymmdd = dateToYYYYMMDD({ year: 2026, month: 6, day: 15 });
    expect(yyyymmdd).toBe(20260615);
    expect(splitYYYYMMDD(yyyymmdd)).toEqual({ year: 2026, month: 6, day: 15 });
  });

  describe("validación de rango (equivalente on-chain)", () => {
    it("acepta fechas dentro de rango", () => {
      expect(isDateInRange(20260615)).toBe(true);
    });
    it("rechaza mes y día fuera de rango", () => {
      expect(isDateInRange(20261301)).toBe(false); // mes 13
      expect(isDateInRange(20260632)).toBe(false); // día 32
      expect(isDateInRange(20260600)).toBe(false); // día 0
    });
    it("rechaza fechas de ≥9 dígitos (no caben en los 8 dígitos bajos del tokenId)", () => {
      expect(isDateInRange(100000101)).toBe(false);
      expect(isDateInRange(999991231)).toBe(false);
    });
  });

  describe("validación de calendario (off-chain, defensa en profundidad)", () => {
    it("acepta una fecha válida", () => {
      expect(isValidCalendarDate({ year: 2026, month: 6, day: 15 })).toBe(true);
    });
    it("acepta 29-feb en año bisiesto y lo rechaza si no lo es", () => {
      expect(isValidCalendarDate({ year: 2024, month: 2, day: 29 })).toBe(true);
      expect(isValidCalendarDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    });
    it("rechaza 30-feb", () => {
      expect(isValidCalendarDate({ year: 2026, month: 2, day: 30 })).toBe(false);
    });
  });

  describe("guardas de encodeTokenId", () => {
    it("lanza ante habitación inválida", () => {
      expect(() => encodeTokenId(0, 20260615)).toThrow(RangeError);
    });
    it("lanza ante fecha fuera de rango", () => {
      expect(() => encodeTokenId(102, 20261301)).toThrow(RangeError);
    });
  });
});
