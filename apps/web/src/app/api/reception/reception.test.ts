import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

/**
 * `CheckInError` REAL (no mockeada): el mapeo código→HTTP que se prueba aquí es el de producción,
 * así que las pruebas construyen los errores con el mismo tipo que lanza el servicio.
 */
const { CheckInError } = await vi.importActual<typeof SharedModule>("@hotel/shared");

const { mockProcessTicket, mockProcessContingency } = vi.hoisted(() => ({
  mockProcessTicket: vi.fn(),
  mockProcessContingency: vi.fn(),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({})),
    NotificationQueueService: vi.fn().mockImplementation(() => ({})),
    ReceptionService: vi.fn().mockImplementation(() => ({
      processTicketCheckIn: mockProcessTicket,
      processContingencyCheckIn: mockProcessContingency,
    })),
  };
});

import { POST as postCheckIn } from "./checkin/route";
import { POST as postContingency } from "./checkin/contingency/route";

const CHECKED_IN_RESULT = {
  status: "CHECKED_IN",
  tokenId: "10120260915",
  roomNumber: 101,
  roomType: "SIMPLE",
  checkInDate: "2026-09-15",
  onChainTxHash: "0xanchorhash",
  onChainAnchor: "BROADCAST",
  executionTimeMs: 120,
};

describe("Reception Endpoints (US-14, D-04, D-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockProcessTicket.mockResolvedValue(CHECKED_IN_RESULT);
    mockProcessContingency.mockResolvedValue(CHECKED_IN_RESULT);
  });

  describe("Autorización de /api/reception/* (D-04)", () => {
    it("POST /api/reception/checkin responde 401 sin sesión", async () => {
      setGuardState("unauthorized");
      const res = await postCheckIn(
        new NextRequest("http://localhost:3000/api/reception/checkin", {
          method: "POST",
          body: JSON.stringify({ ticketJws: "valid-ticket-jws" }),
        }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("UNAUTHORIZED");
    });

    it("POST /api/reception/checkin responde 403 con una sesión sin RECEPTION_ROLE", async () => {
      setGuardState("forbidden");
      const res = await postCheckIn(
        new NextRequest("http://localhost:3000/api/reception/checkin", {
          method: "POST",
          body: JSON.stringify({ ticketJws: "valid-ticket-jws" }),
        }),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FORBIDDEN");
    });

    it("exige RECEPTION_ROLE (no cualquier rol) en el check-in", async () => {
      await postCheckIn(
        new NextRequest("http://localhost:3000/api/reception/checkin", {
          method: "POST",
          body: JSON.stringify({ ticketJws: "valid-ticket-jws" }),
        }),
      );
      expect(lastRequiredRole()).toBe("RECEPTION_ROLE");
    });

    it("POST /api/reception/checkin/contingency responde 401 sin sesión", async () => {
      setGuardState("unauthorized");
      const res = await postContingency(
        new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
          method: "POST",
          body: JSON.stringify({ roomNumber: 101 }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/reception/checkin/contingency responde 403 sin RECEPTION_ROLE", async () => {
      setGuardState("forbidden");
      const res = await postContingency(
        new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
          method: "POST",
          body: JSON.stringify({ roomNumber: 101 }),
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/reception/checkin", () => {
    it("debe rechazar con 400 si falta el ticketJws en el body", async () => {
      const res = await postCheckIn(
        new NextRequest("http://localhost:3000/api/reception/checkin", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_REQUEST");
    });

    it("devuelve el hash del ancla on-chain en el check-in correcto (D-05)", async () => {
      const res = await postCheckIn(
        new NextRequest("http://localhost:3000/api/reception/checkin", {
          method: "POST",
          body: JSON.stringify({ ticketJws: "valid-ticket-jws" }),
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.tokenId).toBe("10120260915");
      expect(data.onChainTxHash).toBe("0xanchorhash");
      expect(data.onChainAnchor).toBe("BROADCAST");
      expect(data.processedBy).toBe("admin@hotel.es");
    });

    it("el SEGUNDO escaneo del mismo resguardo responde 409 (uso único)", async () => {
      mockProcessTicket.mockRejectedValue(
        new CheckInError("TICKET_YA_USADO", "Este resguardo ya se utilizó para un check-in"),
      );

      const res = await postCheckIn(
        new NextRequest("http://localhost:3000/api/reception/checkin", {
          method: "POST",
          body: JSON.stringify({ ticketJws: "same-jws" }),
        }),
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("TICKET_YA_USADO");
    });

    it("mapea los códigos de dominio a HTTP (410 quemada, 502 ancla, 503 sin wallet)", async () => {
      const cases: Array<[string, number]> = [
        ["TOKEN_QUEMADO", 410],
        ["ANCLAJE_FALLIDO", 502],
        ["ANCLAJE_NO_CONFIGURADO", 503],
        ["YA_CONSUMIDA", 409],
        ["TOKEN_NO_ENCONTRADO", 404],
      ];

      for (const [code, status] of cases) {
        mockProcessTicket.mockRejectedValue(new CheckInError(code as never, `error ${code}`));
        const res = await postCheckIn(
          new NextRequest("http://localhost:3000/api/reception/checkin", {
            method: "POST",
            body: JSON.stringify({ ticketJws: "jws" }),
          }),
        );
        expect(res.status, `${code} → ${status}`).toBe(status);
        expect((await res.json()).error).toBe(code);
      }
    });
  });

  describe("POST /api/reception/checkin/contingency", () => {
    it("debe rechazar con 400 si faltan parámetros requeridos", async () => {
      const res = await postContingency(
        new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
          method: "POST",
          body: JSON.stringify({ roomNumber: 101 }),
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_REQUEST");
    });

    it("rechaza un tipo de prueba de posesión no admitido (400)", async () => {
      const res = await postContingency(
        new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
          method: "POST",
          body: JSON.stringify({
            roomNumber: 101,
            checkInDate: "2026-09-15",
            possessionProofType: "DNI",
            possessionProofValue: "12345678Z",
          }),
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("PRUEBA_POSESION_INVALIDA");
    });

    it("procesa el check-in de contingencia con prueba válida y ancla on-chain", async () => {
      const res = await postContingency(
        new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
          method: "POST",
          body: JSON.stringify({
            roomNumber: 101,
            checkInDate: "2026-09-15",
            possessionProofType: "TX_HASH",
            possessionProofValue: `0x${"ab".repeat(32)}`,
            reason: "RESGUARDO_IMPRESO",
          }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.tokenId).toBe("10120260915");
      expect(data.onChainTxHash).toBe("0xanchorhash");
    });

    it("propaga el rechazo por PII del servicio (400)", async () => {
      mockProcessContingency.mockRejectedValue(
        new CheckInError("PRUEBA_POSESION_CON_PII", "No se admiten documentos de identidad"),
      );

      const res = await postContingency(
        new NextRequest("http://localhost:3000/api/reception/checkin/contingency", {
          method: "POST",
          body: JSON.stringify({
            roomNumber: 101,
            checkInDate: "2026-09-15",
            possessionProofType: "VOUCHER_CODE",
            possessionProofValue: "12345678Z",
          }),
        }),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("PRUEBA_POSESION_CON_PII");
    });
  });
});
