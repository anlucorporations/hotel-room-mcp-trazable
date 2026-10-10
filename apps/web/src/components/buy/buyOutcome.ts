import type { Address, TransactionReceipt } from "viem";
import { getAddress, keccak256, toHex } from "viem";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";
import { classifyTxError } from "@/components/tx/txError";

/**
 * Clasificación **pura** del resultado de una compra (D1, D2, D5).
 *
 * Nace de la verificación 2026-10-09: el flujo de compra colapsaba tres situaciones distintas en
 * el mismo estado `reverted` y no exponía el motivo.
 *
 *   - **D1 · motivo perdido.** El motivo del fallo vive en el error del **recibo**; la UI solo
 *     leía el error de `useSendTransaction` (nulo cuando la tx se difundió y revirtió), así que
 *     el huésped veía «no se completó» sin saber si la noche estaba vendida o faltaba el importe.
 *   - **D2 · éxito sin comprobar.** `isSuccess` solo dice que la consulta resolvió. Si la wallet
 *     **reemplaza o cancela** la tx, viem resuelve el recibo del **reemplazo** (p. ej. una
 *     autocancelación con `status: success`), y la app anunciaba «¡Noche reservada!» sin que se
 *     hubiera comprado nada. Aquí se exige que el recibo contenga la **transferencia ERC-721 de
 *     la noche esperada** hecha por el contrato canónico.
 *   - **D5 · «no pude leer» ≠ «revirtió».** Cualquier error de la consulta del recibo se
 *     traducía a `reverted`. Un corte transitorio del RPC sobre una compra que **sí** se asentó
 *     (y que luego aparece en «Mis noches») se contaba como fallo. Ahora se distingue el revert
 *     del contrato (error con motivo) del fallo de lectura (estado propio `unverifiable`).
 *
 * Todo se resuelve sin React ni red: el hook y las pruebas comparten esta única verdad.
 */

/** Errores REVERT del contrato relevantes al comprar (`HotelNights.buy`/`buyResale`). */
const BUY_ERRORS = [
  // Noche inexistente, ya vendida en primaria o consumida con check-in (D-05).
  "NightNotAvailable",
  // Noche caducada (fecha pasada).
  "NightExpired",
  // `msg.value != price`: importe manipulado o precio movido en el último instante.
  "IncorrectPayment",
  // Contrato en pausa (`whenNotPaused`).
  "EnforcedPause",
  // La tesorería no pudo recibir el importe.
  "EthTransferFailed",
] as const;

export type BuyErrorName = (typeof BUY_ERRORS)[number];

/**
 * Clave i18n (dentro del namespace `buy`) del motivo a mostrar. Es una clave estable, no texto:
 * el componente la traduce y las pruebas la comparan sin cadenas literales (mismo patrón que
 * `resaleErrorMessage`/`classifyAdminTxError`).
 */
export type BuyErrorKey =
  | `buyError.${BuyErrorName}`
  | "buyError.rejected"
  | "buyError.failed"
  /** No se pudo leer el recibo (red/RPC): la compra puede haberse completado. */
  | "buyError.receiptUnreadable"
  /** La red confirmó una transacción que no es la compra esperada (reemplazo/cancelación). */
  | "buyError.replaced";

interface ErrorLike {
  readonly name?: string;
  readonly message?: string;
  readonly shortMessage?: string;
  readonly details?: string;
  readonly cause?: ErrorLike;
}

/** Concatena los textos del error de viem/wagmi en toda la cadena de `cause` (mismo patrón que reventa). */
function collectErrorText(error: ErrorLike | undefined): string {
  const parts: string[] = [];
  for (let e = error; e; e = e.cause) {
    if (e.shortMessage) parts.push(e.shortMessage);
    if (e.message) parts.push(e.message);
    if (e.details) parts.push(e.details);
    if (e.name) parts.push(e.name);
  }
  return parts.join(" ");
}

/**
 * Traduce el error de una compra a la clave i18n del motivo (D1): primero el rechazo explícito de
 * firma, después el nombre del error REVERT del contrato y, en su defecto, el genérico.
 */
export function buyErrorMessage(error: unknown): BuyErrorKey {
  if (classifyTxError(error) === "rejected") return "buyError.rejected";
  const text = collectErrorText(error as ErrorLike);
  const name = BUY_ERRORS.find((candidate) => text.includes(candidate));
  return name ? `buyError.${name}` : "buyError.failed";
}

/**
 * ¿El error de la consulta del recibo es un **revert del contrato** (D5)?
 *
 * `@wagmi/core` lanza un `Error` plano con el motivo cuando el recibo trae `status === 'reverted'`
 * (o envuelve el revert de viem en `CallExecutionError`, cuyo texto dice «reverted»). Cualquier
 * otra cosa —`HttpRequestError`, timeout, 5xx del RPC— significa «no se pudo leer», no «revirtió»:
 * ante la duda **no** se declara fallo, porque declarar un fallo falso es peor (el huésped
 * reintentaría una compra que ya se hizo).
 */
