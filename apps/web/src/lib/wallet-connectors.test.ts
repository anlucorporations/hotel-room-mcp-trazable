import { describe, expect, it } from "vitest";
import { walletConnectProjectId, walletPlan } from "./wallet-connectors";

/**
 * Guardián del plan de conectores (Fase 3): **cualquier billetera** funciona y WalletConnect está
 * apagado salvo que se configure. Lo que se fija aquí:
 *   1. Las inyectadas (EIP-6963) y Coinbase están SIEMPRE.
 *   2. WalletConnect solo entra con `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` no vacía.
 *   3. Una variable vacía o con espacios NO activa el conector (no se inventa projectId).
 */
describe("plan de conectores de billetera", () => {
  it("incluye inyectadas y Coinbase siempre", () => {
    expect(walletPlan({})).toEqual(["injected", "coinbase"]);
  });

  it("añade WalletConnect cuando hay projectId", () => {
    expect(walletPlan({ walletConnectProjectId: "abc123" })).toEqual(["injected", "coinbase", "walletconnect"]);
  });

  it("no activa WalletConnect con variable vacía o solo espacios", () => {
    expect(walletPlan({ walletConnectProjectId: "" })).not.toContain("walletconnect");
    expect(walletPlan({ walletConnectProjectId: "   " })).not.toContain("walletconnect");
  });

  it("sanea el projectId (trim) y devuelve undefined si no hay", () => {
    expect(walletConnectProjectId("  pid  ")).toBe("pid");
    expect(walletConnectProjectId("")).toBeUndefined();
    expect(walletConnectProjectId(undefined)).toBeUndefined();
  });
});
