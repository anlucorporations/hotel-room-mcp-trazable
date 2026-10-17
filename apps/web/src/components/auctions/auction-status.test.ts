import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ZERO_ADDRESS } from "@hotel/shared/domain";
import messages from "../../../messages/es.json";
import { AuctionStatus } from "./AuctionStatus";
import type { AuctionItem } from "@/lib/auction-view";

/**
 * Estado de la subasta (C2 · RF-13): lo que ve el cliente antes de decidir su puja. Se renderiza en
 * servidor para comprobar que la fase, la cuenta atrás y las tres cifras salen con su etiqueta y su
 * moneda, y que no se muestran importes de una puja inexistente.
 */
function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "es", messages, children: node }),
  );
}

const BIDDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function item(overrides: Partial<AuctionItem> = {}): AuctionItem {
  return {
    tokenId: "20120267001",
    room: 201,
    dateYYYYMMDD: 20_267_001,
    roomType: "suite",
    seller: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    phase: "OPEN",
    reservePriceWei: "100000000000000000", // 0,1
    highestBidWei: "0",
    highestBidder: ZERO_ADDRESS,
    minNextBidWei: "100000000000000000",
    startTimeSeconds: 1_000,
    endTimeSeconds: 4_600,
    timeLeftSeconds: 3_600,
    coverUrl: null,
    isPremium: true,
    ...overrides,
  };
}

describe("AuctionStatus · lo que ve el pujante", () => {
  it("una subasta abierta muestra fase, cuenta atrás y las tres cifras en ETH", () => {
    const html = render(createElement(AuctionStatus, { item: item(), phase: "OPEN", leftSeconds: 3_600 }));

    expect(html).toContain("Abierta");
    expect(html).toContain("Cierra en");
    expect(html).toContain("1 h");
    expect(html).toContain("Reserva");
    expect(html).toContain("0.1 ETH");
    expect(html).toContain("Sin pujas todavía");
    expect(html).toContain("Puja mínima");
    expect(html).toContain('data-phase="OPEN"');
  });

  it("con pujas enseña la mejor puja en lugar del texto vacío", () => {
    const html = render(
      createElement(AuctionStatus, {
        item: item({ highestBidder: BIDDER, highestBidWei: "200000000000000000", minNextBidWei: "210000000000000000" }),
        phase: "OPEN",
        leftSeconds: 60,
      }),
    );

    expect(html).not.toContain("Sin pujas todavía");
    expect(html).toContain("0.2 ETH");
    expect(html).toContain("0.21 ETH");
    expect(html).toContain("1 min");
  });

  it("cerrada no pinta cuenta atrás; liquidada lo dice", () => {
    const closed = render(
      createElement(AuctionStatus, { item: item(), phase: "CLOSED", leftSeconds: 0 }),
    );
    expect(closed).toContain("Cerrada · pendiente de liquidar");
    expect(closed).not.toContain("Cierra en");

    const settled = render(
      createElement(AuctionStatus, { item: item({ phase: "SETTLED" }), phase: "SETTLED", leftSeconds: 0 }),
    );
    expect(settled).toContain("Liquidada");
  });

  it("la etiqueta de suite es solo para las premium (RF-13)", () => {
    const suite = render(createElement(AuctionStatus, { item: item(), phase: "OPEN", leftSeconds: 60 }));
    expect(suite).toContain("Suite");

    const doble = render(
      createElement(AuctionStatus, {
        item: item({ roomType: "doble", room: 130, isPremium: false }),
        phase: "OPEN",
        leftSeconds: 60,
      }),
    );
    expect(doble).not.toContain(">Suite<");
  });
});
