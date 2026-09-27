import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type * as SharedModule from "@hotel/shared";
import { guardMock, resetGuardState, setGuardState } from "../../../../test/guard-mock";

vi.mock("@/lib/guard", () => guardMock);

/**
 * Doble del repositorio para poder inspeccionar exactamente lo que se persiste.
 *
 * `vi.hoisted` es obligatorio: Vitest iza las fábricas de `vi.mock` al principio del fichero, así
 * que una `const` declarada más abajo todavía no existe cuando la fábrica se evalúa
 * (`ReferenceError: Cannot access 'upsertNFT' before initialization`).
 */
const { upsertNFT, fetchAggregates, isNightReserved } = vi.hoisted(() => ({
  upsertNFT: vi.fn(),
  fetchAggregates: vi.fn(),
  isNightReserved: vi.fn(),
}));

vi.mock("@/lib/worker-api", () => ({ fetchAggregates }));

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>("@hotel/shared");
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      upsertNFT,
    })),
    // D-57: el minteo omite las noches retenidas por reservas activas; en el test no hay ninguna.
    ReservationsRepository: vi.fn().mockImplementation(() => ({
      isNightReserved,
    })),
    AuthService: vi.fn().mockImplementation(() => ({
      // La re-confirmación TOTP (RF-03) valida contra la semilla cifrada del operador.
      findUser: vi.fn().mockResolvedValue({
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        totpSecretEnc: "iv:tag:cipher",
      }),
      verifyUserTotp: vi.fn((_user: unknown, code: string) => code === "123456"),
      encryptCheckInSecret: vi.fn(() => "encrypted-secret"),
    })),
  };
});

import { POST as postAdminMint } from "./mint/route";
import { GET as getAdminMetrics } from "./metrics/route";

const VALID_TX_HASH = `0x${"a".repeat(64)}`;
const ZERO_TX_HASH = `0x${"0".repeat(64)}`;

function mintRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/mint", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("Admin Endpoints (US-16, D-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertNFT.mockResolvedValue({});
    // Por defecto ninguna noche está reservada (D-57).
    isNightReserved.mockResolvedValue(false);
    resetGuardState();
  });

  describe("Autorización de /api/admin/* (D-04)", () => {
    it("GET /api/admin/metrics responde 401 sin sesión", async () => {
      setGuardState("unauthorized");
      const res = await getAdminMetrics(new NextRequest("http://localhost:3000/api/admin/metrics"));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("UNAUTHORIZED");
    });

    it("GET /api/admin/metrics responde 403 con una sesión sin rol de back-office", async () => {
      setGuardState("forbidden");
      const res = await getAdminMetrics(new NextRequest("http://localhost:3000/api/admin/metrics"));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FORBIDDEN");
    });

    it("POST /api/admin/mint responde 401 sin sesión (antes no validaba nada)", async () => {
      setGuardState("unauthorized");
      const res = await postAdminMint(mintRequest({ items: [{ roomNumber: 101 }] }));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("UNAUTHORIZED");
    });

    it("POST /api/admin/mint responde 403 con una sesión sin el rol DEFAULT_ADMIN_ROLE", async () => {
      setGuardState("forbidden");
      const res = await postAdminMint(mintRequest({ items: [{ roomNumber: 101 }] }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FORBIDDEN");
    });
  });

  describe("POST /api/admin/mint (minteo masivo con re-MFA)", () => {
    it("debe rechazar con 403 si falta el código de re-confirmación TOTP", async () => {
      const res = await postAdminMint(
        mintRequest({
          items: [
            { roomNumber: 101, roomType: "SIMPLE", checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
          ],
        }),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("MFA_REQUIRED");
    });

    it("debe rechazar con 403 si el código TOTP es inválido", async () => {
      const res = await postAdminMint(
        mintRequest({
          confirmTotpCode: "000000",
          items: [
            { roomNumber: 101, roomType: "SIMPLE", checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
          ],
        }),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("INVALID_MFA");
    });

    it("debe rechazar con 400 si la lista de items está vacía", async () => {
      const res = await postAdminMint(mintRequest({ confirmTotpCode: "123456", items: [] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_REQUEST");
    });

    it("debe rechazar con 400 si el lote supera 50 tokens", async () => {
      const overFiftyItems = Array.from({ length: 51 }, (_, i) => ({
        roomNumber: 101,
        roomType: "SIMPLE" as const,
        checkInDate: `2026-09-${(i + 1).toString().padStart(2, "0")}`,
        basePriceWei: "100000000000000000",
      }));

      const res = await postAdminMint(mintRequest({ confirmTotpCode: "123456", items: overFiftyItems }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BATCH_SIZE_EXCEEDED");
    });

    it("debe rechazar con 422 si la operación no está anclada on-chain y no se autoriza el pendiente", async () => {
      const items = [
        { roomNumber: 101, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
      ];

      const res = await postAdminMint(mintRequest({ confirmTotpCode: "123456", items }));
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("ONCHAIN_ANCHOR_REQUIRED");
    });

    it("persiste como PENDIENTE DE ANCLAJE (202) con hash centinela y sin hash inventado", async () => {
      const items = [
        { roomNumber: 101, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
        { roomNumber: 102, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "100000000000000000" },
      ];

      const res = await postAdminMint(
        mintRequest({ confirmTotpCode: "123456", items, allowUnanchored: true }),
      );

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.status).toBe("PENDING_ANCHOR");
      expect(data.onChainAnchored).toBe(false);
      expect(data.tokenIds).toEqual(["10120260915", "10220260915"]);
      expect(data.unanchoredTokenIds).toHaveLength(2);

      // Ninguna fila se guarda con un hash ficticio: o el real, o el centinela cero.
      const calls = upsertNFT.mock.calls as Array<[Record<string, unknown>]>;
      expect(calls.length).toBeGreaterThan(0);
      for (const [nft] of calls) {
        expect(nft.txHashMint).toBe(ZERO_TX_HASH);
        expect(nft.onChainAnchored).toBe(false);
        expect(String(nft.txHashMint)).not.toContain("mint_");
      }
    });

    it("persiste como ANCLADA (200) cuando cada item trae un hash de transacción real", async () => {
      const items = [
        {
          roomNumber: 101,
          roomType: "SIMPLE" as const,
          checkInDate: "2026-09-15",
          basePriceWei: "100000000000000000",
          txHashMint: VALID_TX_HASH,
        },
      ];

      const res = await postAdminMint(mintRequest({ confirmTotpCode: "123456", items }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("SUCCESS");
      expect(data.onChainAnchored).toBe(true);
      expect(data.anchoredCount).toBe(1);
    });

    it("omite las noches reservadas y acuña el resto (D-57)", async () => {
      isNightReserved.mockImplementation(async (roomNumber: number) => roomNumber === 101);
      const items = [
        { roomNumber: 101, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "1" },
        { roomNumber: 102, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "1" },
      ];

      const res = await postAdminMint(mintRequest({ confirmTotpCode: "123456", items, allowUnanchored: true }));
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.mintedCount).toBe(1);
      expect(data.tokenIds).toEqual(["10220260915"]);
      expect(data.omittedReservedNights).toEqual([{ roomNumber: 101, checkInDate: "2026-09-15" }]);
    });

    it("devuelve 409 si todas las noches del lote están reservadas (D-57)", async () => {
      isNightReserved.mockResolvedValue(true);
      const items = [{ roomNumber: 101, roomType: "SIMPLE" as const, checkInDate: "2026-09-15", basePriceWei: "1" }];

      const res = await postAdminMint(mintRequest({ confirmTotpCode: "123456", items, allowUnanchored: true }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("RESERVED_NIGHTS");
      expect(upsertNFT).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/admin/metrics (panel financiero, fuente única del worker)", () => {
    /** Payload de agregados del worker: la MISMA cifra que ve el dashboard (D-16). */
    const aggregates = {
      primaryVolumeWei: "10000000000000000000",
      secondaryVolumeWei: "2000000000000000000",
      royaltiesWei: "100000000000000000",
      soldCount: 50,
      mintedCount: 100,
      burnedCount: 5,
      occupancyRatioPercent: 50,
      lastBlock: 1234,
      timeZone: "Europe/Madrid",
      undatedSalesCount: 2,
      monthlySeries: [
        {
          month: "2026-08",
          primaryVolumeWei: "10000000000000000000",
          secondaryVolumeWei: "2000000000000000000",
          primarySales: 50,
          secondarySales: 3,
        },
      ],
      roomTypeBreakdown: [
        {
          roomType: "simple",
          primarySales: 50,
          secondarySales: 3,
          primaryVolumeWei: "10000000000000000000",
          secondaryVolumeWei: "2000000000000000000",
          totalVolumeWei: "12000000000000000000",
        },
      ],
      topResold: [
        {
          tokenId: "10120260815",
          room: 101,
          dateYYYYMMDD: 20_260_815,
          roomType: "simple",
          resaleCount: 2,
          resaleVolumeWei: "1500000000000000000",
        },
      ],
    };

    beforeEach(() => {
      fetchAggregates.mockResolvedValue(aggregates);
    });

    it("debe devolver las métricas y los agregados de D-16 en JSON", async () => {
      const res = await getAdminMetrics(new NextRequest("http://localhost:3000/api/admin/metrics"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.soldCount).toBe(50);
      expect(data.mintedCount).toBe(100);
      expect(data.burnedCount).toBe(5);
      expect(data.commercialOccupancyPercent).toBe(50);
      expect(data.primaryVolumePol).toBe("10");
      expect(data.secondaryVolumePol).toBe("2");
      expect(data.accumulatedRoyaltiesPol).toBe("0.1");
      // Las tres secciones nuevas viajan tal cual (misma fuente que la pantalla).
      expect(data.monthlySeries).toHaveLength(1);
      expect(data.roomTypeBreakdown[0].roomType).toBe("simple");
      expect(data.topResold[0].tokenId).toBe("10120260815");
      expect(data.undatedSalesCount).toBe(2);
    });

    it("debe exportar KPIs, serie, desglose y ranking en CSV cuando format=csv", async () => {
      const res = await getAdminMetrics(
        new NextRequest("http://localhost:3000/api/admin/metrics?format=csv"),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(res.headers.get("Content-Disposition")).toContain("hotel_metrics_");

      const text = await res.text();
      expect(text).toContain("Volumen Primario");
      expect(text).toContain("Volumen Secundario");
      expect(text).toContain("Royalties Acumulados");
      expect(text).toContain("Ocupación Comercial");
      expect(text).toContain("Serie mensual (mes)");
      expect(text).toContain("2026-08");
      expect(text).toContain("Desglose por tipo");
      expect(text).toContain("Ranking de más revendidas");
    });

    it("si el worker no responde, responde 503 en vez de inventar ceros", async () => {
      fetchAggregates.mockRejectedValue(new Error("worker caído"));

      const res = await getAdminMetrics(new NextRequest("http://localhost:3000/api/admin/metrics"));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("DATA_UNAVAILABLE");
    });
  });
});
