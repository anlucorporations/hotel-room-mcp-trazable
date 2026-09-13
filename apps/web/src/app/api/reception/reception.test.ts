import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as postCheckIn } from "./checkin/route";
import { POST as postContingency } from "./checkin/contingency/route";
import { NextRequest } from "next/server";

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<any>("@hotel/shared");
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      findNFTByTokenId: vi.fn(),
      markCheckedIn: vi.fn(),
      findNFTByRoomAndDate: vi.fn(),
      recordContingencyCheckIn: vi.fn(),
    })),
    ReceptionService: vi.fn().mockImplementation(() => ({
      processTicketCheckIn: vi.fn().mockImplementation(async (jws: string) => {
        if (jws === "invalid-jws") {
          throw new Error("Ticket JWS inválido o corrupto");
        }
        if (jws === "not-found-jws") {
          throw new Error("Token 9999 no encontrado en la base de datos");
        }
        return {
          tokenId: "10120260915",
          roomNumber: 101,
          roomType: "SIMPLE",
          checkInDate: "2026-09-15",
          guestWallet: "0x1234567890123456789012345678901234567890",
          executionTimeMs: 120,
          onChainDispatch: "QUEUED",
        };
      }),
      processContingencyCheckIn: vi.fn().mockImplementation(async (params: any) => {
        if (params.roomNumber === 999) {
          throw new Error("No se encontró reserva para la habitación 999 en fecha 2026-09-15");
        }
        return {
          tokenId: "10120260915",
          roomNumber: params.roomNumber,
          checkInDate: params.checkInDate,
          possessionProofType: params.possessionProofType,
          possessionProofValue: params.possessionProofValue,
          executionTimeMs: 150,
          onChainDispatch: "QUEUED",
        };
      }),
    })),
  };
});

describe("Reception Endpoints (US-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/reception/checkin", () => {
    it("debe rechazar con 400 si falta el ticketJws en el body", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postCheckIn(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("debe rechazar con 400 si el ticketJws es inválido", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin", {
        method: "POST",
        body: JSON.stringify({ ticketJws: "invalid-jws" }),
      });
      const res = await postCheckIn(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain("inválido");
    });

    it("debe devolver 404 si el token no existe", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin", {
        method: "POST",
        body: JSON.stringify({ ticketJws: "not-found-jws" }),
      });
      const res = await postCheckIn(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.message).toContain("no encontrado");
    });

    it("debe responder con 200 y éxito optimista < 500ms ante ticket válido", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin", {
        method: "POST",
        body: JSON.stringify({ ticketJws: "valid-ticket-jws" }),
      });
      const res = await postCheckIn(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.tokenId).toBe("10120260915");
      expect(data.executionTimeMs).toBeLessThan(500);
      expect(data.onChainDispatch).toBe("QUEUED");
    });
  });

  describe("POST /api/reception/checkin/contingency", () => {
    it("debe rechazar con 400 si faltan parámetros requeridos", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
        method: "POST",
        body: JSON.stringify({
          roomNumber: 101,
        }),
      });
      const res = await postContingency(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("debe devolver 404 si no se encuentra reserva para la habitación/fecha", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
        method: "POST",
        body: JSON.stringify({
          roomNumber: 999,
          checkInDate: "2026-09-15",
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: "0x1234567890123456789012345678901234567890",
        }),
      });
      const res = await postContingency(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.message).toContain("No se encontró reserva");
    });

    it("debe procesar el check-in de contingencia con éxito y registro PMS", async () => {
      const req = new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
        method: "POST",
        body: JSON.stringify({
          roomNumber: 101,
          checkInDate: "2026-09-15",
          possessionProofType: "TX_HASH",
          possessionProofValue: "0xabcdef1234567890",
          reason: "Cliente sin móvil, acreditado con hash de Polygonscan",
        }),
      });
      const res = await postContingency(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.tokenId).toBe("10120260915");
      expect(data.pmsRegistered).toBe(true);
      expect(data.possessionProofType).toBe("TX_HASH");
    });
  });
});
