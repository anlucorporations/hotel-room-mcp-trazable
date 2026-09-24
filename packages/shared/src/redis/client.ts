import { Redis } from "ioredis";
import { requireSecret } from "../env/index";

let globalRedis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!globalRedis) {
    // `REDIS_URL` es OBLIGATORIA (sin valor por defecto): la blocklist de JWT y el rate limiter
    // de D-04 no pueden degradar silenciosamente a un Redis local arbitrario.
    const url = requireSecret("REDIS_URL");
    // ioredis conecta al crear el cliente y ENCOLA los comandos hasta que la conexión está
    // lista. Antes se usaba `lazyConnect: true` + `enableOfflineQueue: false`, lo que hacía
    // fallar SIEMPRE la primera operación de Redis de cualquier proceso ("Stream isn't
    // writeable and enableOfflineQueue options is false"): el health check reportaba Redis
    // DOWN con Redis levantado y la blocklist de JWT no podía escribir. `maxRetriesPerRequest`
    // acota los reintentos por comando.
    globalRedis = new Redis(url, {
      maxRetriesPerRequest: 3,
    });

    globalRedis.on("error", (err) => {
      console.error("[Redis Client] Error de conexión:", err);
    });
  }
  return globalRedis;
}

/**
 * Cliente de Redis para **conexiones bloqueantes** (BullMQ `Worker`/`QueueEvents`).
 *
 * BullMQ exige `maxRetriesPerRequest: null` en las conexiones que bloquean (BRPOPLPUSH y familia):
 * con el cliente normal (`maxRetriesPerRequest: 3`) el `new Worker(...)` **lanza** y el consumidor
 * de la cola de correo no arranca nunca — que es exactamente lo que ocurría: la infraestructura de
 * la cola existía y no había forma de consumirla.
 */
let blockingRedis: Redis | null = null;

export function getBlockingRedisClient(): Redis {
  if (!blockingRedis) {
    const url = requireSecret("REDIS_URL");
    blockingRedis = new Redis(url, { maxRetriesPerRequest: null });
    blockingRedis.on("error", (err) => {
      console.error("[Redis Client] Error de conexión (bloqueante):", err);
    });
  }
  return blockingRedis;
}

export async function closeRedisClient(): Promise<void> {
  if (globalRedis) {
    await globalRedis.quit().catch(() => {});
    globalRedis = null;
  }
  if (blockingRedis) {
    await blockingRedis.quit().catch(() => {});
    blockingRedis = null;
  }
}

/**
 * Agrega un JTI a la blocklist de Redis con expiración igual a la vigencia del token (US-05).
 */
export async function blockJWT(jti: string, ttlSeconds: number, redis = getRedisClient()): Promise<void> {
  if (ttlSeconds <= 0) return;
  await redis.set(`hotel:jwt:blocklist:${jti}`, "1", "EX", Math.max(1, Math.ceil(ttlSeconds)));
}

/**
 * Verifica si un JTI se encuentra en la blocklist de tokens revocados (US-05).
 */
export async function isJWTBlocked(jti: string, redis = getRedisClient()): Promise<boolean> {
  const exists = await redis.exists(`hotel:jwt:blocklist:${jti}`);
  return exists === 1;
}

/**
 * Rate limiter distribuido en Redis basado en ventana deslizante / contador con TTL (ID_V-10).
 * Limita intentos fallidos por clave (IP + username).
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  _windowSeconds = 900, // 15 minutos
  redis = getRedisClient(),
): Promise<{ limited: boolean; remainingAttempts: number; retryAfterSeconds: number }> {

  const redisKey = `hotel:ratelimit:${key}`;
  const current = await redis.get(redisKey);
  const attempts = current ? parseInt(current, 10) : 0;

  if (attempts >= maxAttempts) {
    const ttl = await redis.ttl(redisKey);
    return {
      limited: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, ttl),
    };
  }

  return {
    limited: false,
    remainingAttempts: maxAttempts - attempts,
    retryAfterSeconds: 0,
  };
}

/**
 * Registra un intento fallido e incrementa el contador con TTL (ID_V-10).
 */
export async function recordFailedAttempt(
  key: string,
  windowSeconds = 900,
  redis = getRedisClient(),
): Promise<number> {
  const redisKey = `hotel:ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  return count;
}

/**
 * Restablece los intentos tras un login exitoso.
 */
export async function resetFailedAttempts(key: string, redis = getRedisClient()): Promise<void> {
  await redis.del(`hotel:ratelimit:${key}`);
}

/**
 * Guarda en caché la cotización POL/EUR en Redis con TTL de 5 minutos (US-06).
 */
export async function setCachedEURRate(
  rate: number,
  ttlSeconds = 300,
  redis = getRedisClient(),
): Promise<void> {
  const payload = JSON.stringify({
    rate,
    updatedAt: new Date().toISOString(),
  });
  await redis.set("hotel:rates:pol_eur", payload, "EX", ttlSeconds);
}

/**
 * Obtiene la cotización POL/EUR desde la caché de Redis (< 5ms de latencia, US-06).
 */
export async function getCachedEURRate(
  redis = getRedisClient(),
): Promise<{ rate: number; updatedAt: string } | null> {
  const cached = await redis.get("hotel:rates:pol_eur");
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * Consumo **de un solo uso** de una clave (SET NX EX). Devuelve `true` la primera vez y `false`
 * si ya se había consumido dentro del TTL.
 *
 * Uso (D-05): el `jti` de un resguardo de check-in y el `nonce` de una autorización EIP-712 se
 * consumen aquí, de modo que el **mismo QR no puede usarse dos veces** —ni en dos peticiones
 * simultáneas de dos puestos de recepción—. Es una garantía distribuida (multi-instancia), no un
 * `Map` en memoria del proceso.
 *
 * Falla en **cerrado**: si Redis no está disponible, la operación lanza y el check-in no se da por
 * bueno. Un registro de consumo caído no puede degradar silenciosamente a «sin protección».
 */
export async function consumeOnce(
  key: string,
  ttlSeconds: number,
  redis = getRedisClient(),
): Promise<boolean> {
  const acquired = await redis.set(key, "1", "EX", Math.max(1, Math.ceil(ttlSeconds)), "NX");
  return acquired === "OK";
}

/**
 * Libera un consumo previo (compensación). Se usa cuando el paso siguiente al consumo falla por
 * una causa de infraestructura: sin esto, un RPC caído «gastaría» el resguardo del huésped y no
 * habría forma de reintentar el check-in con el mismo QR.
 */
export async function releaseOnce(
  key: string,
  redis = getRedisClient(),
): Promise<void> {
  await redis.del(key);
}

/**
 * Adquiere un bloqueo distribuido (Redlock simplificado de clave única) en Redis (US-09).
 * Retorna el lockValue único si se adquirió con éxito, o null si ya estaba bloqueado.
 */
export async function acquireDistributedLock(
  lockKey: string,
  ttlSeconds = 30,
  redis = getRedisClient(),
): Promise<string | null> {
  const lockValue = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const acquired = await redis.set(lockKey, lockValue, "EX", ttlSeconds, "NX");
  return acquired === "OK" ? lockValue : null;
}

/**
 * Libera el bloqueo distribuido asegurando que el lockValue coincida atómicamente (script Lua).
 */
export async function releaseDistributedLock(
  lockKey: string,
  lockValue: string,
  redis = getRedisClient(),
): Promise<boolean> {
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(luaScript, 1, lockKey, lockValue);
  return result === 1;
}

