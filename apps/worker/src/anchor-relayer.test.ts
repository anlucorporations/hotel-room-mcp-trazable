import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ViemModule from "viem";
import type { AnchorableSignature } from "./anchor-relayer";

/**
 * Relayer de anclaje (T3.3). No hay red: la frontera que se dobla es el módulo `viem`, de modo que
 * `ViemAnchorRelayer` construye clientes simulados y se puede comprobar **qué función y qué
 * argumentos** habría enviado la transacción.
 */
const { walletClient, publicClient } = vi.hoisted(() => ({
  walletClient: { writeContract: vi.fn() },
  publicClient: {
    waitForTransactionReceipt: vi.fn(),
    getTransactionReceipt: vi.fn(),
  },
}));

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof ViemModule>()),
  http: vi.fn(() => ({ type: "http" })),
  createWalletClient: vi.fn(() => walletClient),
  createPublicClient: vi.fn(() => publicClient),
}));

const { ViemAnchorRelayer, UnanchorableActionError } = await import("./anchor-relayer");
const { anvilChain, entityIdOf } = await import("@hotel/shared");

const CONTRACT = "0x0000000000000000000000000000000000000a11" as const;
/** Clave privada de prueba (cuenta de desarrollo; nunca se usa para firmar de verdad). */
const RELAYER_PK =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const NONCE = "0x9c6230254ac733f54ec47298f0a5ddaf93dc9efe6e05fb726dcb6faf10ddece2" as const;
const PAYLOAD = "0x5031c2aa46e9edd122f1853ee43724012c7e9956883c1f0c32a71c0abd9f9a39" as const;
const SIGNATURE = `0x${"11".repeat(65)}` as const;
const TX_HASH = `0x${"ab".repeat(32)}` as const;
/** Vector canónico de `documento_tecnico.md` §4.2.1 para ROOM_BLOCK. */
const CANONICAL_ENTITY_ID =
  "0x5c41210b06cc3b609178b5590a2e82a14824789eedc3e40e39de005661e08d0e" as const;

function makeSignature(overrides: Partial<AnchorableSignature> = {}): AnchorableSignature {
  return {
    id: "sig-1",
    entityType: "ROOM_BLOCK",
    entityId: UUID,
    contentHash: PAYLOAD,
    nonce: NONCE,
    deadline: new Date("2026-10-20T12:00:00Z"),
    signature: SIGNATURE,
    txHash: null,
    signerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    ...overrides,
  };
}

function makeRelayer(
  options: { readonly confirmations?: number; readonly timeoutMs?: number } = {},
): InstanceType<typeof ViemAnchorRelayer> {
  return new ViemAnchorRelayer({
    rpcUrl: "http://127.0.0.1:8545",
    contractAddress: CONTRACT,
    chain: anvilChain,
    privateKey: RELAYER_PK,
    ...options,
  });
}

