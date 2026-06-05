import { describe, expect, it } from "vitest";
import {
  compareHistoryDesc,
  occupancyRatioPercent,
  type SaleHistoryEntry,
} from "./aggregates";

describe("occupancyRatioPercent (CU-11)", () => {
  it("calcula el ratio (30/100 = 30%)", () => {
    expect(occupancyRatioPercent(30, 100)).toBe(30);
  });
  it("devuelve 0% si no hay minteadas (sin NaN, div/0)", () => {
    expect(occupancyRatioPercent(0, 0)).toBe(0);
    expect(occupancyRatioPercent(5, 0)).toBe(0);
  });
});

describe("compareHistoryDesc (CU-09 orden total)", () => {
  const entry = (blockNumber: number, logIndex: number): SaleHistoryEntry => ({
    tokenId: "1",
    room: 102,
    dateYYYYMMDD: 20_260_615,
    roomType: "simple",
    priceWei: "1",
    saleType: "PRIMARY",
    seller: "0x0",
    buyer: "0x1",
    blockNumber,
    logIndex,
    txHash: "0x",
  });

  it("ordena descendente por bloque y, en empate, por logIndex descendente", () => {
    const sorted = [entry(10, 0), entry(12, 1), entry(12, 3), entry(8, 5)].sort(compareHistoryDesc);
    expect(sorted.map((e) => [e.blockNumber, e.logIndex])).toEqual([
      [12, 3],
      [12, 1],
      [10, 0],
      [8, 5],
    ]);
  });
});
