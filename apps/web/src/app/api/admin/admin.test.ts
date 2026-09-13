import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as postAdminMint } from "./mint/route";
import { GET as getAdminMetrics } from "./metrics/route";
import { NextRequest } from "next/server";

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<any>("@hotel/shared");
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      upsertNFT: vi.fn().mockResolvedValue({}),
      getFinancialMetrics: vi.fn().mockResolvedValue({
        primaryVolumeWei: "10000000000000000000",
        secondaryVolumeWei: "2000000000000000000",
        accumulatedRoyaltiesWei: "100000000000000000",
        soldCount: 50,
        mintedCount: 100,
        burnedCount: 5,
        commercialOccupancyPercent: 50,
      }),
    })),
    AuthService: vi.fn().mockImplementation(() => ({
      verifyTOTP: vi.fn().mockImplementation((token: string, _secret: string) => {
        return token === "123456";
      }),
    })),
  };
});

describe("Admin Endpoints (US-16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/admin/mint (Batch Minting with Re-MFA)", () => {
    it("debe rechazar con 403 si falta el header x-mfa-token", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/mint", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { roomNumber: 101, roomType: "SIMPLE", checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
          ],
        }),
      });
      const res = await postAdminMint(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("MFA_REQUIRED");
    });

    it("debe rechazar con 403 si el código MFA es inválido", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/mint", {
        method: "POST",
        headers: { "x-mfa-token": "000000" },
        body: JSON.stringify({
          items: [
            { roomNumber: 101, roomType: "SIMPLE", checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
          ],
        }),
      });
      const res = await postAdminMint(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("INVALID_MFA");
    });

    it("debe rechazar con 400 si la lista de items está vacía", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/mint", {
        method: "POST",
        headers: { "x-mfa-token": "123456" },
        body: JSON.stringify({ items: [] }),
      });
      const res = await postAdminMint(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("debe rechazar con 400 si el lote supera 50 tokens", async () => {
      const overFiftyItems = Array.from({ length: 51 }, (_, i) => ({
        roomNumber: 101,
        roomType: "SIMPLE" as const,
        checkInDate: `2026-09-${(i + 1).toString().padStart(2, "0")}`,
        basePriceWei: "100000000000000000",
      }));

      const req = new NextRequest("http://localhost:3000/api/admin/mint", {
        method: "POST",
        headers: { "x-mfa-token": "123456" },
        body: JSON.stringify({ items: overFiftyItems }),
      });
      const res = await postAdminMint(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BATCH_SIZE_EXCEEDED");
    });

    it("debe procesar el minteo masivo con éxito cuando el MFA es válido y lote <= 50", async () => {
      const items = [
        { roomNumber: 101, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
        { roomNumber: 102, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
      ];

      const req = new NextRequest("http://localhost:3000/api/admin/mint", {
        method: "POST",
        headers: { "x-mfa-token": "123456" },
        body: JSON.stringify({ items }),
      });
      const res = await postAdminMint(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("SUCCESS");
      expect(data.mintedCount).toBe(2);
      expect(data.tokenIds).toHaveLength(2);
      expect(data.tokenIds[0]).toBe("10120260915");
      expect(data.tokenIds[1]).toBe("10220260915");
    });
  });

  describe("GET /api/admin/metrics (Financial Dashboard)", () => {
    it("debe devolver las 7 métricas financieras en JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/metrics");
      const res = await getAdminMetrics(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.soldCount).toBe(50);
      expect(data.mintedCount).toBe(100);
      expect(data.burnedCount).toBe(5);
      expect(data.commercialOccupancyPercent).toBe(50);
      expect(data.primaryVolumePol).toBe("10");
      expect(data.secondaryVolumePol).toBe("2");
      expect(data.accumulatedRoyaltiesPol).toBe("0.1");
    });

    it("debe exportar las 7 métricas en CSV cuando format=csv", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/metrics?format=csv");
      const res = await getAdminMetrics(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(res.headers.get("Content-Disposition")).toContain("hotel_metrics_");

      const text = await res.text();
      expect(text).toContain("Volumen Primario");
      expect(text).toContain("Volumen Secundario");
      expect(text).toContain("Royalties Acumulados");
      expect(text).toContain("Ocupación Comercial");
    });
  });
});
