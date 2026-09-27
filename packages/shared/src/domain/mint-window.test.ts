import { describe, expect, it } from "vitest";
import {
  MINT_WINDOW_LOW_THRESHOLD,
  addDaysYYYYMMDD,
  buildMintWindow,
  deriveMintWindowStatus,
  todayYYYYMMDDUtc,
} from "./mint-window";

describe("addDaysYYYYMMDD", () => {
  it("cruza fin de mes, fin de año y año bisiesto", () => {
    expect(addDaysYYYYMMDD(20260131, 1)).toBe(20260201);
    expect(addDaysYYYYMMDD(20261231, 1)).toBe(20270101);
    expect(addDaysYYYYMMDD(20240228, 1)).toBe(20240229); // 2024 bisiesto
    expect(addDaysYYYYMMDD(20250228, 1)).toBe(20250301); // 2025 no bisiesto
    expect(addDaysYYYYMMDD(20260301, -1)).toBe(20260228);
  });
});

describe("todayYYYYMMDDUtc", () => {
  it("compone AAAAMMDD en UTC", () => {
    expect(todayYYYYMMDDUtc(new Date(Date.UTC(2026, 10, 9, 23, 30)))).toBe(20261109);
    expect(todayYYYYMMDDUtc(new Date(Date.UTC(2026, 0, 1, 0, 0)))).toBe(20260101);
  });
});

describe("buildMintWindow (F8 · D-4/D-11/D-16)", () => {
  it("empieza en hoy+1 y cubre los días de la ventana", () => {
    const nights = buildMintWindow({
      room: 101,
      roomType: "simple",
      todayYYYYMMDD: 20261231,
      windowDays: 3,
    });
    expect(nights.map((n) => n.dateYYYYMMDD)).toEqual([20270101, 20270102, 20270103]);
    expect(nights[0]!.tokenId).toBe(10120270101n);
  });

  it("es idempotente: omite las noches ya acuñadas", () => {
    const already = new Set([10120270102n]);
    const nights = buildMintWindow({
      room: 101,
      roomType: "simple",
      todayYYYYMMDD: 20261231,
      windowDays: 3,
      isMinted: (tokenId) => already.has(tokenId),
    });
    expect(nights.map((n) => n.dateYYYYMMDD)).toEqual([20270101, 20270103]);
  });

  it("devuelve vacío si la ventana no tiene días válidos o está completa", () => {
    expect(
      buildMintWindow({ room: 101, roomType: "simple", todayYYYYMMDD: 20260101, windowDays: 0 }),
    ).toEqual([]);
    expect(
      buildMintWindow({ room: 101, roomType: "simple", todayYYYYMMDD: 20260101, windowDays: -5 }),
    ).toEqual([]);
    expect(
      buildMintWindow({
        room: 101,
        roomType: "simple",
        todayYYYYMMDD: 20260101,
        windowDays: 2,
        isMinted: () => true,
      }),
    ).toEqual([]);
  });
});

describe("deriveMintWindowStatus (D-17)", () => {
  it("avisa cuando quedan pocas noches libres", () => {
    const low = deriveMintWindowStatus({ windowDays: 90, missing: 0, freeNights: 3 });
    expect(low.low).toBe(true);
    const ok = deriveMintWindowStatus({ windowDays: 90, missing: 0, freeNights: MINT_WINDOW_LOW_THRESHOLD });
    expect(ok.low).toBe(false);
  });

  it("respeta un umbral explícito", () => {
    expect(deriveMintWindowStatus({ windowDays: 10, missing: 0, freeNights: 5, threshold: 10 }).low).toBe(true);
  });
});
