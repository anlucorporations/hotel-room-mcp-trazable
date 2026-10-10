import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeEventTopics, parseAbiItem } from "viem";
import type { PublicClient, WalletClient } from "viem";
import { BurnerService, chunked, isRevertError, type BurnLock } from "./service";
import type { NFTsRepository } from "../db/repositories/nfts.repository";
import type { NotificationQueueService } from "../queue/notifications";

const BURN_EVENT = parseAbiItem("event Burn(uint256 indexed tokenId)");

/**
 * Error con la forma de un **revert** del contrato, que es lo que `viem` lanza cuando `eth_call`
 * revierte. La distinción importa desde el hallazgo H-01: un revert es un veredicto de negocio («esta
 * noche no se puede quemar»), un error de red no lo es.
 */
function revertError(message = "execution reverted"): Error {
  const error = new Error(message);
  error.name = "ContractFunctionRevertedError";
  return error;
}

/** Log de `Burn(tokenId)` como el que devuelve el recibo de una quema confirmada. */
function burnLog(tokenId: bigint) {
  return {
    address: CONTRACT,
    topics: encodeEventTopics({ abi: [BURN_EVENT], eventName: "Burn", args: { tokenId } }),
    data: "0x" as const,
  };
}

/**
 * Quema programada (US-09, D-03).
 *
 * Lo que estas pruebas defienden, y que el estado auditado no cumplía:
 *   1. se firma `burnExpired` con el ABI **canónico** (antes `burnBatch` del ABI legacy, que no
 *      existe en el contrato: habría revertido siempre);
 *   2. se **espera el recibo** y solo entonces se marca la base (antes marcaba `BURNED` sin mirar
 *      el resultado);
 *   3. el lote se trocea por `burnBatchMax` y una noche inválida no impide quemar las demás;
 *   4. sin saldo no se quema y se avisa a DevOps; con el cerrojo ocupado no se ejecuta.
 */

class InMemoryBurnLock implements BurnLock {
  readonly held = new Map<string, string>();
  acquireCalls = 0;

  async acquire(key: string, ttlSeconds: number): Promise<string | null> {
    this.acquireCalls += 1;
    if (this.held.has(key)) return null;
    const value = `lock-${this.acquireCalls}-${ttlSeconds}`;
    this.held.set(key, value);
    return value;
  }

  async release(key: string, value: string): Promise<void> {
    if (this.held.get(key) === value) this.held.delete(key);
  }
}

const TODAY = new Date("2026-09-23T10:00:00Z");
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const OPERATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

function nft(tokenId: string) {
  return {
    tokenId,
    roomNumber: 101,
    roomType: "SIMPLE" as const,
    checkInDate: "2026-09-01",
    basePriceWei: "100000000000000000",
    status: "AVAILABLE" as const,
    currentOwner: OPERATOR,
    txHashMint: "0x",
  };
}

/** Dobles parciales: solo los métodos que ejercita esta suite. */
type MockNftsRepo = NFTsRepository & { getUnsoldExpiredNFTs: Mock; updateNFTStatus: Mock };
type MockQueue = NotificationQueueService & { enqueueNotification: Mock };
type MockPublicClient = PublicClient & {
  getBalance: Mock;
  readContract: Mock;
  simulateContract: Mock;
  waitForTransactionReceipt: Mock;
};
/** `viem` tipa `account` como un `Account` real: el doble se declara con la intersección y se afirma una vez. */
type MockWalletClient = WalletClient & { writeContract: Mock };

