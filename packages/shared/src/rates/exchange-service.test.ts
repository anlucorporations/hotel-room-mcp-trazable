import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExchangeRateService, weiToEurCents } from "./exchange-service";
import * as redisClient from "../redis/client";

vi.mock("../redis/client", () => ({
  getCachedEURRate: vi.fn(),
  setCachedEURRate: vi.fn().mockResolvedValue(undefined),
}));

/** F6 · D-65: el precio de la reserva pública se deriva de la tarifa en wei y la tasa EUR. */
describe("weiToEurCents (F6)", () => {
  it("convierte wei a céntimos con la tasa dada", () => {
    // 1 nativo = 1e18 wei; con tasa 2,0 EUR → 200 céntimos por nativo.
    expect(weiToEurCents(10n ** 18n, 2)).toBe(200);
    // 0,05 nativo con tasa 1,7 → 8,5 céntimos → 8 (truncado).
    expect(weiToEurCents(5n * 10n ** 16n, 1.7)).toBe(8);
  });

  it("devuelve 0 con importe o tasa no válidos", () => {
    expect(weiToEurCents(0n, 1.7)).toBe(0);
    expect(weiToEurCents("-5", 1.7)).toBe(0);
    expect(weiToEurCents(10n ** 18n, 0)).toBe(0);
    expect(weiToEurCents(10n ** 18n, Number.NaN)).toBe(0);
  });

  it("acepta el importe como cadena (NUMERIC(78,0))", () => {
    expect(weiToEurCents("1000000000000000000", 1)).toBe(100);
  });
});

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

    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ "matic-network": { eur: 1.78 } }), { status: 200 }),
    );

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
      .mockResolvedValueOnce(new Response(JSON.stringify({ price: "2.00" }), { status: 200 }));

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
