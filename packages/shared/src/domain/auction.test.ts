import { describe, expect, it } from "vitest";
import {
  AUCTION_ANTI_SNIPE_WINDOW_SECONDS,
  AUCTION_BPS_DENOMINATOR,
  AUCTION_MAX_DURATION_SECONDS,
  AUCTION_MIN_BID_INCREMENT_BPS,
  AUCTION_MIN_BID_INCREMENT_WEI,
  AUCTION_MIN_DURATION_SECONDS,
} from "../constants";
import {
  antiSnipeEndTime,
  auctionPhase,
  auctionWindowIssue,
  isAuctionEmpty,
  isValidAuctionWindow,
  nextMinBid,
  timeLeftSeconds,
  ZERO_ADDRESS,
  type AuctionView,
} from "./auction";

const SELLER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const BIDDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

/** Subasta base: reserva 0,1, abierta entre t=1000 y t=2000. */
function auction(overrides: Partial<AuctionView> = {}): AuctionView {
  return {
    tokenId: 201n * 100_000_000n + 20_260_701n,
    seller: SELLER,
    reservePrice: 100_000_000_000_000_000n, // 0,1
    startTime: 1_000n,
    endTime: 2_000n,
    highestBidder: ZERO_ADDRESS,
    highestBid: 0n,
    settled: false,
    cancelled: false,
    ...overrides,
  };
}

describe("dominio de subastas · fase y cuenta atrás", () => {
  it("sin subasta registrada la fase es NONE", () => {
    const empty = auction({ tokenId: 0n });
    expect(isAuctionEmpty(empty)).toBe(true);
    expect(auctionPhase(empty, 1_500n)).toBe("NONE");
  });

  it("recorre programada → abierta → cerrada", () => {
    const a = auction();
    expect(auctionPhase(a, 999n)).toBe("SCHEDULED");
    expect(auctionPhase(a, 1_000n)).toBe("OPEN");
    expect(auctionPhase(a, 1_999n)).toBe("OPEN");
    expect(auctionPhase(a, 2_000n)).toBe("CLOSED");
  });

  it("liquidada y cancelada mandan sobre el reloj", () => {
    expect(auctionPhase(auction({ settled: true }), 1_500n)).toBe("SETTLED");
    expect(auctionPhase(auction({ cancelled: true }), 1_500n)).toBe("CANCELLED");
  });

  it("la cuenta atrás solo corre mientras está abierta", () => {
    expect(timeLeftSeconds(auction(), 1_500n)).toBe(500n);
    expect(timeLeftSeconds(auction(), 999n)).toBe(0n);
    expect(timeLeftSeconds(auction(), 2_000n)).toBe(0n);
    expect(timeLeftSeconds(auction({ settled: true }), 1_500n)).toBe(0n);
  });
});

describe("dominio de subastas · puja mínima (espejo del contrato)", () => {
  it("sin pujas exige el precio de reserva", () => {
    expect(nextMinBid(auction())).toBe(100_000_000_000_000_000n);
  });

  it("con pujas exige la mejor más el 5 %", () => {
    const a = auction({ highestBidder: BIDDER, highestBid: 200_000_000_000_000_000n });
    // 5 % de 0,2 = 0,01 ⇒ 0,21
    expect(nextMinBid(a)).toBe(210_000_000_000_000_000n);
  });

  it("aplica el suelo absoluto de 0,001 en pujas pequeñas", () => {
    const a = auction({ highestBidder: BIDDER, highestBid: 1_000_000_000_000n });
    // 5 % de 0,000001 sería menor que 0,001 ⇒ 0,001001
    expect(nextMinBid(a)).toBe(1_001_000_000_000_000n);
  });
});

describe("dominio de subastas · anti-sniping", () => {
  it("una puja en la ventana final desplaza el cierre a puja + ventana", () => {
    expect(antiSnipeEndTime(2_000n, 1_800n)).toBe(1_800n + 300n);
  });

  it("una puja temprana no mueve el cierre", () => {
    expect(antiSnipeEndTime(2_000n, 1_000n)).toBe(2_000n);
  });

  it("justo en el borde de la ventana no extiende", () => {
    expect(antiSnipeEndTime(2_000n, 1_700n)).toBe(2_000n); // 300 de margen exacto
  });
});

describe("dominio de subastas · ventana del alta (mismas cotas que el contrato)", () => {
  it("acepta de 1 hora a 14 días", () => {
    const now = 1_000n;
    expect(isValidAuctionWindow(now, now + 3_600n, now)).toBe(true);
    expect(isValidAuctionWindow(now, now + 1_209_600n, now)).toBe(true);
  });

  it("rechaza empezar en el pasado, duración corta o larga", () => {
    const now = 1_000n;
    expect(auctionWindowIssue(now - 1n, now + 3_600n, now)).toBe("START_IN_PAST");
    expect(auctionWindowIssue(now, now + 3_599n, now)).toBe("TOO_SHORT");
    expect(auctionWindowIssue(now, now + 1_209_601n, now)).toBe("TOO_LONG");
    expect(isValidAuctionWindow(now, now + 3_599n, now)).toBe(false);
  });

  it("la ventana empieza justo ahora y es válida", () => {
    expect(auctionWindowIssue(1_000n, 1_000n + 7_200n, 1_000n)).toBeNull();
  });
});

/**
 * Anclaje de las constantes **espejo**: estas deben coincidir con las de `NightAuction.sol`
 * (`MIN_DURATION = 1 hours`, `MAX_DURATION = 14 days`, `ANTI_SNIPE_WINDOW = 5 minutes`,
 * `MIN_BID_INCREMENT_BPS = 500`, `MIN_BID_INCREMENT_WEI = 0.001 ether`, `BPS_DENOMINATOR = 10_000`).
 * La otra mitad del anclaje la fija `test/NightAuction.t.sol::test_ConstantsMatchTheSharedMirror`.
 */
describe("constantes espejo del contrato", () => {
  it("coinciden con los literales de NightAuction.sol", () => {
    expect(AUCTION_MIN_DURATION_SECONDS).toBe(3_600); // 1 hora
    expect(AUCTION_MAX_DURATION_SECONDS).toBe(1_209_600); // 14 días
    expect(AUCTION_ANTI_SNIPE_WINDOW_SECONDS).toBe(300); // 5 minutos
    expect(AUCTION_MIN_BID_INCREMENT_BPS).toBe(500); // 5 %
    expect(AUCTION_MIN_BID_INCREMENT_WEI).toBe(1_000_000_000_000_000n); // 0,001
    expect(AUCTION_BPS_DENOMINATOR).toBe(10_000);
  });
});
