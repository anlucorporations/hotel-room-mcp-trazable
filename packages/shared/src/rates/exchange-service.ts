import { getCachedEURRate, setCachedEURRate } from "../redis/client";

/**
 * Convierte un importe en **wei** (token nativo) a **céntimos de euro** con la tasa dada.
 *
 * Derivación: `1e18 wei = 1 nativo`; `EUR = nativo × tasa`; `cents = EUR × 100`. Con la tasa en
 * diezmilésimas (`r = round(tasa × 10000)`), `cents = wei × r / 1e20`. Se calcula en `bigint` para no
 * perder precisión con importes grandes; el resultado cabe holgadamente en `number`.
 *
 * Es una función **pura** (sin red) para poder probarla y para que el precio de una reserva pública
 * sea reproducible.
 */
export function weiToEurCents(wei: bigint | string, rateEurPerNative: number): number {
  if (!Number.isFinite(rateEurPerNative) || rateEurPerNative <= 0) return 0;
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  if (value <= 0n) return 0;
  const r = BigInt(Math.round(rateEurPerNative * 10000));
  return Number((value * r) / 10n ** 20n);
}

export interface RateResponse {
  rate: number;
  updatedAt: string;
  source: "cache" | "coingecko" | "binance" | "default";
  stale: boolean;
}

/**
 * `true` si `value` es un objeto JSON indexable (descarta `null`, arrays y primitivos).
 * Las respuestas de las APIs externas llegan como `unknown`: se estrechan campo a campo antes
 * de leerlas en lugar de confiar en un `any`.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class ExchangeRateService {
  private static readonly DEFAULT_RATE = 1.7; // 1 POL ≈ 1.70 EUR (default de emergencia)
  private coingeckoFailures = 0;
  private lastCoingeckoFailure = 0;
  private readonly CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minuto

  constructor(
    private readonly coingeckoUrl = "https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=eur",
    private readonly binanceUrl = "https://api.binance.com/api/v3/ticker/price?symbol=POLUSDT",
  ) {}

  /**
   * Obtiene la tasa de cambio POL/EUR.
   * 1. Consulta caché en Redis (< 5ms).
   * 2. Si no hay caché, consulta fuentes externas (CoinGecko → Binance).
   * 3. Si falla la red, devuelve caché vencida o tasa por defecto.
   */
  async getRate(): Promise<RateResponse> {
    // 1. Intentar lectura de caché en Redis
    try {
      const cached = await getCachedEURRate();
      if (cached) {
        return {
          rate: cached.rate,
          updatedAt: cached.updatedAt,
          source: "cache",
          stale: false,
        };
      }
    } catch (err) {
      console.warn("[ExchangeRate] Fallo al consultar caché en Redis:", err);
    }

    // 2. Caché expirada o vacía: refrescar desde proveedores externos
    return this.refreshRate();
  }

  /**
   * Consulta los proveedores externos y actualiza la caché en Redis (TTL: 5 min / 300s).
   */
  async refreshRate(): Promise<RateResponse> {
    let rate: number | null = null;
    let source: "coingecko" | "binance" | "default" = "default";

    // Probar CoinGecko si el circuit breaker no está abierto
    if (!this.isCircuitOpen()) {
      try {
        rate = await this.fetchCoinGecko();
        source = "coingecko";
        this.coingeckoFailures = 0;
      } catch (err) {
        this.coingeckoFailures++;
        this.lastCoingeckoFailure = Date.now();
        console.warn("[ExchangeRate] CoinGecko falló, conmutando a Binance:", err);
      }
    }

    // Fallback a Binance si CoinGecko falló
    if (rate === null) {
      try {
        rate = await this.fetchBinance();
        source = "binance";
      } catch (err) {
        console.error("[ExchangeRate] Binance también falló:", err);
      }
    }

    // Si ambos fallaron, intentar recuperar el último valor conocido de Redis o default
    if (rate === null) {
      return {
        rate: ExchangeRateService.DEFAULT_RATE,
        updatedAt: new Date().toISOString(),
        source: "default",
        stale: true,
      };
    }

    const updatedAt = new Date().toISOString();

    // Guardar en Redis con TTL de 300 segundos (5 minutos)
    try {
      await setCachedEURRate(rate, 300);
    } catch (err) {
      console.warn("[ExchangeRate] No se pudo persistir la tasa en Redis:", err);
    }

    return {
      rate,
      updatedAt,
      source,
      stale: false,
    };
  }

  private isCircuitOpen(): boolean {
    if (this.coingeckoFailures >= 3) {
      const elapsed = Date.now() - this.lastCoingeckoFailure;
      if (elapsed < this.CIRCUIT_BREAKER_RESET_MS) {
        return true;
      }
      // Medio abierto: permitir un reintento
      this.coingeckoFailures = 2;
    }
    return false;
  }

  private async fetchCoinGecko(): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(this.coingeckoUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const entry = isJsonObject(data) ? data["matic-network"] : undefined;
      const val = isJsonObject(entry) ? entry.eur : undefined;
      if (typeof val !== "number" || isNaN(val) || val <= 0) {
        throw new Error("Respuesta inválida de CoinGecko");
      }
      return val;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchBinance(): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      // POL/USDT en Binance (asumiendo 1 USDT ≈ 0.92 EUR de referencia o usando conversión directa)
      const res = await fetch(this.binanceUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const priceUsd = parseFloat(String(isJsonObject(data) ? data.price : undefined));

      if (isNaN(priceUsd) || priceUsd <= 0) {
        throw new Error("Respuesta inválida de Binance");
      }
      // Conversión aproximada USD a EUR (ratio 0.92)
      return Math.round(priceUsd * 0.92 * 1000) / 1000;
    } finally {
      clearTimeout(timeout);
    }
  }
}
