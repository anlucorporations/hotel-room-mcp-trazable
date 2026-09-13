import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReceptionService } from "./service";
import { createTicketJWS } from "../passes/jws";

describe("ReceptionService (US-14)", () => {
  let mockNftsRepo: any;
  let mockQueue: any;
  let mockPublicClient: any;
  let mockWalletClient: any;
  let service: ReceptionService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNftsRepo = {
      getNFTById: vi.fn().mockImplementation(async (tokenId: string) => {
        if (tokenId === "10120260720") {
          return {
            tokenId: "10120260720",
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-07-20",
            status: "SOLD",
            currentOwner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          };
        }
        if (tokenId === "already_checked_in") {
          return {
            tokenId: "already_checked_in",
            roomNumber: 102,
            roomType: "SUITE",
            checkInDate: "2026-07-20",
            status: "CHECKED_IN",
            currentOwner: "0x1111111111111111111111111111111111111111",
          };
        }
        return null;
      }),
      markCheckedIn: vi.fn().mockResolvedValue(true),
      findNFTByRoomAndDate: vi.fn().mockImplementation(async (room: number, date: string) => {
        if (room === 101 && date === "2026-07-20") {
          return {
            tokenId: "10120260720",
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-07-20",
            status: "SOLD",
            currentOwner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          };
        }
        return null;
      }),
      recordContingencyCheckIn: vi.fn().mockResolvedValue(undefined),
    };

    mockQueue = {
      enqueueNotification: vi.fn().mockResolvedValue("alert_id_123"),
    };

    mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(10_000_000_000_000_000_000n), // 10 POL
    };

    mockWalletClient = {
      account: { address: "0xreceptionwallet" },
      chain: { id: 137 },
      writeContract: vi.fn().mockResolvedValue("0xtxhashcheckin"),
    };

    service = new ReceptionService(
      mockNftsRepo,
      mockQueue,
      mockPublicClient,
      mockWalletClient,
      {
        nftContractAddress: "0xcontractaddress",
        receptionWalletAddress: "0xreceptionwallet",
        minBalancePol: 5,
        devopsEmail: "devops@marinadelsol.es",
      },
    );
  });

  describe("Check-in Optimista con JWS", () => {
    it("procesa exitosamente un ticket JWS válido en menos de 500ms", async () => {
      const start = Date.now();
      const ticketJws = await createTicketJWS({
        tokenId: "10120260720",
        roomNumber: 101,
        checkInDate: "2026-07-20",
        roomType: "SIMPLE",
        guestWallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      const result = await service.processTicketCheckIn(ticketJws);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
      expect(result.status).toBe("CHECKED_IN");
      expect(result.tokenId).toBe("10120260720");
      expect(result.roomNumber).toBe(101);
      expect(mockNftsRepo.markCheckedIn).toHaveBeenCalledWith("10120260720");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "markCheckedIn",
          args: [10120260720n],
        }),
      );
    });

    it("rechaza si la habitación ya realizó check-in", async () => {
      const ticketJws = await createTicketJWS({
        tokenId: "already_checked_in",
        roomNumber: 102,
        checkInDate: "2026-07-20",
        roomType: "SUITE",
        guestWallet: "0x1111111111111111111111111111111111111111",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(service.processTicketCheckIn(ticketJws)).rejects.toThrow(
        "ya ha realizado check-in previamente",
      );
    });

    it("emite alerta a DevOps si el saldo de la hot-wallet de recepción es < 5 POL", async () => {
      mockPublicClient.getBalance.mockResolvedValue(3_000_000_000_000_000_000n); // 3 POL (< 5 POL)

      const ticketJws = await createTicketJWS({
        tokenId: "10120260720",
        roomNumber: 101,
        checkInDate: "2026-07-20",
        roomType: "SIMPLE",
        guestWallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      await service.processTicketCheckIn(ticketJws);

      expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
        "DEVOPS_ALERT",
        "devops@marinadelsol.es",
        expect.objectContaining({
          subject: expect.stringContaining("Saldo bajo en hot-wallet"),
          currentBalancePol: 3,
        }),
      );
    });
  });

  describe("Protocolo de Contingencia Asistida", () => {
    it("permite check-in con factor de posesión verificado y registro en PMS", async () => {
      const result = await service.processContingencyCheckIn({
        roomNumber: 101,
        checkInDate: "2026-07-20",
        possessionProofType: "WALLET_ADDRESS",
        possessionProofValue: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        reason: "Huésped sin dispositivo móvil con DNI y wallet cotejada en mostrador",
      });

      expect(result.status).toBe("CHECKED_IN");
      expect(result.tokenId).toBe("10120260720");
      expect(mockNftsRepo.recordContingencyCheckIn).toHaveBeenCalledWith(
        "10120260720",
        expect.objectContaining({
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        }),
      );
    });

    it("falla si no se proporciona prueba de posesión", async () => {
      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: "",
          reason: "Sin teléfono",
        }),
      ).rejects.toThrow("Debe proporcionarse un valor de prueba de posesión");
    });
  });
});
