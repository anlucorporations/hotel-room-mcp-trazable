import { describe, it, expect, vi, beforeEach } from "vitest";
import { BurnerService } from "./service";
import * as redisClient from "../redis/client";

vi.mock("../redis/client", () => ({
  acquireDistributedLock: vi.fn(),
  releaseDistributedLock: vi.fn(),
}));

describe("BurnerService (US-09)", () => {
  let burnerService: BurnerService;
  let mockNftsRepo: any;
  let mockNotificationQueue: any;
  let mockPublicClient: any;
  let mockWalletClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNftsRepo = {
      getUnsoldExpiredNFTs: vi.fn(),
      updateNFTStatus: vi.fn().mockResolvedValue(undefined),
    };
    mockNotificationQueue = {
      enqueueNotification: vi.fn().mockResolvedValue("notif-1"),
    };
    mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(10000000000000000000n), // 10 POL
    };
    mockWalletClient = {
      writeContract: vi.fn().mockResolvedValue("0xtxburnbatch"),
      account: "0xoperator",
      chain: {},
    };

    burnerService = new BurnerService(mockNftsRepo, mockNotificationQueue);
  });

  it("no debe ejecutar si no puede adquirir el Redlock (otra instancia activa)", async () => {
    vi.mocked(redisClient.acquireDistributedLock).mockResolvedValueOnce(null);

    const result = await burnerService.executeScheduledBurn(mockPublicClient, mockWalletClient, {
      nftContractAddress: "0xnft",
      operatorAddress: "0xoperator",
    });

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("LOCKED");
  });

  it("debe suspender la ejecución y alertar a DevOps si el saldo es < 5 POL", async () => {
    vi.mocked(redisClient.acquireDistributedLock).mockResolvedValueOnce("lock-token-123");
    mockPublicClient.getBalance.mockResolvedValueOnce(4000000000000000000n); // 4 POL (< 5 POL)

    const result = await burnerService.executeScheduledBurn(mockPublicClient, mockWalletClient, {
      nftContractAddress: "0xnft",
      operatorAddress: "0xoperator",
      minBalancePol: 5,
      devopsEmail: "devops@hotel.es",
    });

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("INSUFFICIENT_GAS");
    expect(mockNotificationQueue.enqueueNotification).toHaveBeenCalledWith(
      "DEVOPS_ALERT",
      "devops@hotel.es",
      expect.objectContaining({ subject: expect.stringContaining("Saldo insuficiente") }),
    );
    expect(redisClient.releaseDistributedLock).toHaveBeenCalledWith("hotel:burn:lock", "lock-token-123");
  });

  it("debe ejecutar burnBatch y actualizar estado en BD si hay habitaciones vencidas", async () => {
    vi.mocked(redisClient.acquireDistributedLock).mockResolvedValueOnce("lock-token-123");
    mockNftsRepo.getUnsoldExpiredNFTs.mockResolvedValueOnce([
      { tokenId: "10120260901", status: "AVAILABLE" },
      { tokenId: "10220260901", status: "AVAILABLE" },
    ]);

    const result = await burnerService.executeScheduledBurn(mockPublicClient, mockWalletClient, {
      nftContractAddress: "0xnft",
      operatorAddress: "0xoperator",
    });

    expect(result.executed).toBe(true);
    expect(result.burnedTokensCount).toBe(2);
    expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(mockNftsRepo.updateNFTStatus).toHaveBeenCalledTimes(2);
    expect(redisClient.releaseDistributedLock).toHaveBeenCalledWith("hotel:burn:lock", "lock-token-123");
  });
});
