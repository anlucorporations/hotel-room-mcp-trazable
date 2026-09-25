import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { checkLiveness, checkReadiness } from "./service";

describe("HealthService (US-04)", () => {
  // Dobles parciales: solo se ejercita `query` (Postgres) y `ping` (Redis).
  let mockPool: Pool & { query: Mock };
  let mockRedis: Redis & { ping: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    } as Pool & { query: Mock };
    mockRedis = {
      ping: vi.fn().mockResolvedValue("PONG"),
    } as Redis & { ping: Mock };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkLiveness", () => {
    it("debe retornar ALIVE inmediatamente", async () => {
      const res = await checkLiveness();
      expect(res).toEqual({ status: "ALIVE" });
    });
  });

  describe("checkReadiness", () => {
    it("debe reportar READY si Postgres, Redis y RPC responden UP", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ result: "0x123456" }), { status: 200 }),
      );

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("READY");
      expect(res.dependencies.postgres).toBe("UP");
      expect(res.dependencies.redis).toBe("UP");
      expect(res.dependencies.polygonRPC).toBe("UP");
      expect(res.details).toBeUndefined();
    });

    it("debe reportar DEGRADED si Postgres falla", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("Connection refused"));
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ result: "0x123456" }), { status: 200 }),
      );

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("DEGRADED");
      expect(res.dependencies.postgres).toBe("DOWN");
      expect(res.dependencies.redis).toBe("UP");
      expect(res.details?.postgres).toBe("Connection refused");
    });

    it("debe reportar DEGRADED si Redis falla", async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error("Redis offline"));
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ result: "0x123456" }), { status: 200 }),
      );

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("DEGRADED");
      expect(res.dependencies.redis).toBe("DOWN");
      expect(res.details?.redis).toBe("Redis offline");
    });

    it("debe reportar DEGRADED si RPC falla", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("RPC timeout"));

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("DEGRADED");
      expect(res.dependencies.polygonRPC).toBe("DOWN");
      expect(res.details?.polygonRPC).toBe("RPC timeout");
    });

    /**
     * Regresión: el cliente ioredis encola comandos mientras conecta, así que una comprobación
     * sin límite de tiempo colgaría el readiness en lugar de degradarlo. Y con la configuración
     * anterior (`lazyConnect` + `enableOfflineQueue: false`) la primera operación fallaba
     * siempre con Redis levantado.
     */
    it("debe reportar Redis DOWN si la comprobación excede el tiempo límite", async () => {
      mockRedis.ping.mockImplementationOnce(() => new Promise(() => {})); // nunca resuelve
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ result: "0x123456" }), { status: 200 }),
      );

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("DEGRADED");
      expect(res.dependencies.redis).toBe("DOWN");
      expect(res.details?.redis).toContain("Tiempo de espera");
    }, 10_000);
  });
});
