import "server-only";
import type { Address } from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";

/**
 * Titularidad **on-chain** de una noche (M7, cierre de la reserva de la verificación de M5).
 *
 * Contexto: la titularidad del pase se comprobaba contra el índice off-chain
 * (`nfts.current_owner`), que es un espejo escrito por el listener. Un índice retrasado no solo
 * muestra datos viejos: decidía **a quién se le entrega el resguardo** y con qué wallet se emitía
 * el JWS (`guestWallet`). Es decir, una venta recién confirmada podía devolver un pase con el
 * propietario anterior.
 *
 * La cadena es la autoridad (`ownerOf`, D-02) y el índice queda como lo que es: un atajo de
 * lectura y un detector de desincronización.
 *
 * Resultado de tres estados, y el tercero NO se colapsa en ninguno de los otros dos:
 *   - `{ status: "owner", owner }`   → el contrato responde con un propietario.
 *   - `{ status: "missing" }`        → el contrato responde que ese token NO existe (revert de
 *     `ownerOf`: token quemado o inexistente). Es una respuesta, no un fallo.
 *   - `{ status: "unavailable" }`    → no se pudo consultar la cadena (RPC caído/timeout): no se
 *     puede afirmar nada, así que se falla en cerrado y NO se emite el pase.
 */
export type OnChainOwnership =
  | { readonly status: "owner"; readonly owner: Address }
  | { readonly status: "missing" }
  | { readonly status: "unavailable"; readonly reason: string };

/** Interfaz mínima de lectura (DIP): los tests inyectan un lector falso, sin red. */
export interface OwnershipReader {
  ownerOf(tokenId: bigint): Promise<Address>;
}

/** Lector real: `ownerOf` del contrato canónico por RPC. */
export const viemOwnershipReader: OwnershipReader = {
  ownerOf: (tokenId) =>
    serverPublicClient().readContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    }),
};

/**
 * Distingue «el contrato respondió que no hay token» de «no se pudo preguntar».
 *
 * viem envuelve el revert en `ContractFunctionExecutionError` (con la causa original dentro), pero
 * un fallo de red/timeout NO trae revert: esa diferencia es la que separa 404/401 de 503.
 */
function isContractRevert(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  if (name === "ContractFunctionRevertedError") return true;
  // `ContractFunctionExecutionError` con causa de revert = el contrato contestó.
  const cause = (error as { cause?: { name?: unknown } }).cause;
  return (
    name === "ContractFunctionExecutionError" &&
    typeof cause === "object" &&
    cause !== null &&
    cause.name === "ContractFunctionRevertedError"
  );
}

/** Lee la titularidad on-chain, clasificando el fallo en «no existe» frente a «no se pudo leer». */
export async function readOnChainOwnership(
  tokenId: string,
  reader: OwnershipReader = viemOwnershipReader,
): Promise<OnChainOwnership> {
  let id: bigint;
  try {
    id = BigInt(tokenId);
  } catch {
    return { status: "missing" };
  }

  try {
    const owner = await reader.ownerOf(id);
    return { status: "owner", owner };
  } catch (error: unknown) {
    if (isContractRevert(error)) return { status: "missing" };
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
