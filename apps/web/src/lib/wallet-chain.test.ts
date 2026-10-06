import { describe, expect, it } from "vitest";
import { chainParamsFor, ensureWalletChain, type Eip1193Provider } from "./wallet-chain";
import { activeChain } from "@/config/chain";

/** Proveedor EIP-1193 falso que registra las llamadas y responde según un guion. */
function fakeProvider(handlers: Record<string, () => Promise<unknown> | unknown>): Eip1193Provider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async request({ method }: { method: string }) {
      calls.push(method);
      const handler = handlers[method];
      if (!handler) throw new Error(`método no esperado: ${method}`);
      return handler();
    },
  };
}

const reject = (code: number) => () => Promise.reject(Object.assign(new Error(`rejected ${code}`), { code }));

describe("añadir / cambiar la red de la billetera", () => {
  it("deriva los parámetros de la cadena activa (chainId en hex + RPC)", () => {
    const params = chainParamsFor(activeChain);
    expect(params.chainId).toBe(`0x${activeChain.id.toString(16)}`);
    expect(params.rpcUrls.length).toBeGreaterThan(0);
    expect(params.nativeCurrency.symbol).toBe("ETH");
  });

  it("no hace nada si la billetera ya está en la red", async () => {
    const provider = fakeProvider({ eth_chainId: () => `0x${activeChain.id.toString(16)}` });
    expect(await ensureWalletChain(provider, activeChain)).toBe("already");
    expect(provider.calls).toEqual(["eth_chainId"]);
  });

  it("cambia de red cuando la billetera ya la conoce", async () => {
    const provider = fakeProvider({ eth_chainId: () => "0x1", wallet_switchEthereumChain: () => null });
    expect(await ensureWalletChain(provider, activeChain)).toBe("switched");
    expect(provider.calls).toEqual(["eth_chainId", "wallet_switchEthereumChain"]);
  });

  it("con 4902 añade la red y reintenta el cambio", async () => {
    const provider = fakeProvider({
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        // El primer intento falla con 4902; el segundo (tras añadir) funciona.
        if (provider.calls.filter((c) => c === "wallet_switchEthereumChain").length === 1) return reject(4902)();
        return null;
      },
      wallet_addEthereumChain: () => null,
    });
    expect(await ensureWalletChain(provider, activeChain)).toBe("added");
    expect(provider.calls).toEqual(["eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
  });

  it("si el usuario rechaza, no insiste con la red", async () => {
    const provider = fakeProvider({ eth_chainId: () => "0x1", wallet_switchEthereumChain: reject(4001) });
    expect(await ensureWalletChain(provider, activeChain)).toBe("rejected");
    expect(provider.calls).not.toContain("wallet_addEthereumChain");
  });

  it("devuelve failed si añadir tampoco funciona", async () => {
    const provider = fakeProvider({
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: reject(4902),
      wallet_addEthereumChain: reject(-32603),
    });
    expect(await ensureWalletChain(provider, activeChain)).toBe("failed");
  });
});
