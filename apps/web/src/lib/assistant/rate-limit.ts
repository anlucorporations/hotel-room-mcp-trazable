/**
 * Limitador de peticiones del asistente IA (MAJOR#8). El endpoint conversa contra la API de
 * pago de Anthropic, así que un cliente abusivo puede dispararnos el coste o tumbar el servicio
 * (DoS). Este módulo es PURO y testeable: no conoce HTTP; recibe una clave (IP y/o wallet) y el
 * instante actual, y decide si la petición se admite, junto con un presupuesto de caracteres por
 * ventana para acotar el tamaño de la conversación enviada al LLM.
 *
 * Alcance: almacén EN MEMORIA, válido para el despliegue SINGLE-INSTANCE del piloto. En
 * multi-instancia (varios procesos/réplicas tras un balanceador) cada proceso tendría su propio
 * contador y el límite efectivo se multiplicaría: en ese escenario hay que externalizar el estado
 * a un almacén compartido (p. ej. Redis/Upstash) detrás de esta MISMA interfaz, sin tocar el route.
 *
 * SOLID: el route depende de la interfaz {@link RateLimiter}, no de la implementación.
 */

/** Resultado de evaluar una petición contra el limitador. */
export interface RateLimitDecision {
  /** `true` si la petición se admite; `false` si excede algún límite (→ 429). */
  readonly allowed: boolean;
  /**
   * Motivo del rechazo (solo cuando `allowed === false`). No se filtra al cliente con detalle;
   * sirve para logging/tests. `per-minute` (ráfaga), `daily` (tope diario) o `budget` (volumen
   * de caracteres por ventana del minuto).
   */
  readonly reason?: "per-minute" | "daily" | "budget";
  /** Segundos sugeridos hasta poder reintentar (cabecera `Retry-After`). */
  readonly retryAfterSeconds: number;
}

/** Límites configurables del limitador. Los valores por defecto son conservadores para el piloto. */
export interface RateLimitConfig {
  /** Máximo de peticiones por minuto y clave. */
  readonly maxPerMinute: number;
  /** Máximo de peticiones por día (UTC, ventana deslizante de 24 h) y clave. */
  readonly maxPerDay: number;
  /**
   * Presupuesto de caracteres de conversación admitidos por clave dentro de la ventana del
   * minuto. Acota el coste por sesión más allá del número de peticiones (una sola petición con
   * una conversación enorme también cuesta). 0 desactiva el control de presupuesto.
   */
  readonly maxCharsPerMinute: number;
}

/** Límites por defecto (single-instance, piloto). Conservadores para una conversación humana real. */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxPerMinute: 10,
  maxPerDay: 200,
  maxCharsPerMinute: 60_000,
};

/** Reloj inyectable para tests deterministas (por defecto `Date.now`). */
export type Clock = () => number;

/** Puerto del limitador (SOLID/DIP): el route depende de esto, no de la implementación. */
export interface RateLimiter {
  /**
   * Registra y evalúa una petición de `key` que aporta `chars` caracteres de conversación.
   * Debe llamarse UNA vez por petición admitida a evaluación, antes de invocar al LLM.
   */
  check(key: string, chars: number, now?: number): RateLimitDecision;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Bucket {
  /** Marcas de tiempo (ms) de las peticiones en la ventana del último minuto. */
  minuteHits: number[];
  /** Marcas de tiempo (ms) de las peticiones en la ventana de las últimas 24 h. */
  dayHits: number[];
  /** Caracteres acumulados en la ventana del último minuto. */
  minuteChars: number;
}

/** Elimina marcas anteriores a `now - windowMs` (ventana deslizante). */
function prune(hits: number[], now: number, windowMs: number): number[] {
  const threshold = now - windowMs;
  // Las marcas se insertan en orden creciente: basta con descartar el prefijo caducado.
  let i = 0;
  while (i < hits.length && hits[i]! <= threshold) i++;
  return i === 0 ? hits : hits.slice(i);
}

/**
 * Limitador deslizante en memoria. Single-instance: el estado vive en el proceso. Sin temporizadores
 * de fondo; la limpieza es perezosa al evaluar cada clave (apto para el volumen del piloto).
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly config: RateLimitConfig = DEFAULT_RATE_LIMIT,
    private readonly clock: Clock = Date.now,
  ) {}

  check(key: string, chars: number, now: number = this.clock()): RateLimitDecision {
    const bucket = this.buckets.get(key) ?? { minuteHits: [], dayHits: [], minuteChars: 0 };

    // Limpieza perezosa de ambas ventanas antes de decidir.
    bucket.minuteHits = prune(bucket.minuteHits, now, MINUTE_MS);
    bucket.dayHits = prune(bucket.dayHits, now, DAY_MS);
    if (bucket.minuteHits.length === 0) bucket.minuteChars = 0; // se vació la ventana del minuto.

    const deny = (
      reason: RateLimitDecision["reason"],
      retryAfterSeconds: number,
    ): RateLimitDecision => {
      // No se registra el intento denegado: un cliente bloqueado no debe extender su propia ventana.
      this.buckets.set(key, bucket);
      return { allowed: false, reason, retryAfterSeconds };
    };

    if (bucket.dayHits.length >= this.config.maxPerDay) {
      return deny("daily", retryAfter(bucket.dayHits[0]!, now, DAY_MS));
    }
    if (bucket.minuteHits.length >= this.config.maxPerMinute) {
      return deny("per-minute", retryAfter(bucket.minuteHits[0]!, now, MINUTE_MS));
    }
    const safeChars = Number.isFinite(chars) && chars > 0 ? chars : 0;
    if (
      this.config.maxCharsPerMinute > 0 &&
      bucket.minuteChars + safeChars > this.config.maxCharsPerMinute
    ) {
      return deny("budget", retryAfter(bucket.minuteHits[0] ?? now, now, MINUTE_MS));
    }

    // Admitida: se contabiliza.
    bucket.minuteHits.push(now);
    bucket.dayHits.push(now);
    bucket.minuteChars += safeChars;
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Segundos hasta que la marca más antigua salga de su ventana (mínimo 1). */
function retryAfter(oldestHit: number, now: number, windowMs: number): number {
  return Math.max(1, Math.ceil((oldestHit + windowMs - now) / 1000));
}
