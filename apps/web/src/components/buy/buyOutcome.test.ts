import { describe, expect, it } from "vitest";
import { toHex, type Address, type Hex, type TransactionReceipt } from "viem";
import { deriveTxStatus } from "@/components/tx/txStatus";
import {
  buyErrorMessage,
  classifyBuyOutcome,
  classifyReceiptError,
  receiptConfirmsNight,
} from "./buyOutcome";

/**
 * Pruebas de la clasificación de una compra (D1/D2/D5), herméticas y sin React: la misma pieza
 * pura que consumen `useBuyNight` (catálogo) y `PurchaseHandoff` (asistente).
 */

const CONTRACT = "0xC66AB83418C20A65C3f8e83B3d11c8C3a6097b6F" as Address;
const OTHER_CONTRACT = "0x1111111111111111111111111111111111111111" as Address;
const HASH = `0x${"a".repeat(64)}` as Hex;
const TOKEN = 10120261011n;
const OTHER_TOKEN = 10120261009n;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Recibo mínimo con lo que usa la clasificación (`status` + `logs`). */
function receiptOf(input: {
  status?: "success" | "reverted";
  logs?: ReadonlyArray<{ address: string; topics: readonly string[] }>;
}): TransactionReceipt {
  return {
    status: input.status ?? "success",
    logs: input.logs ?? [],
  } as unknown as TransactionReceipt;
}

/** Log ERC-721 `Transfer(from, to, tokenId)` del contrato indicado. */
function transferLog(address: string, tokenId: bigint) {
  return {
    address,
    topics: [TRANSFER_TOPIC, `0x${"00".repeat(32)}`, `0x${"11".repeat(32)}`, toHex(tokenId, { size: 32 })],
  };
}

const baseSignals = {
  isSending: false,
  hash: HASH,
  isReadingReceipt: false,
  isReceiptSuccess: false,
  isReceiptError: false,
  receipt: undefined,
  receiptError: null,
  sendError: null,
  expectedContract: CONTRACT,
  expectedTokenId: TOKEN,
} as const;

describe("buyErrorMessage · D1 (motivo real del fallo)", () => {
  it("mapea los errores REVERT del contrato a su clave", () => {
    expect(buyErrorMessage(new Error("reverted with NightNotAvailable(1)"))).toBe("buyError.NightNotAvailable");
    expect(buyErrorMessage(new Error("NightExpired()"))).toBe("buyError.NightExpired");
    expect(buyErrorMessage(new Error("IncorrectPayment(1, 2)"))).toBe("buyError.IncorrectPayment");
    expect(buyErrorMessage(new Error("EnforcedPause()"))).toBe("buyError.EnforcedPause");
    expect(buyErrorMessage(new Error("EthTransferFailed()"))).toBe("buyError.EthTransferFailed");
  });

  it("detecta el nombre del error dentro de la cadena de `cause`", () => {
    const deep = { message: "outer", cause: { shortMessage: "The contract function reverted with NightNotAvailable(1)" } };
    expect(buyErrorMessage(deep)).toBe("buyError.NightNotAvailable");
  });

  it("prioriza el rechazo de firma y cae al genérico si no reconoce nada", () => {
    expect(buyErrorMessage({ name: "UserRejectedRequestError", message: "denied" })).toBe("buyError.rejected");
    expect(buyErrorMessage({ code: 4001 })).toBe("buyError.rejected");
    expect(buyErrorMessage(new Error("boom"))).toBe("buyError.failed");
  });
});

describe("classifyReceiptError · D5 («no pude leer» ≠ «revirtió»)", () => {
  it("un Error pelado es el revert que lanza el contenedor de wagmi tras ver el recibo", () => {
    expect(classifyReceiptError(new Error("NightNotAvailable(1)"))).toBe("reverted");
    expect(classifyReceiptError(new Error("unknown reason"))).toBe("reverted");
  });

  it("un error de viem con texto de revert es un revert", () => {
    expect(
      classifyReceiptError({ name: "CallExecutionError", message: "Execution reverted with reason: EnforcedPause()" }),
    ).toBe("reverted");
  });

  it("un fallo de red/RPC NO es un revert: es «no se pudo verificar»", () => {
    expect(classifyReceiptError({ name: "HttpRequestError", message: "HTTP request failed." })).toBe("unverifiable");
    expect(classifyReceiptError({ name: "TimeoutError", message: "timed out" })).toBe("unverifiable");
    expect(classifyReceiptError(undefined)).toBe("unverifiable");
  });
});

