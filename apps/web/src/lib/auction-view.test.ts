import { describe, expect, it } from "vitest";
import { ZERO_ADDRESS } from "@hotel/shared/domain";
import {
  buildAuctionItem,
  countdownParts,
  countdownUnits,
  formatAuctionDate,
  livePhase,
  liveTimeLeft,
  openAuctions,
  phaseRank,
  sortAuctionItems,
  type AuctionItem,
  type AuctionRaw,
} from "./auction-view";

const SELLER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const BIDDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const TOKEN = 201n * 100_000_000n + 20_267_001n;

function raw(overrides: Partial<AuctionRaw> = {}): AuctionRaw {
  return {
    tokenId: TOKEN,
    seller: SELLER,
    reservePrice: 100_000_000_000_000_000n, // 0,1
    startTime: 1_000n,
    endTime: 2_000n,
    highestBidder: ZERO_ADDRESS,
    highestBid: 0n,
    settled: false,
    cancelled: false,
    room: 201,
    dateYYYYMMDD: 20_267_001,
    roomType: "suite",
    coverUrl: null,
    ...overrides,
  };
}

/** Item mínimo para probar el orden sin repetir el mapeo. */
function item(overrides: Partial<AuctionItem>): AuctionItem {
  return {
    tokenId: "1",
    room: 201,
    dateYYYYMMDD: 20_267_001,
    roomType: "suite",
    seller: SELLER,
    phase: "OPEN",
    reservePriceWei: "100",
    highestBidWei: "0",
    highestBidder: ZERO_ADDRESS,
    minNextBidWei: "100",
    startTimeSeconds: 1_000,
    endTimeSeconds: 2_000,
    timeLeftSeconds: 500,
    coverUrl: null,
    isPremium: true,
    ...overrides,
  };
}

describe("modelo de vista de la subasta (C2 · RF-13)", () => {
  it("mapea la subasta abierta con su puja mínima y su cuenta atrás", () => {
    const view = buildAuctionItem(raw(), 1_500n);

    expect(view.phase).toBe("OPEN");
    expect(view.tokenId).toBe(TOKEN.toString());
    expect(view.room).toBe(201);
    expect(view.roomType).toBe("suite");
    expect(view.isPremium).toBe(true);
    expect(view.minNextBidWei).toBe("100000000000000000");
    expect(view.timeLeftSeconds).toBe(500);
    expect(view.endTimeSeconds).toBe(2_000);
  });

  it("con pujas, la mínima siguiente es la mejor más el 5 %", () => {
    const view = buildAuctionItem(
      raw({ highestBidder: BIDDER, highestBid: 200_000_000_000_000_000n }),
      1_500n,
    );
    expect(view.minNextBidWei).toBe("210000000000000000");
    expect(view.highestBidder).toBe(BIDDER);
  });

  it("una subasta cerrada pendiente de liquidar no tiene cuenta atrás", () => {
    const view = buildAuctionItem(raw(), 2_500n);
    expect(view.phase).toBe("CLOSED");
    expect(view.timeLeftSeconds).toBe(0);
    expect(openAuctions([view])).toHaveLength(0);
  });

  it("marca como premium solo las suites (RF-13)", () => {
    expect(buildAuctionItem(raw({ roomType: "doble", room: 130 }), 1_500n).isPremium).toBe(false);
  });
});