describe("BurnerService (US-09 · D-03)", () => {
  let nftsRepo: MockNftsRepo;
  let queue: MockQueue;
  let lock: InMemoryBurnLock;
  let publicClient: MockPublicClient;
  let walletClient: MockWalletClient;
  let service: BurnerService;

  function buildService(overrides: { tokens?: string[]; burnBatchMax?: number; receiptTokens?: bigint[] } = {}) {
    const tokens = overrides.tokens ?? ["10120260901", "10220260901", "10320260901"];
    nftsRepo = {
      getUnsoldExpiredNFTs: vi.fn().mockResolvedValue(tokens.map(nft)),
      updateNFTStatus: vi.fn().mockResolvedValue(true),
    } as MockNftsRepo;
    queue = { enqueueNotification: vi.fn().mockResolvedValue("notif-1") } as MockQueue;
    lock = new InMemoryBurnLock();
    // El recibo se construye a partir de la última quema difundida: eventos `Burn` por token.
    let lastBurnTokens: bigint[] = [];
    publicClient = {
      getBalance: vi.fn().mockResolvedValue(10_000_000_000_000_000_000n), // 10 nativo
      readContract: vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
        if (functionName === "burnBatchMax") return BigInt(overrides.burnBatchMax ?? 10);
        // `ownerOf` de un token que existe: un descarte que sigue on-chain NO se reconcilia.
        if (functionName === "ownerOf") return OPERATOR;
        throw new Error(`no soportado en el mock: ${functionName}`);
      }),
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
      waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => ({
        status: "success",
        transactionHash: hash,
        logs: lastBurnTokens.map(burnLog),
      })),
    } as MockPublicClient;
    walletClient = {
      account: { address: OPERATOR },
      chain: { id: 81234 },
      writeContract: vi.fn(async ({ args }: { args: [bigint[]] }) => {
        lastBurnTokens = overrides.receiptTokens ?? args[0];
        return "0xburnhash";
      }),
    } as unknown as MockWalletClient;
    service = new BurnerService(nftsRepo, queue, { now: () => TODAY, lock });
    return service;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    buildService();
  });

  const options = {
    nftContractAddress: CONTRACT,
    operatorAddress: OPERATOR,
    minBalanceNative: 1,
    devopsEmail: "devops@hotel.es",
  };

  it("quema con el ABI canónico, espera el recibo y marca solo lo confirmado", async () => {
    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.executed).toBe(true);
    expect(result.reason).toBe("COMPLETED");
    expect(result.burnedTokensCount).toBe(3);
    expect(result.txHashes).toEqual(["0xburnhash"]);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: CONTRACT,
        functionName: "burnExpired",
        args: [[10120260901n, 10220260901n, 10320260901n]],
      }),
    );
    // Nunca la función de la generación legacy.
    expect(
      walletClient.writeContract.mock.calls.some((call) => call[0]?.functionName === "burnBatch"),
    ).toBe(false);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xburnhash" });
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledTimes(3);
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledWith("10120260901", "BURNED");
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "BURN_EXECUTED",
      "devops@hotel.es",
      expect.objectContaining({ burnedCount: 3 }),
    );
  });

  it("trocea el lote por `burnBatchMax` (el contrato limita el tamaño)", async () => {
    buildService({ burnBatchMax: 2 });
    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(walletClient.writeContract).toHaveBeenCalledTimes(2);
    expect(walletClient.writeContract.mock.calls[0]![0].args[0]).toHaveLength(2);
    expect(walletClient.writeContract.mock.calls[1]![0].args[0]).toHaveLength(1);
    expect(result.burnedTokensCount).toBe(3);
    expect(result.txHashes).toHaveLength(2);
  });

  it("una noche no quemable no impide quemar el resto (reintento token a token)", async () => {
    // El lote revierte; el token del medio no es quemable (p. ej. ya se vendió).
    publicClient.simulateContract.mockImplementation(async ({ args }: { args: [bigint[]] }) => {
      const tokenIds: bigint[] = args[0];
      if (tokenIds.length > 1 || tokenIds[0] === 10220260901n) {
        throw revertError("execution reverted");
      }
      return { request: {} };
    });
    // La noche descartada SÍ existe on-chain (se vendió): no debe reconciliarse como quemada.
    publicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "burnBatchMax") return 10n;
      if (functionName === "ownerOf") return "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
      throw new Error("no soportado");
    });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.burnedTokensCount).toBe(2);
    expect(result.skippedTokens).toEqual(["10220260901"]);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract.mock.calls[0]![0].args[0]).toEqual([10120260901n, 10320260901n]);
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledTimes(2);
  });

  it("marca en la base SOLO los tokens que el recibo declara quemados", async () => {
    // El recibo confirma menos de los que se pretendían quemar (p. ej. el contrato omitió uno).
    buildService({ receiptTokens: [10120260901n] });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.burnedTokensCount).toBe(1);
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledTimes(1);
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledWith("10120260901", "BURNED");
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "BURN_EXECUTED",
      "devops@hotel.es",
      expect.objectContaining({ tokenIds: ["10120260901"] }),
    );
  });

  it("un recibo sin eventos Burn NO marca nada (no se marca por lo que se pretendía)", async () => {
    buildService({ receiptTokens: [] });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("ERROR");
    expect(nftsRepo.updateNFTStatus).not.toHaveBeenCalled();
  });

  it("reconcilia como BURNED un candidato que ya no existe on-chain", async () => {
    // El lote revierte y el token tampoco existe (lo quemó otro operador): `ownerOf` revierte.
    publicClient.simulateContract.mockRejectedValue(revertError("execution reverted"));
    publicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "burnBatchMax") return 10n;
      if (functionName === "ownerOf") throw revertError("ERC721NonexistentToken");
      throw new Error("no soportado");
    });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(result.burnedTokensCount).toBe(0);
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledTimes(3);
    expect(nftsRepo.updateNFTStatus).toHaveBeenCalledWith("10120260901", "BURNED");
    // Todas las candidatas ya estaban quemadas por otro operador: convergencia benigna, sin alerta
    // (la alerta se reserva para candidatas VIVAS que no se pudieron quemar, ver H-05).
    expect(result.reason).toBe("COMPLETED");
    expect(queue.enqueueNotification).not.toHaveBeenCalled();
  });

  it("con saldo bajo NO quema y avisa a DevOps", async () => {
    publicClient.getBalance.mockResolvedValue(0n);

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("INSUFFICIENT_GAS");
    expect(result.burnedTokensCount).toBe(0);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(nftsRepo.updateNFTStatus).not.toHaveBeenCalled();
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      "devops@hotel.es",
      expect.objectContaining({ subject: expect.stringContaining("saldo insuficiente") }),
    );
  });

  it("con el cerrojo ocupado no ejecuta nada (una sola instancia quema)", async () => {
    await lock.acquire("hotel:burn:lock", 120);

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("LOCKED");
    expect(result.executed).toBe(false);
    expect(nftsRepo.getUnsoldExpiredNFTs).not.toHaveBeenCalled();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("sin candidatas no hay transacción ni marcado", async () => {
    buildService({ tokens: [] });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("NO_TOKENS");
    expect(result.executed).toBe(true);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("si el recibo revierte, NO marca la base y avisa", async () => {
    publicClient.waitForTransactionReceipt.mockResolvedValue({
      status: "reverted",
      transactionHash: "0xburn",
    });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("ERROR");
    expect(result.burnedTokensCount).toBe(0);
    expect(nftsRepo.updateNFTStatus).not.toHaveBeenCalled();
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      "devops@hotel.es",
      expect.objectContaining({ subject: expect.stringContaining("fallo en la quema") }),
    );
  });

  it("en dry-run no difunde nada pero informa de las candidatas", async () => {
    const result = await service.executeScheduledBurn(publicClient, walletClient, {
      ...options,
      dryRun: true,
    });

    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(result.skippedTokens).toHaveLength(3);
  });

  it("usa la fecha del reloj inyectado (hora de la cadena) para buscar caducadas", async () => {
    await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(nftsRepo.getUnsoldExpiredNFTs).toHaveBeenCalledWith("2026-09-23");
  });

  it("chunked trocea en lotes del tamaño pedido", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 3)).toEqual([]);
  });
});

