/**
 * Clasificación PURA del fallo de `switchChain` (RF-04), sin acoplar React/wagmi → testeable.
 * EIP-1193: `4902` = la cadena no está añadida en la wallet; `4001` = el usuario rechazó.
 * El componente traduce la clave resultante a copy accionable.
 */
export type SwitchChainError = "chainNotAdded" | "rejected" | "failed";

interface ProviderErrorLike {
  readonly code?: number;
  readonly name?: string;
  readonly cause?: ProviderErrorLike;
}

/**
 * Recorre la cadena de `cause` (wagmi/viem anidan el error EIP-1193) y devuelve una clave
 * estable. wagmi v2 suele AÑADIR la cadena automáticamente cuando `activeChain` trae
 * `rpcUrls`; aun así, si la wallet no la añade o el usuario no aprueba, lo reportamos.
 */
export function classifySwitchChainError(error: unknown): SwitchChainError {
  for (let e = error as ProviderErrorLike | undefined; e; e = e.cause) {
    if (e.code === 4902) return "chainNotAdded";
    if (e.code === 4001 || e.name === "UserRejectedRequestError") return "rejected";
  }
  return "failed";
}
