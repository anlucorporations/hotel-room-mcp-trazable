import { describe, expect, it } from "vitest";
import {
  isMetaMaskConnector,
  METAMASK_RDNS,
  pickPreferredConnector,
  visibleWalletConnectors,
  walletConnectProjectId,
  walletPlan,
} from "./wallet-connectors";

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

/**
 * Regresión (2026-10-06): MetaMask **no se reconocía**.
 *
 *   · `@wagmi/core` omite el descubrimiento EIP-6963 cuando `ssr: true` (su lista de conectores se
 *     construye con `if (!ssr && mipd)`), que era el caso de `providers.tsx`.
 *   · Aunque la cartera se descubriera, `connect()` buscaba `id === "metaMask"`: el id real de la
 *     cartera descubierta es su **RDNS** (`io.metamask`), así que la búsqueda nunca acertaba.
 *
 * Estas pruebas fijan el criterio de elección y el filtrado del selector.
 */
describe("elección de la cartera (MetaMask por RDNS)", () => {
  const injected = { id: "injected", name: "Injected" };
  const coinbase = { id: "coinbaseWallet", name: "Coinbase Wallet" };
  const metaMask = { id: METAMASK_RDNS, name: "MetaMask", rdns: METAMASK_RDNS };
  const rabby = { id: "io.rabby", name: "Rabby", rdns: "io.rabby" };

  it("reconoce a MetaMask por id RDNS, por rdns o por nombre", () => {
    expect(isMetaMaskConnector(metaMask)).toBe(true);
    expect(isMetaMaskConnector({ id: "x", name: "MetaMask" })).toBe(true);
    expect(isMetaMaskConnector({ id: "x", rdns: ["io.metamask"] })).toBe(true);
    expect(isMetaMaskConnector(rabby)).toBe(false);
  });

  it("prefiere MetaMask aunque no sea el primero de la lista", () => {
    expect(pickPreferredConnector([injected, coinbase, metaMask])?.id).toBe(METAMASK_RDNS);
    expect(pickPreferredConnector([rabby, metaMask])?.id).toBe(METAMASK_RDNS);
  });

  it("sin MetaMask cae al `injected` de respaldo y, si no, al primero", () => {
    expect(pickPreferredConnector([coinbase, injected])?.id).toBe("injected");
    expect(pickPreferredConnector([coinbase, rabby])?.id).toBe("coinbaseWallet");
    expect(pickPreferredConnector([])).toBeUndefined();
  });

  it("oculta el `injected` genérico cuando el descubrimiento ya encontró carteras", () => {
    const list = visibleWalletConnectors([injected, coinbase, metaMask]);
    expect(list.map((c) => c.id)).toEqual(["coinbaseWallet", METAMASK_RDNS]);
  });

  it("mantiene el `injected` como único respaldo si no se descubrió ninguna cartera", () => {
    const list = visibleWalletConnectors([injected, coinbase]);
    expect(list.map((c) => c.id)).toEqual(["injected", "coinbaseWallet"]);
  });
});