/**
 * Integridad del índice (hallazgo **H-01**, crítico, auditoría V6).
 *
 * El defecto: `canSimulate` devolvía «no quemable» ante CUALQUIER excepción y `isGoneOnChain`
 * devolvía «ya no existe» ante CUALQUIER excepción. Con un `eth_call` degradado, todas las candidatas
 * acababan descartadas, la reconciliación las marcaba `BURNED` en la base y el ciclo lo presentaba
 * como éxito: inventario vivo dado por quemado, sin alerta y sin vuelta atrás. Estas pruebas fijan la
 * frontera: **revert = veredicto de negocio; error de transporte = fallo del ciclo**.
 */
describe("isRevertError — revert de contrato frente a error de transporte", () => {
  it("reconoce un revert de viem envuelto en un BaseError", () => {
    const inner = new ContractFunctionRevertedError({
      abi: [],
      functionName: "ownerOf",
      data: "0x7e2732890000000000000000000000000000000000000000000000000000000000000065",
    });

    expect(isRevertError(new BaseError("call failed", { cause: inner }))).toBe(true);
    expect(isRevertError(inner)).toBe(true);
  });

  it("reconoce un revert ya normalizado por nombre", () => {
    expect(isRevertError(revertError())).toBe(true);
  });

  it("NO confunde un error de red con un revert (esa confusión era el defecto)", () => {
    expect(isRevertError(new Error("fetch failed: ECONNREFUSED"))).toBe(false);
    expect(isRevertError(new BaseError("timeout"))).toBe(false);
    expect(isRevertError("no es un error")).toBe(false);
    expect(isRevertError(null)).toBe(false);
  });
});

