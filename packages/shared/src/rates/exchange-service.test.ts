import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExchangeRateService } from "./exchange-service";
import * as redisClient from "../redis/client";

vi.mock("../redis/client", () => ({
  getCachedEURRate: vi.fn(),
  setCachedEURRate: vi.fn().mockResolvedValue(undefined),
}));

describe("ExchangeRateService (US-06)", () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExchangeRateService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debe retornar la tasa desde la caché de Redis si existe (< 5ms)", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce({
      rate: 1.85,
      updatedAt: "2026-09-10T12:00:00.000Z",
    });

    const result = await service.getRate();
    expect(result.source).toBe("cache");
    expect(result.rate).toBe(1.85);
    expect(result.stale).toBe(false);
  });

  it("debe consultar CoinGecko y guardar en caché si Redis no tiene datos", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);

    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "matic-network": { eur: 1.78 } }),
    } as any);

    const result = await service.getRate();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("coingecko");
    expect(result.rate).toBe(1.78);
    expect(redisClient.setCachedEURRate).toHaveBeenCalledWith(1.78, 300);
  });

  it("debe hacer fallback a Binance si CoinGecko falla", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);

    // CoinGecko falla
    const mockFetch = vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko timeout"))
      // Binance responde exitoso
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: "2.00" }),
      } as any);

    const result = await service.getRate();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("binance");
    // 2.00 * 0.92 = 1.84
    expect(result.rate).toBe(1.84);
    expect(redisClient.setCachedEURRate).toHaveBeenCalledWith(1.84, 300);
  });

  it("debe devolver valor por defecto con flag stale=true si CoinGecko y Binance fallan", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);

    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko error"))
      .mockRejectedValueOnce(new Error("Binance error"));

    const result = await service.getRate();
    expect(result.source).toBe("default");
    expect(result.rate).toBe(1.7);
    expect(result.stale).toBe(true);
  });
});