describe("cuenta atrás", () => {
  it("descompone los segundos en días/horas/minutos/segundos", () => {
    expect(countdownUnits(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(countdownUnits(59)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 59 });
    expect(countdownUnits(3_661)).toEqual({ days: 0, hours: 1, minutes: 1, seconds: 1 });
    expect(countdownUnits(90_061)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
  });

  it("nunca devuelve valores negativos", () => {
    expect(countdownUnits(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("cuenta atrás · las dos unidades más significativas", () => {
  it("muestra días y horas cuando faltan días", () => {
    expect(countdownParts(countdownUnits(90_061))).toEqual([
      { unit: "days", value: 1 },
      { unit: "hours", value: 1 },
    ]);
  });

  it("baja a horas y minutos, y luego a minutos y segundos", () => {
    expect(countdownParts(countdownUnits(3_661))).toEqual([
      { unit: "hours", value: 1 },
      { unit: "minutes", value: 1 },
    ]);
    expect(countdownParts(countdownUnits(610))).toEqual([
      { unit: "minutes", value: 10 },
      { unit: "seconds", value: 10 },
    ]);
  });

  it("con poco tiempo enseña segundos y con cero, `0 s`", () => {
    expect(countdownParts(countdownUnits(45))).toEqual([{ unit: "seconds", value: 45 }]);
    expect(countdownParts(countdownUnits(0))).toEqual([{ unit: "seconds", value: 0 }]);
  });
});

describe("fecha de la noche", () => {
  it("formatea AAAAMMDD en corto y estable (UTC, sin desplazar el día)", () => {
    const label = formatAuctionDate(20_260_701, "es-ES");
    expect(label).toContain("2026");
    expect(label).toMatch(/\b1\b/);
    expect(formatAuctionDate(20_260_701, "en-GB")).toContain("2026");
  });
});

describe("orden de la parrilla", () => {
  it("prioriza abiertas, luego programadas, cerradas y por último el histórico", () => {
    const settled = item({ tokenId: "s", phase: "SETTLED", endTimeSeconds: 9_000 });
    const cancelled = item({ tokenId: "c", phase: "CANCELLED", endTimeSeconds: 9_500 });
    const closed = item({ tokenId: "x", phase: "CLOSED", endTimeSeconds: 3_000 });
    const scheduled = item({ tokenId: "p", phase: "SCHEDULED", endTimeSeconds: 5_000 });
    const openLate = item({ tokenId: "o2", phase: "OPEN", endTimeSeconds: 4_000 });
    const openSoon = item({ tokenId: "o1", phase: "OPEN", endTimeSeconds: 2_500 });

    const sorted = sortAuctionItems([settled, cancelled, closed, scheduled, openLate, openSoon]);
    // Abiertas por cierre más próximo → programadas → cerradas → liquidadas → canceladas.
    expect(sorted.map((i) => i.tokenId)).toEqual(["o1", "o2", "p", "x", "s", "c"]);
  });

  it("el histórico se ordena por cierre más reciente", () => {
    const older = item({ tokenId: "old", phase: "SETTLED", endTimeSeconds: 1_000 });
    const newer = item({ tokenId: "new", phase: "SETTLED", endTimeSeconds: 8_000 });
    expect(sortAuctionItems([older, newer]).map((i) => i.tokenId)).toEqual(["new", "old"]);
  });

  it("`openAuctions` deja fuera el histórico", () => {
    const items = [
      item({ tokenId: "a", phase: "OPEN" }),
      item({ tokenId: "b", phase: "SCHEDULED" }),
      item({ tokenId: "c", phase: "SETTLED" }),
    ];
    expect(openAuctions(items).map((i) => i.tokenId)).toEqual(["a", "b"]);
  });

  it("el rango de fases es monótono (abierta < cerrada < liquidada)", () => {
    expect(phaseRank("OPEN")).toBeLessThan(phaseRank("SCHEDULED"));
    expect(phaseRank("SCHEDULED")).toBeLessThan(phaseRank("CLOSED"));
    expect(phaseRank("CLOSED")).toBeLessThan(phaseRank("SETTLED"));
    expect(phaseRank("SETTLED")).toBeLessThan(phaseRank("CANCELLED"));
  });
});

describe("fase en vivo (la tarjeta pasa el tiempo sin volver al RPC)", () => {
  const base = { phase: "SCHEDULED" as const, startTimeSeconds: 1_000, endTimeSeconds: 2_000 };

  it("una programada se abre al llegar la hora y se cierra al agotarse", () => {
    expect(livePhase(base, 999)).toBe("SCHEDULED");
    expect(livePhase(base, 1_000)).toBe("OPEN");
    expect(livePhase(base, 1_999)).toBe("OPEN");
    expect(livePhase(base, 2_000)).toBe("CLOSED");
  });

  it("los estados terminales no cambian con el reloj", () => {
    expect(livePhase({ ...base, phase: "SETTLED" }, 1_500)).toBe("SETTLED");
    expect(livePhase({ ...base, phase: "CANCELLED" }, 1_500)).toBe("CANCELLED");
  });

  it("la cuenta atrás en vivo solo corre abierta, y nunca es negativa", () => {
    expect(liveTimeLeft(base, 1_500)).toBe(500);
    expect(liveTimeLeft(base, 999)).toBe(0);
    expect(liveTimeLeft(base, 3_000)).toBe(0);
  });
});