describe("receiptConfirmsNight · D2 (el recibo debe acreditar NUESTRA noche)", () => {
  it("exige la transferencia ERC-721 del contrato canónico para el tokenId firmado", () => {
    expect(receiptConfirmsNight(receiptOf({ logs: [transferLog(CONTRACT, TOKEN)] }), CONTRACT, TOKEN)).toBe(true);
  });

  it("rechaza otro contrato, otro tokenId, status revertido o sin logs", () => {
    expect(receiptConfirmsNight(receiptOf({ logs: [transferLog(OTHER_CONTRACT, TOKEN)] }), CONTRACT, TOKEN)).toBe(false);
    expect(receiptConfirmsNight(receiptOf({ logs: [transferLog(CONTRACT, OTHER_TOKEN)] }), CONTRACT, TOKEN)).toBe(false);
    expect(receiptConfirmsNight(receiptOf({ status: "reverted", logs: [transferLog(CONTRACT, TOKEN)] }), CONTRACT, TOKEN)).toBe(false);
    expect(receiptConfirmsNight(receiptOf({ logs: [] }), CONTRACT, TOKEN)).toBe(false);
    expect(receiptConfirmsNight(undefined, CONTRACT, TOKEN)).toBe(false);
    expect(receiptConfirmsNight(receiptOf({ logs: [transferLog(CONTRACT, TOKEN)] }), CONTRACT, null)).toBe(false);
  });
});

describe("classifyBuyOutcome · estados de la compra", () => {
  it("firmando y minando conservan sus estados", () => {
    expect(classifyBuyOutcome({ ...baseSignals, isSending: true }).status).toBe("signing");
    expect(classifyBuyOutcome({ ...baseSignals, isReadingReceipt: true }).status).toBe("pending");
  });

  it("confirmada SOLO si el recibo trae la transferencia de la noche (D2)", () => {
    const outcome = classifyBuyOutcome({
      ...baseSignals,
      isReceiptSuccess: true,
      receipt: receiptOf({ logs: [transferLog(CONTRACT, TOKEN)] }),
    });
    expect(outcome).toEqual({ status: "confirmed", failureKey: null });
  });

  it("D2: una transacción reemplazada/cancelada no se anuncia como éxito", () => {
    const outcome = classifyBuyOutcome({
      ...baseSignals,
      isReceiptSuccess: true,
      receipt: receiptOf({ logs: [] }),
    });
    expect(outcome.status).toBe("reverted");
    expect(outcome.failureKey).toBe("buyError.replaced");
  });

  it("D1: un revert del contrato explica el motivo", () => {
    const outcome = classifyBuyOutcome({
      ...baseSignals,
      isReceiptError: true,
      receiptError: new Error("NightNotAvailable(10120261011)"),
    });
    expect(outcome.status).toBe("reverted");
    expect(outcome.failureKey).toBe("buyError.NightNotAvailable");
  });

  it("D5: si no se pudo leer el recibo, el estado es unverifiable (ni éxito ni fallo)", () => {
    const outcome = classifyBuyOutcome({
      ...baseSignals,
      isReceiptError: true,
      receiptError: { name: "HttpRequestError", message: "HTTP request failed." },
    });
    expect(outcome.status).toBe("unverifiable");
    expect(outcome.failureKey).toBe("buyError.receiptUnreadable");
  });

  it("rechazo de firma antes de difundir: idle con motivo", () => {
    const outcome = classifyBuyOutcome({
      ...baseSignals,
      hash: undefined,
      sendError: { name: "UserRejectedRequestError" },
    });
    expect(outcome.status).toBe("idle");
    expect(outcome.failureKey).toBe("buyError.rejected");
  });
});

describe("deriveTxStatus · nuevo estado unverifiable (D5)", () => {
  it("solo se alcanza con hash y sin éxito/fallo", () => {
    expect(
      deriveTxStatus({ isPending: false, hash: HASH, isConfirming: false, isConfirmed: false, isReverted: false, isUnverifiable: true }),
    ).toBe("unverifiable");
    expect(
      deriveTxStatus({ isPending: false, hash: undefined, isConfirming: false, isConfirmed: false, isReverted: false, isUnverifiable: true }),
    ).toBe("idle");
    // Opcional: los flujos que no la pasan no cambian de comportamiento.
    expect(
      deriveTxStatus({ isPending: false, hash: HASH, isConfirming: false, isConfirmed: false, isReverted: true }),
    ).toBe("reverted");
  });
});
