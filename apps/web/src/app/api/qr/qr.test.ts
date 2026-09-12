import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getQR } from "./[tokenId]/route";
import { POST as sendQREmail } from "./[tokenId]/send-email/route";

const { mockEnqueueEphemeralEmail, mockEnqueueNotification } = vi.hoisted(() => ({
  mockEnqueueEphemeralEmail: vi.fn().mockResolvedValue("ephemeral_12345"),
  mockEnqueueNotification: vi.fn().mockResolvedValue("notif_12345"),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hotel/shared")>();
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      getNFTById: vi.fn().mockImplementation(async (tokenId: string) => {
        if (tokenId === "10120260720") {
          return {
            tokenId: "10120260720",
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-07-20",
            checkOutDate: "2026-07-21",
            basePriceWei: "50000000000000000",
            status: "SOLD",
            currentOwner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            txHashMint: "0xminttx",
          };
        }
        return null;
      }),
    })),
    NotificationQueueService: vi.fn().mockImplementation(() => ({
      enqueueEphemeralEmail: mockEnqueueEphemeralEmail,
      enqueueNotification: mockEnqueueNotification,
    })),
  };
});

describe("QR Ticket Endpoints (US-10 & US-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/qr/:tokenId", () => {
    it("debe generar un payload QR con ticket JWS en hash fragment (#ticket=)", async () => {
      const req = new NextRequest("http://localhost:3000/api/qr/10120260720");
      const res = await getQR(req, {
        params: Promise.resolve({ tokenId: "10120260720" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tokenId).toBe("10120260720");
      expect(data.qrPayload).toContain("/checkin#ticket=");
      expect(data.expiresAt).toBeDefined();
    });

    it("debe devolver 404 si el token no existe", async () => {
      const req = new NextRequest("http://localhost:3000/api/qr/99999999");
      const res = await getQR(req, {
        params: Promise.resolve({ tokenId: "99999999" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/qr/:tokenId/send-email", () => {
    it("debe rechazar emails inválidos con 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/qr/10120260720/send-email", {
        method: "POST",
        body: JSON.stringify({ email: "correo-invalido" }),
      });
      const res = await sendQREmail(req, {
        params: Promise.resolve({ tokenId: "10120260720" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("debe encolar email efímero sin persistir en BD (RGPD art. 5.1.c)", async () => {
      const req = new NextRequest("http://localhost:3000/api/qr/10120260720/send-email", {
        method: "POST",
        body: JSON.stringify({ email: "huesped@ejemplo.com" }),
      });
      const res = await sendQREmail(req, {
        params: Promise.resolve({ tokenId: "10120260720" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("QUEUED");

      // Verificación de aislamiento RGPD: se llamó a enqueueEphemeralEmail y NO a enqueueNotification
      expect(mockEnqueueEphemeralEmail).toHaveBeenCalledTimes(1);
      expect(mockEnqueueEphemeralEmail).toHaveBeenCalledWith(
        "huesped@ejemplo.com",
        expect.objectContaining({
          tokenId: "10120260720",
          roomNumber: 101,
          qrPayload: expect.stringContaining("/checkin#ticket="),
        }),
      );
      expect(mockEnqueueNotification).not.toHaveBeenCalled();
    });
  });
});
