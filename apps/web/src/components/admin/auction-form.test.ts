import { describe, expect, it } from "vitest";
import {
  AUCTION_DEFAULT_HOURS,
  auctionDraftIssue,
  auctionDraftToCall,
  type AuctionDraft,
} from "./auction-form";

/**
 * Formulario de alta de subasta (C2 · RF-13): las mismas cotas que el contrato. Si el formulario
 * aceptara algo que `createAuction` rechaza, el operador firmaría una transacción condenada.
 */
const draft = (over: Partial<AuctionDraft> = {}): AuctionDraft => ({
  tokenId: "20120267001",
  reserveEth: "0.1",
  hours: String(AUCTION_DEFAULT_HOURS),
  ...over,
});

describe("alta de subasta · validación", () => {
  it("un borrador por defecto es válido", () => {
    expect(auctionDraftIssue(draft())).toBeNull();
  });

  it("exige elegir una noche", () => {
    expect(auctionDraftIssue(draft({ tokenId: "  " }))).toBe("NO_NIGHT");
  });

  it("la reserva puede ser 0, pero no vacía ni inválida", () => {
    expect(auctionDraftIssue(draft({ reserveEth: "0" }))).toBeNull();
    expect(auctionDraftIssue(draft({ reserveEth: "" }))).toBe("INVALID_RESERVE");
    expect(auctionDraftIssue(draft({ reserveEth: "0,1" }))).toBe("INVALID_RESERVE");
    expect(auctionDraftIssue(draft({ reserveEth: "abc" }))).toBe("INVALID_RESERVE");
  });

  it("la duración va de 1 hora a 14 días (mismas cotas que el contrato)", () => {
    expect(auctionDraftIssue(draft({ hours: "1" }))).toBeNull();
    expect(auctionDraftIssue(draft({ hours: "336" }))).toBeNull();
    expect(auctionDraftIssue(draft({ hours: "0.5" }))).toBe("TOO_SHORT");
    expect(auctionDraftIssue(draft({ hours: "337" }))).toBe("TOO_LONG");
    expect(auctionDraftIssue(draft({ hours: "" }))).toBe("TOO_SHORT");
  });
});

describe("alta de subasta · argumentos de la llamada", () => {
  it("empieza ahora y termina según la duración", () => {
    const call = auctionDraftToCall(draft({ hours: "24" }), 1_000);
    expect(call).toEqual({
      tokenId: 20120267001n,
      reserveWei: 100_000_000_000_000_000n,
      startTime: 1_000n,
      endTime: 1_000n + 86_400n,
    });
  });

  it("un borrador inválido no produce llamada (no se firma algo condenado)", () => {
    expect(auctionDraftToCall(draft({ hours: "0" }), 1_000)).toBeNull();
    expect(auctionDraftToCall(draft({ reserveEth: "" }), 1_000)).toBeNull();
  });
});
