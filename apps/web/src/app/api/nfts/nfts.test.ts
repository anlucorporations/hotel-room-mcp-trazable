import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getNFTs } from "./route";
import { GET as getNFTMetadata } from "./[tokenId]/metadata/route";
import { NextRequest } from "next/server";
import type * as SharedModule from "@hotel/shared";


vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>("@hotel/shared");
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      queryCatalog: vi.fn().mockResolvedValue({
        items: [
          {
            tokenId: "10120260901",
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-09-01",
            basePriceWei: "100000000000000000",
            status: "AVAILABLE",
            currentOwner: "0x1111111111111111111111111111111111111111",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      getNFTById: vi.fn().mockImplementation(async (id: string) => {
        if (id === "10120260901") {
          return {
            tokenId: "10120260901",
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-09-01",
            basePriceWei: "100000000000000000",
            status: "AVAILABLE",
            currentOwner: "0x1111111111111111111111111111111111111111",
          };
        }
        return null;
      }),
    })),
    ExchangeRateService: vi.fn().mockImplementation(() => ({
      getRate: vi.fn().mockResolvedValue({
        rate: 1.75,
        updatedAt: "2026-09-10T12:00:00Z",
        source: "cache",
        stale: false,
      }),
    })),
  };
});

describe("NFT Catalog & Metadata Endpoints (US-07b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/nfts", () => {
    it("debe retornar catálogo paginado junto con cotización EUR", async () => {
      const req = new NextRequest("http://localhost:3000/api/nfts?status=AVAILABLE&roomType=SIMPLE");
      const res = await getNFTs(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.eurExchangeRate).toBe(1.75);
      expect(data.exchangeRateSource).toBe("cache");
    });
  });

  describe("GET /api/nfts/:tokenId/metadata", () => {
    it("debe retornar metadatos estándar ERC-721 para token existente", async () => {
      const req = new NextRequest("http://localhost:3000/api/nfts/10120260901/metadata");
      const res = await getNFTMetadata(req, {
        params: Promise.resolve({ tokenId: "10120260901" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toContain("Habitación 101");
      expect(data.attributes).toBeDefined();
      const roomAttribute = (data.attributes as Array<{ trait_type: string; value: unknown }>).find(
        (a) => a.trait_type === "Habitación",
      );
      expect(roomAttribute?.value).toBe(101);
    });

    it("debe retornar 404 si el token no existe", async () => {
      const req = new NextRequest("http://localhost:3000/api/nfts/nonexistent/metadata");
      const res = await getNFTMetadata(req, {
        params: Promise.resolve({ tokenId: "nonexistent" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("NOT_FOUND");
    });
  });
});
