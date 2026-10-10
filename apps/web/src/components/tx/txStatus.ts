/** Estado de una transacción de escritura, derivado de los hooks de wagmi (DRY). */
export type TxStatus = "idle" | "signing" | "pending" | "confirmed" | "reverted" | "unverifiable";

export interface TxSignals {
  readonly isPending: boolean;
  readonly hash: `0x${string}` | undefined;
  readonly isConfirming: boolean;
  readonly isConfirmed: boolean;
  readonly isReverted: boolean;
  /**
   * La transacción pudo difundirse, pero **no se pudo leer el recibo** (fallo de red/RPC), así
   * que no consta que revirtiera. Es un estado propio y honesto: ni éxito ni fallo (D5).
   *
   * Sin esta señal, cualquier error de la consulta del recibo se colapsaba en `reverted`, y un
   * corte transitorio del RPC decía «No se completó la reserva» de una compra que sí se asentó
   * (y que después aparecía en «Mis noches»). Opcional: los flujos que no la pasan conservan el
   * comportamiento anterior.
   */
  readonly isUnverifiable?: boolean;
}

export function deriveTxStatus(signals: TxSignals): TxStatus {
  if (signals.isPending) return "signing";
  if (signals.hash && signals.isConfirming) return "pending";
  if (signals.isConfirmed) return "confirmed";
  if (signals.hash && signals.isReverted) return "reverted";
  if (signals.hash && signals.isUnverifiable) return "unverifiable";
  return "idle";
}
