import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkLiveness, checkReadiness } from "./service";

describe("HealthService (US-04)", () => {
  let mockPool: any;
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    };
    mockRedis = {
      ping: vi.fn().mockResolvedValue("PONG"),
    };
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
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "0x123456" }),
      } as any);

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("READY");
      expect(res.dependencies.postgres).toBe("UP");
      expect(res.dependencies.redis).toBe("UP");
      expect(res.dependencies.polygonRPC).toBe("UP");
      expect(res.details).toBeUndefined();
    });

    it("debe reportar DEGRADED si Postgres falla", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("Connection refused"));
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "0x123456" }),
      } as any);

      const res = await checkReadiness("http://localhost:8545", mockPool, mockRedis);

      expect(res.status).toBe("DEGRADED");
      expect(res.dependencies.postgres).toBe("DOWN");
      expect(res.dependencies.redis).toBe("UP");
      expect(res.details?.postgres).toBe("Connection refused");
    });

    it("debe reportar DEGRADED si Redis falla", async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error("Redis offline"));
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "0x123456" }),
      } as any);

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
  });
});
