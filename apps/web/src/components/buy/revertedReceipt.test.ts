import { describe, expect, it } from "vitest";
import { custom, defineChain, type Hex } from "viem";
import { createConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { deriveTxStatus } from "@/components/tx/txStatus";

/**
 * Regresión de la verificación 2026-10-09 («la wallet da la tx por fallida pero la plataforma
 * añade la noche a Mis noches»).
 *
 * El flujo de compra (`useBuyNight`) deriva el estado del recibo con
 * `deriveTxStatus({ …, isConfirmed: receipt.isSuccess, isReverted: receipt.isError })`, donde
 * `receipt` es el resultado de la query de `useWaitForTransactionReceipt`. Es decir: la app
 * asume que **una tx revertida hace fallar la query**. Si wagmi/viem dejaran de rechazar los
 * recibos revertidos (p. ej. al bajar de versión), `isSuccess` volvería a ser `true`,
 * `isConfirmed` ganaría a `isReverted` (el orden de `deriveTxStatus`) y la app anunciaría
 * «¡Noche reservada!» de una transacción que no compró nada.
 *
 * Esta prueba fija el contrato de esa frontera: con un recibo `reverted`, la acción de wagmi
 * DEBE rechazar, y con las señales que la app deriva de ese rechazo el estado debe ser
 * `reverted` (nunca `confirmed`). Es hermética: el transporte JSON-RPC es un doble en memoria.
 */

const HASH = "0x1b4f3b0f5a2a4c7e8d9f0a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901" as Hex;
const ZERO = "0x0" as const;
const CHAIN_ID = 81234;

const RECEIPT = {
  transactionHash: HASH,
  transactionIndex: ZERO,
  blockHash: `0x${"11".repeat(32)}`,
  blockNumber: "0x1",
  from: `0x${"22".repeat(20)}`,
  to: `0x${"33".repeat(20)}`,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  contractAddress: null,
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
  // La tx REVIRTIÓ en cadena (lo que MetaMask muestra en rojo).
  status: ZERO,
  type: "0x2",
  effectiveGasPrice: "0x1",
};

const TRANSACTION = {
  hash: HASH,
  nonce: ZERO,
  blockHash: `0x${"11".repeat(32)}`,
  blockNumber: "0x1",
  transactionIndex: ZERO,
  from: `0x${"22".repeat(20)}`,
  to: `0x${"33".repeat(20)}`,
  value: ZERO,
  gas: "0x5208",
  gasPrice: "0x1",
  input: "0x",
  v: "0x0",
  r: `0x${"00".repeat(32)}`,
  s: `0x${"00".repeat(32)}`,
  type: "0x2",
  maxFeePerGas: "0x1",
  maxPriorityFeePerGas: "0x1",
  chainId: `0x${CHAIN_ID.toString(16)}`,
};

const chain = defineChain({
  id: CHAIN_ID,
  name: "anvil-test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:1"] } },
});

const revertedTransport = custom({
  async request({ method }: { method: string }) {
    switch (method) {
      case "eth_chainId":
        return `0x${CHAIN_ID.toString(16)}`;
      case "eth_getTransactionReceipt":
        return RECEIPT;
      case "eth_getTransactionByHash":
        return TRANSACTION;
      // El reintento de motivo que hace @wagmi/core tras ver el revert.
      case "eth_call":
        return "0x";
      default:
        throw new Error(`método no esperado en el doble hermético: ${method}`);
    }
  },
});

const config = createConfig({ chains: [chain], transports: { [chain.id]: revertedTransport }, connectors: [] });

describe("useWaitForTransactionReceipt sobre una tx revertida", () => {
  it("rechaza (isError) en lugar de resolver con éxito", async () => {
    await expect(waitForTransactionReceipt(config, { hash: HASH })).rejects.toThrow();
  });

  it("con las señales que la app deriva de ese rechazo, el estado es «reverted», no «confirmed»", async () => {
    // Así es exactamente como `useBuyNight` traduce la query a las señales de `deriveTxStatus`.
    let queryIsSuccess = false;
    let queryIsError = false;
    try {
      await waitForTransactionReceipt(config, { hash: HASH });
      queryIsSuccess = true;
    } catch {
      queryIsError = true;
    }

    const status = deriveTxStatus({
      isPending: false,
      hash: HASH,
      isConfirming: false,
      isConfirmed: queryIsSuccess,
      isReverted: queryIsError,
    });

    expect(queryIsError).toBe(true);
    expect(queryIsSuccess).toBe(false);
    expect(status).toBe("reverted");
  });
});

describe("deriveTxStatus", () => {
  it("convierte las señales de wagmi en el estado visible", () => {
    expect(deriveTxStatus({ isPending: true, hash: undefined, isConfirming: false, isConfirmed: false, isReverted: false })).toBe("signing");
    expect(deriveTxStatus({ isPending: false, hash: HASH, isConfirming: true, isConfirmed: false, isReverted: false })).toBe("pending");
    expect(deriveTxStatus({ isPending: false, hash: HASH, isConfirming: false, isConfirmed: true, isReverted: false })).toBe("confirmed");
    expect(deriveTxStatus({ isPending: false, hash: HASH, isConfirming: false, isConfirmed: false, isReverted: true })).toBe("reverted");
    expect(deriveTxStatus({ isPending: false, hash: undefined, isConfirming: false, isConfirmed: false, isReverted: false })).toBe("idle");
  });
});
