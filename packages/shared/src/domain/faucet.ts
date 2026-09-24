import { decodeErrorResult, type Hex } from "viem";
import { faucetAbi } from "../abi/faucet";

/**
 * Lógica PURA del faucet de pruebas (RF-21 / CU-PR-01, docs/SRS.md §9): cálculo de cooldown, derivación de
 * estado y decodificación del revert `FaucetCooldownActive`. Sin React ni wagmi → testeable
 * en aislamiento y reutilizable por el hook de la web. La capa de UI solo orquesta.
 */

/** Estado derivado del faucet para una wallet, independiente del framework. */
export type FaucetAvailability =
  | { readonly kind: "ready" } // puede dispensar ya
  | { readonly kind: "cooldown"; readonly availableAt: number } // bloqueado hasta epoch (s)
  | { readonly kind: "empty" }; // sin saldo para una dispensación

export interface FaucetSnapshot {
  /** Epoch (s) a partir del cual la wallet puede volver a dispensar (0 = nunca dispensó). */
  readonly availableAt: number;
  /** Saldo del faucet por debajo del umbral de alerta (RNF-17). */
  readonly isLow: boolean;
  /** `true` si el faucet no tiene saldo suficiente ni para una dispensación. */
  readonly isEmpty: boolean;
}

/**
 * Deriva la disponibilidad de dispensación a partir del estado on-chain y la hora actual.
 * `nowSeconds` se inyecta (no `Date.now()` interno) para ser determinista en tests.
 */
export function deriveFaucetAvailability(
  snapshot: FaucetSnapshot,
  nowSeconds: number,
): FaucetAvailability {
  if (snapshot.isEmpty) return { kind: "empty" };
  if (snapshot.availableAt > nowSeconds) {
    return { kind: "cooldown", availableAt: snapshot.availableAt };
  }
  return { kind: "ready" };
}

/** Segundos restantes de cooldown (nunca negativo). 0 si ya está disponible. */
export function cooldownRemainingSeconds(availableAt: number, nowSeconds: number): number {
  const remaining = availableAt - nowSeconds;
  return remaining > 0 ? remaining : 0;
}

/**
 * Formatea una cuenta atrás de cooldown como `mm:ss` (o `hh:mm:ss` si supera la hora).
 * Útil para el `aria-live` del botón. Entrada en segundos; se trunca a enteros.
 */
export function formatCooldown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface ErrorLike {
  readonly data?: Hex;
  readonly cause?: ErrorLike;
  readonly [key: string]: unknown;
}

/**
 * Intenta extraer el `availableAt` del revert `FaucetCooldownActive(account, availableAt)`
 * recorriendo la cadena de `cause` (viem anida el error de contrato). Devuelve el epoch (s)
 * o `null` si el error no es ese cooldown. Pura: el componente decide cómo mostrarlo.
 */
export function decodeCooldownAvailableAt(error: unknown): number | null {
  for (let e = error as ErrorLike | undefined; e; e = e.cause) {
    const data = e.data;
    if (typeof data !== "string" || !data.startsWith("0x")) continue;
    try {
      const decoded = decodeErrorResult({ abi: faucetAbi, data: data as Hex });
      if (decoded.errorName === "FaucetCooldownActive") {
        // args = [account, availableAt] (uint256 → bigint).
        const availableAt = decoded.args?.[1];
        if (typeof availableAt === "bigint") return Number(availableAt);
      }
    } catch {
      // `data` no corresponde al ABI del faucet: seguimos bajando por la cadena de causas.
    }
  }
  return null;
}
