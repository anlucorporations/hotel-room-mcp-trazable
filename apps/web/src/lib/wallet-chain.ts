import { numberToHex, type Chain } from "viem";

/**
 * Añadir/cambiar la red del Anvil en la billetera (Fase 3, 2026-10-05).
 *
 * Problema: la cadena del proyecto (**chainId 31337**) no está en el catálogo de MetaMask, así que
 * `wallet_switchEthereumChain` falla con **4902** («Unrecognized chain ID»). La solución es el
 * *fallback* estándar: añadirla con `wallet_addEthereumChain` (nombre, chainId en hex, RPC, símbolo y
 * explorer si existe) y reintentar el cambio; así el usuario ve **un solo diálogo** por red nueva.
 *
 * Es un ayudante puro sobre un proveedor EIP-1193 (inyectable), por eso se prueba sin navegador.
 */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

/** Parámetros de `wallet_addEthereumChain` derivados de la cadena activa. */
export interface AddChainParams {
  readonly chainId: `0x${string}`;
  readonly chainName: string;
  readonly nativeCurrency: { readonly name: string; readonly symbol: string; readonly decimals: number };
  readonly rpcUrls: readonly string[];
  readonly blockExplorerUrls?: readonly string[];
}

export function chainParamsFor(chain: Chain): AddChainParams {
  const explorer = chain.blockExplorers?.default?.url;
  const params: AddChainParams = {
    chainId: numberToHex(chain.id),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [...chain.rpcUrls.default.http],
  };
  return explorer ? { ...params, blockExplorerUrls: [explorer] } : params;
}

/** Código EIP-1193 de «el usuario rechazó» (el 4902 de «cadena desconocida» se trata como
 * «la billetera no tiene la red» y se resuelve con `wallet_addEthereumChain`). */
const USER_REJECTED = 4001;

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

export type EnsureChainResult = "already" | "switched" | "added" | "rejected" | "failed";

/**
 * Deja la billetera en `chain`: si ya está, no hace nada; si no la conoce, la **añade** y reintenta.
 * Nunca lanza: devuelve el desenlace para que la UI decida el mensaje.
 */
export async function ensureWalletChain(provider: Eip1193Provider, chain: Chain): Promise<EnsureChainResult> {
  const target = numberToHex(chain.id);
  try {
    const current = await provider.request({ method: "eth_chainId" });
    if (typeof current === "string" && current.toLowerCase() === target.toLowerCase()) return "already";
  } catch {
    // Sin `eth_chainId` seguimos adelante: el cambio de red decidirá.
  }

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
    return "switched";
  } catch (error: unknown) {
    if (errorCode(error) === USER_REJECTED) return "rejected";
    // Cualquier otro fallo (4902 incluido) se trata como «la billetera no tiene la red».
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [chainParamsFor(chain)] });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
      return "added";
    } catch (addError: unknown) {
      return errorCode(addError) === USER_REJECTED ? "rejected" : "failed";
    }
  }
}
