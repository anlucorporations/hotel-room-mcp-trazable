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

describe("ramas defensivas de la cadena", () => {
  it("no añade explorador cuando la cadena no lo declara", () => {
    const sinExplorador = { ...activeChain, blockExplorers: undefined } as typeof activeChain;
    expect(chainParamsFor(sinExplorador).blockExplorerUrls).toBeUndefined();
  });

  it("incluye el explorador cuando la cadena lo declara", () => {
    const conExplorador = {
      ...activeChain,
      blockExplorers: { default: { name: "explorer", url: "https://explorer.example" } },
    } as typeof activeChain;
    expect(chainParamsFor(conExplorador).blockExplorerUrls).toEqual(["https://explorer.example"]);
  });

  it("si la billetera no responde a `eth_chainId`, sigue adelante y cambia de red", async () => {
    const provider = fakeProvider({
      eth_chainId: () => {
        throw new Error("no soportado");
      },
      wallet_switchEthereumChain: () => undefined,
    });

    await expect(ensureWalletChain(provider, activeChain)).resolves.toBe("switched");
  });

  it("trata un código de error que no es número como «no es rechazo del usuario»", async () => {
    // `errorCode` exige un número: con una cadena, la billetera no lo reconoce como rechazo y se
    // intenta añadir la red. El primer cambio falla; tras añadirla, el segundo funciona.
    let intentos = 0;
    const provider = fakeProvider({
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        intentos += 1;
        if (intentos === 1) throw { code: "4902" };
        return undefined;
      },
      wallet_addEthereumChain: () => undefined,
    });

    await expect(ensureWalletChain(provider, activeChain)).resolves.toBe("added");
  });

  it("devuelve 'rejected' si el usuario rechaza añadir la red", async () => {
    const provider = fakeProvider({
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        throw { code: 4902 };
      },
      wallet_addEthereumChain: () => {
        throw { code: 4001 };
      },
    });

    await expect(ensureWalletChain(provider, activeChain)).resolves.toBe("rejected");
  });

  it("devuelve 'failed' si la billetera no acepta ni añadir la red", async () => {
    const provider = fakeProvider({
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        throw { code: 4902 };
      },
      wallet_addEthereumChain: () => {
        throw new Error("sin permisos");
      },
    });

    await expect(ensureWalletChain(provider, activeChain)).resolves.toBe("failed");
  });
});