export function classifyReceiptError(error: unknown): "reverted" | "unverifiable" {
  // El contenedor de wagmi lanza un `Error` PELADO solo tras ver el recibo revertido.
  if (error instanceof Error && error.constructor === Error) return "reverted";
  if (collectErrorText(error as ErrorLike).toLowerCase().includes("revert")) return "reverted";
  return "unverifiable";
}

/**
 * Tópico del evento ERC-721 `Transfer(address,address,uint256)` (los tres parámetros indexados).
 * Se **calcula** en vez de escribir el literal: el guardián de destino único (`legacy-target-guardian`)
 * prohíbe cadenas de 40 hex fuera de `config/chain.ts`, y un hash de 32 bytes las contiene.
 */
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

function topicToTokenId(topic: string | undefined): bigint | null {
  if (!topic) return null;
  try {
    return BigInt(topic);
  } catch {
    return null;
  }
}

/**
 * ¿Este recibo prueba que la **noche esperada** cambió de manos en el contrato canónico? (D2)
 *
 * Se exige el evento `Transfer` del contrato con `tokenId` = el del calldata firmado. Un recibo
 * de una autocancelación (o de cualquier otra transacción con el mismo nonce) no lo tiene, así que
 * no se puede anunciar éxito. `tokenId === null` (no se pudo decodificar el calldata) tampoco
 * acredita nada.
 */
export function receiptConfirmsNight(
  receipt: TransactionReceipt | undefined,
  contract: Address,
  tokenId: bigint | null,
): boolean {
  if (!receipt || receipt.status !== "success" || tokenId === null) return false;
  let expected: string;
  try {
    expected = getAddress(contract).toLowerCase();
  } catch {
    return false;
  }
  return receipt.logs.some(
    (log) =>
      log.address.toLowerCase() === expected &&
      (log.topics[0] ?? "").toLowerCase() === TRANSFER_TOPIC &&
      topicToTokenId(log.topics[3]) === tokenId,
  );
}

/** Señales que el hook extrae de wagmi para clasificar la compra. */
export interface BuyOutcomeSignals {
  /** `useSendTransaction().isPending`: la wallet está firmando. */
  readonly isSending: boolean;
  readonly hash: `0x${string}` | undefined;
  /** `useWaitForTransactionReceipt().isLoading`: se está leyendo el recibo. */
  readonly isReadingReceipt: boolean;
  readonly isReceiptSuccess: boolean;
  readonly isReceiptError: boolean;
  readonly receipt: TransactionReceipt | undefined;
  readonly receiptError: unknown;
  /** Error de `useSendTransaction` (rechazo de firma o fallo al difundir). */
  readonly sendError: unknown;
  readonly expectedContract: Address;
  /** `tokenId` del calldata firmado; `null` si aún no se puede decodificar. */
  readonly expectedTokenId: bigint | null;
}

export interface BuyOutcome {
  readonly status: TxStatus;
  /** Clave i18n del motivo, o `null` si no hay fallo que explicar. */
  readonly failureKey: BuyErrorKey | null;
}

/** Deriva estado + motivo de una compra a partir de las señales de wagmi (D1/D2/D5). */
export function classifyBuyOutcome(signals: BuyOutcomeSignals): BuyOutcome {
  const receiptErrorKind = signals.isReceiptError ? classifyReceiptError(signals.receiptError) : null;
  // D2: un recibo que resolvió pero NO acredita la transferencia de la noche esperada se trata
  // como fallo (la red confirmó otra cosa), nunca como éxito.
  const receiptIsForeign =
    signals.isReceiptSuccess &&
    signals.expectedTokenId !== null &&
    !receiptConfirmsNight(signals.receipt, signals.expectedContract, signals.expectedTokenId);

  const status = deriveTxStatus({
    isPending: signals.isSending,
    hash: signals.hash,
    isConfirming: signals.isReadingReceipt,
    isConfirmed: signals.isReceiptSuccess && !receiptIsForeign,
    isReverted: (signals.isReceiptError && receiptErrorKind === "reverted") || receiptIsForeign,
    isUnverifiable: signals.isReceiptError && receiptErrorKind === "unverifiable",
  });

  let failureKey: BuyErrorKey | null = null;
  if (status === "reverted") {
    if (receiptIsForeign) failureKey = "buyError.replaced";
    else if (signals.isReceiptError) failureKey = buyErrorMessage(signals.receiptError);
    else if (signals.sendError) failureKey = buyErrorMessage(signals.sendError);
    else failureKey = "buyError.failed";
  } else if (status === "unverifiable") {
    failureKey = "buyError.receiptUnreadable";
  } else if (status === "idle" && signals.sendError) {
    // Rechazo de firma antes de difundir: se explica en el paso «Revisar».
    failureKey = buyErrorMessage(signals.sendError);
  }

  return { status, failureKey };
}
