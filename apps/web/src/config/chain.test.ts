import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ChainConfig from "./chain";

/**
 * Selección de red del cliente (objetivo 2026-10-13: «usar Besu en vez de Anvil»).
 *
 * La red del proyecto es **Besu** (testnet de Codecrypto, `chainId 81234`); Anvil solo es el
 * espejo local de desarrollo/CI con el **mismo** `chainId`. Por eso la cadena se decide por la
 * URL del RPC (localhost ⇒ Anvil) y no por el `chainId`, que es compartido.
 */

const MANAGED = ["NEXT_PUBLIC_RPC_URL", "NEXT_PUBLIC_NETWORK", "NEXT_PUBLIC_CHAIN_ID"] as const;
const saved: Record<string, string | undefined> = {};

function setEnv(values: Partial<Record<(typeof MANAGED)[number], string | undefined>>): void {
  for (const key of MANAGED) {
    if (!(key in saved)) saved[key] = process.env[key];
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Reimporta el módulo para que vuelva a resolver la cadena con el entorno actual. */
async function loadChain(): Promise<typeof ChainConfig> {
  vi.resetModules();
  return import("./chain");
}

afterEach(() => {
  for (const key of MANAGED) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("config/chain · Besu por defecto, Anvil solo en local", () => {
  it("con RPC remoto (Besu) la cadena activa es la red del proyecto", async () => {
    setEnv({
      NEXT_PUBLIC_RPC_URL: "https://besu.alumnos.codecrypto.academy",
      NEXT_PUBLIC_NETWORK: undefined,
      NEXT_PUBLIC_CHAIN_ID: "81234",
    });

    const { activeChain, isLocalRpc } = await loadChain();

    expect(isLocalRpc("https://besu.alumnos.codecrypto.academy")).toBe(false);
    expect(activeChain.id).toBe(81234);
    expect(activeChain.name).toBe("Codecrypto Besu");
    expect(activeChain.rpcUrls.default.http[0]).toBe("https://besu.alumnos.codecrypto.academy");
  });

  it("con RPC local se usa el espejo Anvil (mismo chainId)", async () => {
    setEnv({
      NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
      NEXT_PUBLIC_NETWORK: undefined,
      NEXT_PUBLIC_CHAIN_ID: "81234",
    });

    const { activeChain } = await loadChain();

    expect(activeChain.id).toBe(81234);
    expect(activeChain.name).toContain("Anvil");
    expect(activeChain.rpcUrls.default.http[0]).toBe("http://127.0.0.1:8545");
  });

  it("NEXT_PUBLIC_NETWORK=anvil fuerza el modo desarrollo aunque el RPC sea remoto", async () => {
    setEnv({
      NEXT_PUBLIC_RPC_URL: "https://besu.alumnos.codecrypto.academy",
      NEXT_PUBLIC_NETWORK: "anvil",
      NEXT_PUBLIC_CHAIN_ID: "81234",
    });

    const { activeChain } = await loadChain();

    expect(activeChain.name).toContain("Anvil");
  });

  it("una chainId distinta (p. ej. Polygon) se declara por entorno", async () => {
    setEnv({
      NEXT_PUBLIC_RPC_URL: "https://polygon-rpc.example",
      NEXT_PUBLIC_NETWORK: undefined,
      NEXT_PUBLIC_CHAIN_ID: "137",
    });

    const { activeChain } = await loadChain();

    expect(activeChain.id).toBe(137);
    expect(activeChain.name).toContain("137");
  });
});
