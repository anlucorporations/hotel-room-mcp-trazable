/** Estado de una transacción de escritura, derivado de los hooks de wagmi (DRY). */
export type TxStatus = "idle" | "signing" | "pending" | "confirmed" | "reverted";

export interface TxSignals {
  readonly isPending: boolean;
  readonly hash: `0x${string}` | undefined;
  readonly isConfirming: boolean;
  readonly isConfirmed: boolean;
  readonly isReverted: boolean;
}

export function deriveTxStatus(signals: TxSignals): TxStatus {
  if (signals.isPending) return "signing";
  if (signals.hash && signals.isConfirming) return "pending";
  if (signals.isConfirmed) return "confirmed";
  if (signals.hash && signals.isReverted) return "reverted";
  return "idle";
}
