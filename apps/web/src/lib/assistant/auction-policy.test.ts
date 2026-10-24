import { describe, expect, it } from "vitest";
import {
  HOTEL_ONLY_AUCTION_NOTE,
  asksToAuctionOwnNight,
  ensureHotelOnlyAuctionGuidance,
} from "./auction-policy";

describe("solo el hotel subasta — guarda determinista (pool E2E 2026-10-24)", () => {
  it("detecta la intención de subastar una noche propia", () => {
    expect(asksToAuctionOwnNight("Quiero subastar dos de mis noches reservadas")).toBe(true);
    expect(asksToAuctionOwnNight("¿puedo subastar mi suite del 14 de noviembre?")).toBe(true);
    expect(asksToAuctionOwnNight("subastar la noche que compré en la 201")).toBe(true);
  });

  it("no se activa cuando el usuario solo quiere PUJAR en una subasta del hotel", () => {
    expect(asksToAuctionOwnNight("¿cómo pujo en la subasta de la suite 203?")).toBe(false);
    expect(asksToAuctionOwnNight("¿qué subastas hay abiertas?")).toBe(false);
  });

  it("antepone la aclaración si el modelo no la dio", () => {
    const reply = "Para subastar tus noches, ve a la sección de reventa y listalas.";
    const guarded = ensureHotelOnlyAuctionGuidance(reply, "Quiero subastar dos de mis noches");
    expect(guarded.startsWith(HOTEL_ONLY_AUCTION_NOTE)).toBe(true);
    expect(guarded).toContain(reply);
  });

  it("no duplica la aclaración si el modelo ya la dio", () => {
    const reply = "No puedes subastar tus noches: solo el hotel abre subastas. Puedes revenderlas en «Mis noches».";
    expect(ensureHotelOnlyAuctionGuidance(reply, "Quiero subastar mis noches")).toBe(reply);
  });

  it("no toca respuestas a preguntas que no son de subastar una noche propia", () => {
    expect(ensureHotelOnlyAuctionGuidance("Ve a Subastas y puja.", "¿cómo pujo?")).toBe("Ve a Subastas y puja.");
    expect(ensureHotelOnlyAuctionGuidance("Nada", undefined)).toBe("Nada");
  });
});
