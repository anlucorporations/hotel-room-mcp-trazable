import { getCachedEURRate, setCachedEURRate } from "../redis/client";

/**
 * Convierte un importe en **wei** (token nativo) a **céntimos de euro** con la tasa dada.
 *
 * Derivación: `1e18 wei = 1 nativo`; `EUR = nativo × tasa`; `cents = EUR × 100`. Con la tasa en
 * diezmilésimas (`r = round(tasa × 10000)`), `cents = wei × r / 1e20`. Se calcula en `bigint` para no
 * perder precisión con importes grandes; el resultado cabe holgadamente en `number`.
 *
 * **D-84 (defecto de la `v17`, síntoma «el catálogo no me deja reservar»)**: esta función devolvía
 * `0` tanto cuando el importe o la tasa eran inválidos **como** cuando el valor real era menor de un
 * céntimo, porque la división entera **truncaba**. Con la tasa equivocada (POL en vez de ETH, ver
 * `ExchangeRateService`) una noche de 0,05 ETH daba `0,0056 €` → `0` céntimos, y la ruta de reserva
 * respondía `409 PRICE_UNAVAILABLE` diciendo que la habitación «no tiene tarifa publicada» cuando sí
 * la tiene. Ahora:
 *   · **redondea** al céntimo (no tira hacia abajo);
 *   · devuelve **`null`** cuando no se puede convertir (tasa ausente/no finita/≤ 0, importe no
 *     positivo, o un resultado que ni siquiera llega a un céntimo). `null` significa «no sabemos el
 *     precio», que es una cosa muy distinta de «cuesta 0 €» y obliga al llamador a decirlo.
 *
 * Es una función **pura** (sin red) para poder probarla y para que el precio de una reserva pública
 * sea reproducible.
 */
export function weiToEurCents(
  wei: bigint | string,
  rateEurPerNative: number | null | undefined,
): number | null {
  if (typeof rateEurPerNative !== "number" || !Number.isFinite(rateEurPerNative) || rateEurPerNative <= 0) {
    return null;
  }
  let value: bigint;
  try {
    value = typeof wei === "string" ? BigInt(wei) : wei;
  } catch {
    return null;
  }
  if (value <= 0n) return null;

  const r = BigInt(Math.round(rateEurPerNative * 10000));
  if (r <= 0n) return null;
  // Media unidad del divisor = redondeo al céntimo más cercano (1e20 / 2 = 5e19).
  const cents = Number((value * r + 5n * 10n ** 19n) / 10n ** 20n);
  return cents > 0 ? cents : null;
}

export interface RateResponse {
  /**
   * Eur por unidad nativa, o `null` cuando **ninguna** fuente lo pudo dar. Antes se inventaba un
   * `1.7` de emergencia (que era la tasa de POL) y el precio salía redondo y falso: sin tasa no hay
   * precio, y eso se comunica como `null` (D-84).
   */
  rate: number | null;
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

/** Proveedor de reserva: ratio USD→EUR usado SOLO si el par configurado es USD. */
const USD_TO_EUR = 0.92;

/**
 * Fuentes de la tasa. **D-84**: el proyecto cobró siempre en el nativo de la cadena (`CURRENCY_SYMBOL
 * = "ETH"`, `packages/shared/src/constants.ts:11`), pero estas URLs pedían **POL** (`matic-network` /
 * `POLUSDT`), herencia del roadmap de Polygon de D-12. Con la tasa de POL (0,112 EUR medido) una
 * noche de 0,05 ETH valía «0,0056 €» → 0 céntimos → el huésped no podía reservar.
 *
 * Se puede reconfigurar por entorno sin tocar código (`RATE_COINGECKO_URL` y
 * `BINANCE_FALLBACK_API_URL`, esta última ya declarada en `.env.example` y hasta ahora **ignorada**).
 */
const DEFAULT_COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur";
const DEFAULT_BINANCE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=ETH%2BEUR";

export class ExchangeRateService {
  private coingeckoFailures = 0;
  private lastCoingeckoFailure = 0;
  private readonly CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minuto

  constructor(
    private readonly coingeckoUrl = process.env.RATE_COINGECKO_URL?.trim() || DEFAULT_COINGECKO_URL,
    private readonly binanceUrl = process.env.BINANCE_FALLBACK_API_URL?.trim() || DEFAULT_BINANCE_URL,
  ) {}

  /**
   * Clave de la respuesta de CoinGecko: **se deriva de la URL** (`ids=<clave>`) en lugar de estar
   * escrita a mano. Así reconfigurar la moneda no puede dejar el parseador leyendo la clave anterior
   * (que era exactamente el defecto silencioso de POL).
   */
  private coingeckoKey(): string {
    const ids = new URL(this.coingeckoUrl).searchParams.get("ids");
    return ids?.split(",")[0]?.trim() || "ethereum";
  }

  /** ¿El par de Binance pide euros directamente (`…EUR`)? Si no, es USD y hay que convertirlo. */
  private binanceQuotesEur(): boolean {
    try {
      const symbol = new URL(this.binanceUrl).searchParams.get("symbol") ?? "";
      return /EUR(\/|$)/i.test(symbol) || /\+EUR$/i.test(symbol);
    } catch {
      return false;
    }
  }

  /**
   * Obtiene la tasa de cambio **EUR por unidad del nativo de la cadena** (hoy ETH, D-84).
   * 1. Consulta caché en Redis (< 5ms).
   * 2. Si no hay caché, consulta fuentes externas (CoinGecko → Binance).
   * 3. Si fallan todas, `rate: null`: **sin tasa no hay precio**, y el llamador lo dice.
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

    // Ninguna fuente respondió: NO se inventa un número (D-84). `rate: null` obliga al llamador a
    // decir «precio no disponible» en lugar de cobrar 0 € o bloquear la reserva con un 409 que
    // culpa a la habitación de un fallo nuestro.
    if (rate === null) {
      return {
        rate: null,
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
      // Clave derivada de `ids=` (D-84): antes estaba fijada a `matic-network`, de modo que cambiar
      // la moneda en la URL dejaba el parseador leyendo la clave vieja y la tasa se caía a nulo.
      const entry = isJsonObject(data) ? data[this.coingeckoKey()] : undefined;
      const val = isJsonObject(entry) ? entry.eur : undefined;
      if (typeof val !== "number" || isNaN(val) || val <= 0) {
        throw new Error(`Respuesta inválida de CoinGecko (clave "${this.coingeckoKey()}")`);
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
      const res = await fetch(this.binanceUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const price = parseFloat(String(isJsonObject(data) ? data.price : undefined));
      if (isNaN(price) || price <= 0) {
        throw new Error("Respuesta inválida de Binance");
      }

      // Par EUR (p. ej. `ETH+EUR`): el precio ya es euros, no se convierte nada.
      if (this.binanceQuotesEur()) return price;

      // Par USD: se convierte con un ratio fijo. Es una **aproximación** y se registra: llegar aquí
      // significa que el proveedor primario falló y que el precio mostrado lleva esa holgura.
      console.warn(
        `[ExchangeRate] USD→EUR aproximado por ${USD_TO_EUR} (par no cotizado en EUR): ${this.binanceUrl}`,
      );
      return Math.round(price * USD_TO_EUR * 1000) / 1000;
    } finally {
      clearTimeout(timeout);
    }
  }
}
