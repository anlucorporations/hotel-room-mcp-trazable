import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { buildPurchaseTxData } from "@hotel/shared/domain";
import messages from "../../../messages/es.json";
import type { PreparedPurchase } from "@/lib/assistant/types";

/**
 * Presentación de la **reserva de una estancia** (petición del responsable, 2026-10-13).
 *
 * Se renderiza en servidor la cabecera y la numeración de las noches; el handoff de cada noche
 * (hooks de cartera y red) se sustituye por un doble: aquí se comprueba el **formato** —total,
 * «Noche i de n», habitación y fecha—, no la firma.
 */
vi.mock("./PurchaseHandoff", () => ({
  PurchaseHandoff: () => null,
}));

import { StayHandoff } from "./StayHandoff";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

const purchase = (tokenId: string): PreparedPurchase => ({
  tokenId,
  tx: buildPurchaseTxData({
    tokenId: BigInt(tokenId),
    priceWei: 50_000_000_000_000_000n,
    saleType: "PRIMARY",
    contractAddress: CONTRACT,
    chainId: 81234,
  }),
});

function render(purchases: readonly PreparedPurchase[]): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "es",
      messages,
      children: createElement(StayHandoff, { purchases }),
    }),
  );
}

describe("StayHandoff · la estancia se presenta como una reserva completa", () => {
  it("numera las noches, enseña la habitación y la fecha, y suma el total", () => {
    const html = render([
      purchase("10220260615"),
      purchase("10220260616"),
      purchase("10220260617"),
    ]);

    expect(html).toContain("Estancia de 3 noches");
    expect(html).toContain("Total: 0.15 ETH");
    expect(html).toContain("Noche 1 de 3");
    expect(html).toContain("Noche 3 de 3");
    expect(html).toContain("Habitación 102");
    expect(html).toContain("20260615");
    expect(html).toContain('data-testid="stay-night-1"');
    expect(html).toContain('data-testid="stay-night-3"');
    // Se avisa de que la firma es una por noche, sin prometer una firma única.
    expect(html).toContain("una vez por noche");
  });

  it("sin compras no pinta panel", () => {
    expect(render([])).toBe("");
  });
});
