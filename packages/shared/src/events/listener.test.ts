import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventListenerService } from "./listener";

describe("EventListenerService (US-07)", () => {
  let service: EventListenerService;
  let mockNftsRepo: any;
  let mockNotificationQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNftsRepo = {
      updateNFTStatus: vi.fn().mockResolvedValue(undefined),
      recordSaleEvent: vi.fn().mockResolvedValue(undefined),
      createListing: vi.fn().mockResolvedValue(undefined),
    };
    mockNotificationQueue = {
      enqueueNotification: vi.fn().mockResolvedValue("notif-1"),
    };

    service = new EventListenerService(
      {
        nftAddress: "0x1111111111111111111111111111111111111111",
        marketplaceAddress: "0x2222222222222222222222222222222222222222",
        carlosEmail: "carlos@hotel.es",
        devopsEmail: "devops@hotel.es",
        reorgConfirmations: 32,
        silenceThresholdMs: 600000,
      },
      mockNftsRepo,
      mockNotificationQueue,
    );
  });

  describe("Cifrado AES-256-GCM", () => {
    it("debe generar y cifrar un secreto con formato iv:authTag:encrypted", () => {
      const { plainSecret, encryptedSecret } = service.generateAndEncryptSecret();
      expect(plainSecret).toHaveLength(64); // 32 bytes hex
      const parts = encryptedSecret.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // 12 bytes IV
      expect(parts[1]).toHaveLength(32); // 16 bytes auth tag
    });
  });

  describe("Buffer de 32 Confirmaciones (Anti-Reorgs)", () => {
    it("debe retener evento en CONFIRMING y consolidar a SOLD solo al alcanzar 32 bloques", async () => {
      // 1. Recepción en bloque 100
      service.stageEvent("NFTSold", 100n, "0xtxsale", {
        tokenId: 10120260901n,
        seller: "0xseller",
        buyer: "0xbuyer",
        priceInWei: 100000000000000000n,
        royaltyAmount: 5000000000000000n,
        isSecondary: false,
      });

      expect(mockNftsRepo.updateNFTStatus).toHaveBeenCalledWith("10120260901", "CONFIRMING");
      expect(service.getStagedEventsCount()).toBe(1);

      // 2. Nuevo bloque 120 (diferencia: 20 bloques < 32)
      await service.onNewBlock(120n);
      expect(service.getStagedEventsCount()).toBe(1);
      expect(mockNftsRepo.recordSaleEvent).not.toHaveBeenCalled();

      // 3. Nuevo bloque 132 (diferencia: 32 bloques >= 32)
      await service.onNewBlock(132n);
      expect(service.getStagedEventsCount()).toBe(0);


      // Consolidación en PostgreSQL
      expect(mockNftsRepo.updateNFTStatus).toHaveBeenCalledWith(
        "10120260901",
        "SOLD",
        expect.objectContaining({
          currentOwner: "0xbuyer",
          checkInSecretEnc: expect.any(String),
        }),
      );
      expect(mockNftsRepo.recordSaleEvent).toHaveBeenCalledTimes(1);

      // Notificación enviada a Carlos
      expect(mockNotificationQueue.enqueueNotification).toHaveBeenCalledWith(
        "NFT_SOLD",
        "carlos@hotel.es",
        expect.objectContaining({ tokenId: "10120260901", buyer: "0xbuyer" }),
      );
    });
  });

  describe("Monitor de Silencio (> 10 min)", () => {
    it("debe alertar a DevOps si no se reciben bloques en > 10 min", async () => {
      // Simular bloque antiguo recibido hace 11 minutos
      const elevenMinutesAgo = Date.now() - 660000;
      (service as any).lastBlockTimestamp = elevenMinutesAgo;

      const alerted = await service.checkSilenceAlert();
      expect(alerted).toBe(true);
      expect(mockNotificationQueue.enqueueNotification).toHaveBeenCalledWith(
        "DEVOPS_ALERT",
        "devops@hotel.es",
        expect.objectContaining({ subject: expect.stringContaining("Silencio prolongado") }),
      );
    });
  });
});