describe("ViemAnchorRelayer · envío de la operación firmada (T3.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletClient.writeContract.mockResolvedValue(TX_HASH);
    publicClient.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  });

  it("envía roomBlocked con el entityId DERIVADO (nunca el UUID) y espera el recibo", async () => {
    const relayer = makeRelayer();

    const result = await relayer.anchor(makeSignature());

    expect(result).toEqual({ txHash: TX_HASH });
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    const call = walletClient.writeContract.mock.calls[0]?.[0] as {
      address: string;
      functionName: string;
      args: readonly unknown[];
    };
    expect(call.address).toBe(CONTRACT);
    expect(call.functionName).toBe("roomBlocked");

    const derived = entityIdOf("ROOM_BLOCK", UUID);
    expect(derived).toBe(CANONICAL_ENTITY_ID); // el motor deriva el vector canónico
    expect(call.args[0]).toBe(derived);
    expect(call.args[0]).not.toBe(UUID); // el UUID off-chain no viaja en claro (RNF-M-07)
    expect(call.args[1]).toBe(PAYLOAD); // payloadHash = contentHash
    expect(call.args[2]).toBe(NONCE);
    expect(call.args[3]).toBe(BigInt(Math.floor(new Date("2026-10-20T12:00:00Z").getTime() / 1000)));
    expect(call.args[4]).toBe(SIGNATURE);

    // CONFIRMATIONS_N = 1 por defecto.
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
      confirmations: 1,
    });
  });

  it("respeta `confirmations` cuando se configura", async () => {
    const relayer = makeRelayer({ confirmations: 3 });
    await relayer.anchor(makeSignature());
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
      confirmations: 3,
    });
  });

  const FUNCTION_CASES: readonly (readonly [string, string])[] = [
    ["ROOM_BLOCK", "roomBlocked"],
    ["ROOM_UNBLOCK", "roomUnblocked"],
    ["PREVENTIVE_TASK", "preventiveTaskVerified"],
    ["INSPECTION", "inspectionCertified"],
    ["CONFIG", "configChanged"],
  ];

  it.each(FUNCTION_CASES)(
    "mapea entity_type %s → función %s",
    async (entityType, functionName) => {
      const relayer = makeRelayer();
      await relayer.anchor(makeSignature({ entityType }));
      const call = walletClient.writeContract.mock.calls[0]?.[0] as {
        functionName: string;
        args: readonly unknown[];
      };
      expect(call.functionName).toBe(functionName);
      expect(call.args[0]).toBe(entityIdOf(entityType as never, UUID));
    },
  );

  it.each([["AREA_LOG"], ["DAMAGE_CHARGE"]])(
    "no envía tx para la acción reservada %s: lanza UnanchorableActionError",
    async (entityType) => {
      const relayer = makeRelayer();
      const promise = relayer.anchor(makeSignature({ entityType }));
      await expect(promise).rejects.toBeInstanceOf(UnanchorableActionError);
      await expect(relayer.anchor(makeSignature({ entityType }))).rejects.toMatchObject({
        code: "UNANCHORABLE_ACTION",
        name: "UnanchorableActionError",
      });
      expect(walletClient.writeContract).not.toHaveBeenCalled();
    },
  );

  it("rechaza un entity_type fuera del vocabulario sin enviar tx", async () => {
    const relayer = makeRelayer();
    await expect(relayer.anchor(makeSignature({ entityType: "INVENTED" }))).rejects.toBeInstanceOf(
      UnanchorableActionError,
    );
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("rechaza una firma sin deadline (no se firma sin caducidad) sin enviar tx", async () => {
    const relayer = makeRelayer();
    await expect(relayer.anchor(makeSignature({ deadline: null }))).rejects.toThrow(/deadline/);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("rechaza una firma sin signature sin enviar tx", async () => {
    const relayer = makeRelayer();
    await expect(relayer.anchor(makeSignature({ signature: null }))).rejects.toThrow(/signature/);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("si el recibo revierte, `anchor` falla (no se da por anclada) y el outbox la marca FAILED", async () => {
    publicClient.waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    const relayer = makeRelayer();
    await expect(relayer.anchor(makeSignature())).rejects.toThrow(/revirtió/);
  });
});

describe("ViemAnchorRelayer · isMined (recuperación tras reinicio)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve true si el recibo existe y status === success", async () => {
    publicClient.getTransactionReceipt.mockResolvedValue({ status: "success" });
    const relayer = makeRelayer();
    await expect(relayer.isMined(TX_HASH)).resolves.toBe(true);
  });

  it("devuelve false si el recibo no existe (tx aún no minada)", async () => {
    const notFound = new Error("Transaction receipt with hash ... could not be found");
    notFound.name = "TransactionReceiptNotFoundError";
    publicClient.getTransactionReceipt.mockRejectedValue(notFound);
    const relayer = makeRelayer();
    await expect(relayer.isMined(TX_HASH)).resolves.toBe(false);
  });

  it("devuelve FALSE si el recibo revirtió: no acredita la acción y el nonce EIP-712 sigue libre", async () => {
    // Decisión deliberada (ver cabecera de `anchor-relayer.ts`): un recibo `reverted` NO es MINED.
    // Devolver `true` marcaría como anclada una acción que nunca se emitió (pérdida de integridad);
    // al revertir, `consumedNonce[signer][nonce]` se deshizo, así que reenviar en una tx nueva es
    // válido (el nonce de transacción de la hot wallet no tiene nada que ver con el anti-replay).
    publicClient.getTransactionReceipt.mockResolvedValue({ status: "reverted" });
    const relayer = makeRelayer();
    await expect(relayer.isMined(TX_HASH)).resolves.toBe(false);
  });

  it("propaga los errores de RPC que no son «recibo no encontrado»", async () => {
    publicClient.getTransactionReceipt.mockRejectedValue(new Error("RPC caído"));
    const relayer = makeRelayer();
    await expect(relayer.isMined(TX_HASH)).rejects.toThrow(/RPC caído/);
  });
});
