/**
 * Clasifica el motivo de fallo de una transacción de escritura para mostrar feedback al
 * usuario, sin acoplar i18n ni desmontar el formulario. Función pura → testeable y reutilizable
 * entre flujos (mint, compra, listado…). El componente traduce la clave resultante.
 */
export type TxErrorKind = "rejected" | "failed";

interface ErrorLike {
  readonly name?: string;
  readonly code?: number;
  readonly cause?: ErrorLike;
}

/**
 * `true` si el error proviene de que el usuario rechazó la firma en la wallet
 * (viem `UserRejectedRequestError`, EIP-1193 code 4001), en cualquier nivel de `cause`.
 */
function isUserRejection(error: ErrorLike | undefined): boolean {
  for (let e = error; e; e = e.cause) {
    if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
  }
  return false;
}

/** Traduce un error de wagmi/viem a una clave estable de mensaje (sin texto literal). */
export function classifyTxError(error: unknown): TxErrorKind {
  return isUserRejection(error as ErrorLike) ? "rejected" : "failed";
}
