import { describe, expect, it } from "vitest";
import {
  asRoomTypeKey,
  compareHistoryDesc,
  monthInTimeZone,
  occupancyRatioPercent,
  summarizeHistory,
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
    blockTimestamp: 1_780_000_000,
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

/** Instante UNIX (segundos) a partir de una fecha UTC explícita. */
const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

describe("monthInTimeZone (D-16: el mes es el del hotel, no el de UTC)", () => {
  it("una venta de las 23:30 UTC del 31 de enero es de FEBRERO en Madrid (UTC+1)", () => {
    // 23:30 UTC del 31 de enero = 00:30 del 1 de febrero en Madrid.
    expect(monthInTimeZone(at("2026-01-31T23:30:00Z"), "Europe/Madrid")).toBe("2026-02");
    // El mismo instante en UTC sigue siendo enero: el mes depende de la zona, no del instante.
    expect(monthInTimeZone(at("2026-01-31T23:30:00Z"), "UTC")).toBe("2026-01");
  });

  it("una venta de las 22:30 UTC del 31 de julio es de AGOSTO en Madrid (UTC+2, horario de verano)", () => {
    // 22:30 UTC del 31 de julio = 00:30 del 1 de agosto en Madrid.
    expect(monthInTimeZone(at("2026-07-31T22:30:00Z"), "Europe/Madrid")).toBe("2026-08");
  });

  it("en UTC el mismo instante cae en el mes anterior (la zona no es un detalle cosmético)", () => {
    expect(monthInTimeZone(at("2026-07-31T22:30:00Z"), "UTC")).toBe("2026-07");
  });
});

describe("summarizeHistory (D-16: derivación independiente del SQL del worker)", () => {
  const sale = (
    over: Partial<SaleHistoryEntry> & Pick<SaleHistoryEntry, "tokenId" | "saleType" | "priceWei">,
  ): SaleHistoryEntry => ({
    room: 101,
    dateYYYYMMDD: 20_260_815,
    roomType: "simple",
    seller: "0xseller",
    buyer: "0xbuyer",
    blockNumber: 1,
    logIndex: 0,
    txHash: "0x",
    blockTimestamp: at("2026-08-15T10:00:00Z"),
    ...over,
  });

  it("agrupa la serie mensual por mes del hotel, separando primaria y reventa", () => {
    const summary = summarizeHistory([
      sale({ tokenId: "1", saleType: "PRIMARY", priceWei: "100" }),
      sale({ tokenId: "1", saleType: "SECONDARY", priceWei: "150" }),
      // 22:30 UTC del 31 de julio = agosto en Madrid.
      sale({
        tokenId: "2",
        saleType: "PRIMARY",
        priceWei: "10",
        blockTimestamp: at("2026-07-31T22:30:00Z"),
      }),
    ]);

    expect(summary.monthlySeries).toEqual([
      {
        month: "2026-08",
        primaryVolumeWei: "110",
        secondaryVolumeWei: "150",
        primarySales: 2,
        secondarySales: 1,
      },
    ]);
  });

  it("desglosa por tipo de habitación en orden canónico y suma el total", () => {
    const summary = summarizeHistory([
      sale({ tokenId: "1", saleType: "PRIMARY", priceWei: "100", roomType: "suite" }),
      sale({ tokenId: "2", saleType: "PRIMARY", priceWei: "50", roomType: "simple" }),
      sale({ tokenId: "2", saleType: "SECONDARY", priceWei: "70", roomType: "simple" }),
    ]);

    expect(summary.roomTypeBreakdown).toEqual([
      {
        roomType: "simple",
        primarySales: 1,
        secondarySales: 1,
        primaryVolumeWei: "50",
        secondaryVolumeWei: "70",
        totalVolumeWei: "120",
      },
      {
        roomType: "suite",
        primarySales: 1,
        secondarySales: 0,
        primaryVolumeWei: "100",
        secondaryVolumeWei: "0",
        totalVolumeWei: "100",
      },
    ]);
  });

  it("rankea las noches más revendidas por nº de reventas, con orden total determinista", () => {
    const summary = summarizeHistory([
      sale({ tokenId: "7", saleType: "SECONDARY", priceWei: "5" }),
      sale({ tokenId: "7", saleType: "SECONDARY", priceWei: "6" }),
      sale({ tokenId: "9", saleType: "SECONDARY", priceWei: "90" }),
      sale({ tokenId: "9", saleType: "SECONDARY", priceWei: "90" }),
      // Empate a 2 reventas: gana el de más volumen (9: 180 > 7: 11).
      sale({ tokenId: "3", saleType: "SECONDARY", priceWei: "2" }),
      // Una primaria no es una reventa.
      sale({ tokenId: "3", saleType: "PRIMARY", priceWei: "999" }),
    ]);

    expect(summary.topResold.map((n) => [n.tokenId, n.resaleCount, n.resaleVolumeWei])).toEqual([
      ["9", 2, "180"],
      ["7", 2, "11"],
      ["3", 1, "2"],
    ]);
  });

  it("declara las ventas sin marca temporal en lugar de perderlas en silencio", () => {
    const summary = summarizeHistory([
      sale({ tokenId: "1", saleType: "PRIMARY", priceWei: "100" }),
      sale({ tokenId: "2", saleType: "PRIMARY", priceWei: "100", blockTimestamp: null }),
    ]);

    expect(summary.undatedSalesCount).toBe(1);
    expect(summary.monthlySeries).toHaveLength(1);
    // El desglose y el ranking NO dependen de la marca temporal: la fila sin fecha sigue contando.
    expect(summary.roomTypeBreakdown[0]?.primarySales).toBe(2);
  });

  it("no inventa tipos de habitación: lo que no está en el maestro es 'desconocido'", () => {
    expect(asRoomTypeKey("suite")).toBe("suite");
    expect(asRoomTypeKey(null)).toBe("desconocido");
    expect(asRoomTypeKey("deluxe")).toBe("desconocido");
  });

  it("con histórico vacío devuelve agregados vacíos (sin NaN ni claves inventadas)", () => {
    expect(summarizeHistory([])).toEqual({
      monthlySeries: [],
      roomTypeBreakdown: [],
      topResold: [],
      undatedSalesCount: 0,
    });
  });
});
