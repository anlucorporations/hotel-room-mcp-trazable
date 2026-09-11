import { Redis } from "ioredis";

let globalRedis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!globalRedis) {
    const url = process.env.REDIS_URL || "redis://127.0.0.1:6379/0";
    globalRedis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    globalRedis.on("error", (err) => {
      console.error("[Redis Client] Error de conexión:", err);
    });
  }
  return globalRedis;
}

export async function closeRedisClient(): Promise<void> {
  if (globalRedis) {
    await globalRedis.quit().catch(() => {});
    globalRedis = null;
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