describe("BurnerService · error de transporte (H-01)", () => {
  let nftsRepo: MockNftsRepo;
  let queue: MockQueue;
  let publicClient: MockPublicClient;
  let walletClient: MockWalletClient;
  let service: BurnerService;
  let lock: InMemoryBurnLock;

  const options = {
    nftContractAddress: CONTRACT,
    operatorAddress: OPERATOR,
    minBalanceNative: 1,
    devopsEmail: "devops@hotel.es",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    nftsRepo = {
      getUnsoldExpiredNFTs: vi
        .fn()
        .mockResolvedValue(["10120260901", "10220260901", "10320260901"].map(nft)),
      updateNFTStatus: vi.fn().mockResolvedValue(true),
    } as MockNftsRepo;
    queue = { enqueueNotification: vi.fn().mockResolvedValue("notif-1") } as MockQueue;
    lock = new InMemoryBurnLock();
    publicClient = {
      getBalance: vi.fn().mockResolvedValue(10_000_000_000_000_000_000n),
      readContract: vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
        if (functionName === "burnBatchMax") return 10n;
        if (functionName === "ownerOf") return OPERATOR;
        throw new Error("no soportado");
      }),
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
      waitForTransactionReceipt: vi.fn(async () => ({ status: "success", logs: [] })),
    } as MockPublicClient;
    walletClient = {
      account: { address: OPERATOR },
      chain: { id: 81234 },
      writeContract: vi.fn().mockResolvedValue("0xburnhash"),
    } as unknown as MockWalletClient;
    service = new BurnerService(nftsRepo, queue, { now: () => TODAY, lock });
  });

  it("si la SIMULACIÓN falla por red, el ciclo falla con alerta y NO descarta candidatas en silencio", async () => {
    publicClient.simulateContract.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("ERROR");
    expect(result.executed).toBe(false);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    // Lo esencial: no se marca nada en la base (antes se marcaban como BURNED las 3).
    expect(nftsRepo.updateNFTStatus).not.toHaveBeenCalled();
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      "devops@hotel.es",
      expect.objectContaining({ subject: expect.stringContaining("fallo en la quema") }),
    );
  });

  it("si `ownerOf` falla por red, NO marca BURNED y el ciclo queda como error (índice intacto)", async () => {
    // El lote revierte (revert legítimo: la noche no es quemable) y luego se cae la red al reconciliar.
    publicClient.simulateContract.mockRejectedValue(revertError("execution reverted"));
    publicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "burnBatchMax") return 10n;
      if (functionName === "ownerOf") throw new Error("network error: socket hang up");
      throw new Error("no soportado");
    });

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("ERROR");
    expect(result.skippedTokens).toHaveLength(3);
    // Ni una fila marcada: un RPC mudo no puede convertir inventario vivo en `BURNED`.
    expect(nftsRepo.updateNFTStatus).not.toHaveBeenCalled();
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      "devops@hotel.es",
      expect.objectContaining({ subject: expect.stringContaining("reconciliación de la quema incompleta") }),
    );
  });

  it("si había candidatas VIVAS que no se pudieron quemar, el ciclo no se declara completado (H-05)", async () => {
    // Firmante sin BURNER_ROLE o contrato en pausa: todo revierte y los tokens siguen existiendo.
    publicClient.simulateContract.mockRejectedValue(revertError("AccessControlUnauthorizedAccount"));

    const result = await service.executeScheduledBurn(publicClient, walletClient, options);

    expect(result.reason).toBe("SKIPPED_ALL");
    expect(result.executed).toBe(false);
    expect(result.burnedTokensCount).toBe(0);
    expect(nftsRepo.updateNFTStatus).not.toHaveBeenCalled();
    expect(queue.enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      "devops@hotel.es",
      expect.objectContaining({ subject: expect.stringContaining("no quemó ninguna") }),
    );
  });
});
