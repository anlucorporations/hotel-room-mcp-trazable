"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  decodeCooldownAvailableAt,
  deriveFaucetAvailability,
  type FaucetAvailability,
} from "@hotel/shared/domain";
import { faucetAbi } from "@hotel/shared/abi";
import { faucetAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseFaucetResult {
  /** El faucet está configurado (NEXT_PUBLIC_FAUCET_ADDRESS presente). */
  readonly enabled: boolean;
  /** Saldo del faucet por debajo del umbral de alerta (RNF-17). */
  readonly isLow: boolean;
  /** Disponibilidad derivada (lista / cooldown / sin fondos). */
  readonly availability: FaucetAvailability;
  /** Epoch (s) a partir del cual la wallet puede dispensar, o `null` si ya puede. */
  readonly cooldownUntil: number | null;
  /** `true` si se puede dispensar ahora mismo (lista y sin tx en curso). */
  readonly canDispense: boolean;
  /** Tx de dispensación en curso (firma o minado). */
  readonly isDispensing: boolean;
  readonly status: TxStatus;
  readonly txHash: `0x${string}` | undefined;
  /** Error de la tx, o el revert de cooldown decodificado a `availableAt` (epoch s). */
  readonly error: Error | null;
  dispense: () => void;
  reset: () => void;
}

/** Estado INERTE cuando el faucet no está configurado (oculta toda la UI sin ramas en la vista). */
const DISABLED: Omit<UseFaucetResult, "dispense" | "reset"> = {
  enabled: false,
  isLow: false,
  availability: { kind: "ready" },
  cooldownUntil: null,
  canDispense: false,
  isDispensing: false,
  status: "idle",
  txHash: undefined,
  error: null,
};

/**
 * Estado del faucet de pruebas (RF-21 / CU-PR-01, docs/SRS.md §9) para la wallet conectada. Responsabilidad
 * única: leer el estado on-chain (cooldown/saldo) y orquestar `dispense()`. Toda la lógica
 * pura (disponibilidad, decodificación del revert de cooldown) vive en `@hotel/shared`.
 *
 * Maneja `enabled=false` (faucet sin configurar) devolviendo estado inerte, de modo que el
 * componente puede renderizar sin condicionales frágiles.
 */
export function useFaucet(): UseFaucetResult {
  const enabled = faucetAddress !== null;
  const { address, isConnected } = useAccount();
  const readEnabled = enabled && isConnected && address !== undefined;

  // Cooldown por wallet: epoch (s) a partir del cual `address` puede volver a dispensar.
  const availableAtQuery = useReadContract({
    address: faucetAddress ?? undefined,
    abi: faucetAbi,
    functionName: "availableAt",
    args: address ? [address] : undefined,
    query: { enabled: readEnabled },
  });

  // ¿El faucet anda bajo de saldo? (alerta al operador, RNF-17).
  const lowQuery = useReadContract({
    address: faucetAddress ?? undefined,
    abi: faucetAbi,
    functionName: "lowBalance",
    query: { enabled },
  });

  // Cantidad por dispensación, para saber si el faucet tiene saldo para al menos una.
  const amountQuery = useReadContract({
    address: faucetAddress ?? undefined,
    abi: faucetAbi,
    functionName: "amount",
    query: { enabled },
  });

  // Saldo del faucet: si no llega a `amount`, está vacío (no puede dispensar).
  const faucetBalance = useBalance({
    address: faucetAddress ?? undefined,
    query: { enabled },
  });

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  // Reloj CLIENT-ONLY para el cálculo de cooldown. `Date.now()` NO debe llamarse en render
  // (impuro + mismatch de hidratación SSR: provocaba un re-render/parpadeo del subárbol del
  // WalletBar). Se inicializa a `null` (server y primer render cliente coinciden → sin mismatch)
  // y se fija en un efecto, refrescándose cada 30 s para mantener vigente la cuenta atrás.
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowSec(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const status = deriveTxStatus({
    isPending,
    hash: txHash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });
  const isDispensing = status === "signing" || status === "pending";

  const availability = useMemo<FaucetAvailability>(() => {
    const availableAt = Number(availableAtQuery.data ?? 0n);
    const amount = amountQuery.data;
    const balance = faucetBalance.data?.value;
    const isEmpty =
      amount !== undefined && balance !== undefined ? balance < amount : false;
    // El «ahora» se inyecta desde el reloj client-only (no se llama `Date.now()` en render).
    // Antes de que el efecto fije la hora (`nowSec === null`), usamos `availableAt` como ahora,
    // de modo que el primer paint nunca muestra un cooldown espurio (y server==cliente).
    return deriveFaucetAvailability(
      { availableAt, isLow: Boolean(lowQuery.data), isEmpty },
      nowSec ?? availableAt,
    );
  }, [availableAtQuery.data, amountQuery.data, faucetBalance.data?.value, lowQuery.data, nowSec]);

  const cooldownUntil = availability.kind === "cooldown" ? availability.availableAt : null;
  const canDispense = enabled && isConnected && availability.kind === "ready" && !isDispensing;

  const dispense = useCallback(() => {
    if (faucetAddress === null) return;
    writeContract({ address: faucetAddress, abi: faucetAbi, functionName: "dispense" });
  }, [writeContract]);

  if (!enabled) return { ...DISABLED, dispense: () => {}, reset: () => {} };

  // Si el revert es un cooldown, exponemos el `availableAt` decodificado en el mensaje del
  // error para que el componente pueda mostrar «disponible a las HH:MM» sin re-leer.
  const error = writeError ?? (receipt.error as Error | null) ?? null;

  return {
    enabled,
    isLow: Boolean(lowQuery.data),
    availability,
    cooldownUntil: cooldownUntil ?? decodeCooldownAvailableAt(error),
    canDispense,
    isDispensing,
    status,
    txHash,
    error,
    dispense,
    reset,
  };
}
