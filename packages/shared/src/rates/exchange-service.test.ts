import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CURRENCY_SYMBOL } from "../constants";
import { ExchangeRateService, weiToEurCents } from "./exchange-service";
import * as redisClient from "../redis/client";

vi.mock("../redis/client", () => ({
  getCachedEURRate: vi.fn(),
  setCachedEURRate: vi.fn().mockResolvedValue(undefined),
}));

/**
 * F6 · D-65 (precio de la reserva pública) y **D-84** (defecto de la `v17`: el catálogo no dejaba
 * reservar). Las dos mitades del contrato se prueban aquí:
 *   · la conversión **redondea** y dice `null` cuando no puede dar un precio —nunca un 0 fingido—;
 *   · la tasa se pide al **activo nativo real** de la cadena (ETH), no a un residual del roadmap de
 *     Polygon (POL), que era la causa raíz del precio a 0 céntimos.
 */
describe("weiToEurCents (F6 · D-65, redondeo y null en lugar de 0 — D-84)", () => {
  it("convierte wei a céntimos con la tasa dada", () => {
    // 1 nativo = 1e18 wei; con tasa 2,0 EUR → 200 céntimos.
    expect(weiToEurCents(10n ** 18n, 2)).toBe(200);
    // 0,05 nativo con tasa 1,7 → 8,5 céntimos → 9 (redondeado; antes truncaba a 8).
    expect(weiToEurCents(5n * 10n ** 16n, 1.7)).toBe(9);
    // El caso real de producción con la tasa correcta: 0,05 ETH a 2.405,98 EUR/ETH = 120,30 €.
    expect(weiToEurCents("50000000000000000", 2405.98)).toBe(12030);
  });

  it("devuelve null con importe o tasa no válidos (null = «no sabemos», no «cuesta 0 €»)", () => {
    expect(weiToEurCents(0n, 1.7)).toBeNull();
    expect(weiToEurCents("-5", 1.7)).toBeNull();
    expect(weiToEurCents("no-es-wei", 1.7)).toBeNull();
    expect(weiToEurCents(10n ** 18n, 0)).toBeNull();
    expect(weiToEurCents(10n ** 18n, Number.NaN)).toBeNull();
    expect(weiToEurCents(10n ** 18n, Number.POSITIVE_INFINITY)).toBeNull();
    expect(weiToEurCents(10n ** 18n, null)).toBeNull();
    expect(weiToEurCents(10n ** 18n, undefined)).toBeNull();
  });

  /**
   * Regresión del síntoma reportado (D-84) y **frontera del redondeo** (decisión del responsable,
   * 2026-10-03). Con la tasa de POL medida en CoinGecko (0,112288 EUR) una noche de 0,05 ETH valía
   * 0,0056 € = 0,56 céntimos: el truncado la convertía en **0 céntimos** y la ruta de reserva
   * respondía 409 «no hay tarifa publicada» cuando sí la había.
   *
   * Decisión: **redondear al céntimo** (aquí, 1) y reservar `null` para «no se puede convertir»
   * —tasa ausente o importe que redondea a 0—, no para «es pequeño». Así un precio convertible no
   * desaparece del catálogo; el coste asumido es que un importe por debajo de medio céntimo se
   * declara no disponible en lugar de ofrecerse redondeado a 0,01 €.
   */
  it("un importe por debajo del céntimo redondea al céntimo (no se esconde el precio)", () => {
    expect(weiToEurCents("50000000000000000", 0.112288)).toBe(1);
  });

  it("es null cuando el redondeo da 0 céntimos (no hay precio representable)", () => {
    // 0,05 nativo × 0,08 EUR = 0,004 € = 0,4 céntimos → redondea a 0 → null.
    expect(weiToEurCents("50000000000000000", 0.08)).toBeNull();
  });

  it("acepta el importe como cadena (NUMERIC(78,0))", () => {
    expect(weiToEurCents("1000000000000000000", 1)).toBe(100);
  });
});

/**
 * El activo de la tasa debe ser el nativo de la cadena. La relación se declara aquí porque es
 * información de mercado, no de código: si `CURRENCY_SYMBOL` cambia, el test exige decidir la fuente.
 */
const COINGECKO_ID_BY_SYMBOL: Readonly<Record<string, string>> = {
  ETH: "ethereum",
  POL: "matic-network",
  MATIC: "polygon-pos",
};

describe("ExchangeRateService (US-06 · D-84: tasa del nativo real, sin número inventado)", () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExchangeRateService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pide la tasa del activo nativo de la cadena (hoy ETH), no la de un residual de Polygon", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);
    const expectedId = COINGECKO_ID_BY_SYMBOL[CURRENCY_SYMBOL];
    expect(expectedId, `mapeo declarado para el símbolo ${CURRENCY_SYMBOL}`).toBeTruthy();

    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ [expectedId]: { eur: 2405.98 } }), { status: 200 }),
    );

    const result = await service.getRate();

    const url = String((spy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain(`ids=${expectedId}`);
    expect(url).toContain("vs_currencies=eur");
    // Y el parseador lee la clave del id pedido (antes estaba fijada a `matic-network`).
    expect(result.rate).toBe(2405.98);
    expect(result.source).toBe("coingecko");
  });

  it("retorna la tasa desde la caché de Redis si existe (< 5ms)", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce({
      rate: 2400.5,
      updatedAt: "2026-09-10T12:00:00.000Z",
    });

    const result = await service.getRate();
    expect(result.source).toBe("cache");
    expect(result.rate).toBe(2400.5);
    expect(result.stale).toBe(false);
  });

  it("consulta CoinGecko y guarda en caché si Redis no tiene datos", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ethereum: { eur: 2410.25 } }), { status: 200 }),
    );

    const result = await service.getRate();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("coingecko");
    expect(result.rate).toBe(2410.25);
    expect(redisClient.setCachedEURRate).toHaveBeenCalledWith(2410.25, 300);
  });

  it("fallback Binance: un par cotizado EN EUROS se toma tal cual (sin conversión de FX)", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);
    const mockFetch = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko timeout"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ price: "2200.00" }), { status: 200 }));

    const result = await service.getRate();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("binance");
    expect(result.rate).toBe(2200);
  });

  it("fallback Binance: un par en USD convierte con el ratio documentado", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);
    // URL con par USDT: el servicio debe aplicar la conversión y avisar de la aproximación.
    const usdService = new ExchangeRateService(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur",
      "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko error"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ price: "2600.00" }), { status: 200 }));

    const result = await usdService.getRate();
    // 2600 × 0,92 = 2392
    expect(result.rate).toBe(2392);
    expect(result.source).toBe("binance");
  });

  /**
   * D-84: el `DEFAULT_RATE = 1.7` no era una tasa de emergencia de ETH, era la de POL: un número
   * inventado que producía precios plausibles y falsos. Sin tasa se devuelve `null`.
   */
  it("sin tasa de ningún proveedor devuelve null (no un número inventado) con stale=true", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko error"))
      .mockRejectedValueOnce(new Error("Binance error"));

    const result = await service.getRate();
    expect(result.source).toBe("default");
    expect(result.rate).toBeNull();
    expect(result.stale).toBe(true);
    // Y con tasa nula no se fabrica un precio: la reserva lo comunica, no lo cobra a 0.
    expect(weiToEurCents("50000000000000000", result.rate)).toBeNull();
  });

  it("no persiste en caché una tasa que no se pudo obtener", async () => {
    vi.mocked(redisClient.getCachedEURRate).mockResolvedValueOnce(null);
    vi.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"));

    await service.getRate();
    expect(redisClient.setCachedEURRate).not.toHaveBeenCalled();
  });
});
