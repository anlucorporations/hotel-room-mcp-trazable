import { describe, expect, it } from "vitest";
import type { TxStatus } from "@/components/tx/txStatus";
import { canSignPurchase } from "./canSignPurchase";

/**
 * Guarda del botón «Firmar» (D3). Prueba pura: los dos flujos de compra (catálogo y asistente)
 * comparten esta única verdad.
 */
describe("canSignPurchase · D3 (anti-doble-envío y fallo cerrado)", () => {
  it("exige wallet lista y tx re-verificada", () => {
    expect(canSignPurchase({ walletReady: false, verified: true, status: "idle" })).toBe(false);
    expect(canSignPurchase({ walletReady: true, verified: false, status: "idle" })).toBe(false);
    expect(canSignPurchase({ walletReady: true, verified: true, status: "idle" })).toBe(true);
  });

  it("bloquea la firma mientras hay una operación en curso (anti-doble-envío)", () => {
    for (const status of ["signing", "pending"] as const) {
      expect(canSignPurchase({ walletReady: true, verified: true, status }), status).toBe(false);
    }
  });

  it("no habilita la firma en estados terminales que no admiten firma directa", () => {
    for (const status of ["confirmed", "unverifiable"] as const) {
      expect(canSignPurchase({ walletReady: true, verified: true, status }), status).toBe(false);
    }
  });

  it("tras un revert SÍ permite reintentar (el reintento pasa por «Revisar»)", () => {
    expect(canSignPurchase({ walletReady: true, verified: true, status: "reverted" })).toBe(true);
  });

  it("es falsa para todo estado si la wallet no está lista o la tx no está verificada", () => {
    const statuses: TxStatus[] = ["idle", "signing", "pending", "confirmed", "reverted", "unverifiable"];
    for (const status of statuses) {
      expect(canSignPurchase({ walletReady: false, verified: true, status }), status).toBe(false);
      expect(canSignPurchase({ walletReady: true, verified: false, status }), status).toBe(false);
    }
  });
});
