import { afterEach, describe, expect, it } from "vitest";
import { createConfig } from "wagmi";
import { getConnectors } from "wagmi/actions";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

/**
 * Regresión (2026-10-06): **MetaMask no se reconocía**.
 *
 * `@wagmi/core` construye la lista de conectores así:
 *
 * ```js
 * const mipd = typeof window !== 'undefined' && multiInjectedProviderDiscovery ? createMipd() : undefined;
 * const connectors = createStore(() => {
 *   ...declarados...
 *   if (!ssr && mipd) { ...añade los descubiertos por EIP-6963... }   // ← ojo al `!ssr`
 * });
 * ```
 *
 * Con `ssr: true` (lo que hacía `providers.tsx`) el descubrimiento **nunca** se ejecuta: MetaMask no
 * aparece por su nombre ni con su id (`io.metamask`) y solo queda el conector genérico «Injected».
 *
 * Estas pruebas simulan el navegador (un `window` mínimo con `addEventListener`/`dispatchEvent`, que
 * es todo lo que usa `mipd`) y anuncian un proveedor EIP-6963 como lo hace MetaMask.
 */

const chain = defineChain({
  id: 31337,
  name: "Anvil dev",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:1"] } },
});

type Listener = (event: { type: string; detail?: unknown }) => void;

/** `window` mínimo suficiente para `mipd` (nada de DOM real). */
function installFakeWindow(): { dispatch: (event: { type: string; detail?: unknown }) => void } {
  const listeners = new Map<string, Set<Listener>>();
  const addEventListener = (type: string, handler: Listener): void => {
    const set = listeners.get(type) ?? new Set<Listener>();
    set.add(handler);
    listeners.set(type, set);
  };
  const removeEventListener = (type: string, handler: Listener): void => {
    listeners.get(type)?.delete(handler);
  };
  const dispatchEvent = (event: { type: string; detail?: unknown }): boolean => {
    for (const handler of listeners.get(event.type) ?? []) handler(event);
    return true;
  };
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener,
    removeEventListener,
    dispatchEvent,
  };
  return { dispatch: dispatchEvent };
}

/** Anuncia un proveedor EIP-6963 como MetaMask, respondiendo además a `eip6963:requestProvider`. */
function announceMetaMask(dispatch: (event: { type: string; detail?: unknown }) => void): void {
  const detail = Object.freeze({
    info: Object.freeze({
      uuid: "11111111-2222-3333-4444-555555555555",
      name: "MetaMask",
      icon: "data:image/svg+xml;base64,PHN2Zy8+",
      rdns: "io.metamask",
    }),
    provider: { request: async () => null },
  });
  // Igual que una cartera real: responde a la petición de anuncio y se anuncia de entrada.
  (globalThis as unknown as { window: { addEventListener: (t: string, h: Listener) => void } }).window.addEventListener(
    "eip6963:requestProvider",
    () => dispatch({ type: "eip6963:announceProvider", detail }),
  );
  dispatch({ type: "eip6963:announceProvider", detail });
}

function makeConfig(ssr: boolean) {
  return createConfig({
    chains: [chain],
    connectors: [injected({ shimDisconnect: true })],
    multiInjectedProviderDiscovery: true,
    transports: { [chain.id]: { type: "http", url: "http://127.0.0.1:1" } as never },
    ssr,
  });
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("descubrimiento EIP-6963 de la cartera (MetaMask)", () => {
  it("con `ssr: false` descubre MetaMask y usa su RDNS como id", () => {
    const { dispatch } = installFakeWindow();
    announceMetaMask(dispatch);

    const ids = getConnectors(makeConfig(false)).map((connector) => connector.id);
    expect(ids).toContain("io.metamask");
  });

  it("con `ssr: true` (el defecto anterior) NO descubre ninguna cartera", () => {
    const { dispatch } = installFakeWindow();
    announceMetaMask(dispatch);

    const ids = getConnectors(makeConfig(true)).map((connector) => connector.id);
    expect(ids).not.toContain("io.metamask");
    // Solo sobrevive el `injected` genérico: la cartera no se reconoce.
    expect(ids).toEqual(["injected"]);
  });
});
