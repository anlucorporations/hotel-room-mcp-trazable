/**
 * Doble EN MEMORIA del cliente de Redis (`ioredis`) para la suite de `@hotel/web`.
 *
 * Por qué en esta frontera y no mockeando `@hotel/shared`: el paquete se consume ya empaquetado
 * (`packages/shared/dist/index.js`), así que `AuthService.verifyAccessToken` / `logout` llaman a
 * `isJWTBlocked` / `blockJWT` DENTRO del bundle. Sustituir esos exports con
 * `vi.mock("@hotel/shared", …)` no afecta a esas llamadas internas: la prueba acabaría hablando
 * con el Redis real (y heredando su estado: un `jti-logout` revocado en una ejecución previa hizo
 * fallar la aserción contraria). La frontera que sí se puede sustituir sin tocar producción es el
 * cliente: `dist/index.js` lo importa como dependencia externa (`import { Redis } from 'ioredis'`)
 * y `vitest.config.ts` aliasa ese módulo a este fichero.
 *
 * Consecuencia buscada: ninguna prueba de la web abre una conexión real (ni Redis ni, por tanto,
 * `ECONNREFUSED` en CI), pero la lógica de negocio que se prueba sigue siendo la real (blocklist
 * incluida). Solo se implementa la superficie que usa `packages/shared/src/redis/client.ts`.
 */

interface Entry {
  value: string;
  /** `null` = sin expiración (equivale a `TTL -1`). */
  expiresAt: number | null;
}

const store = new Map<string, Entry>();

/**
 * Error forzado (simula Redis caído). Se lanza con la MISMA forma que produce ioredis cuando no
 * alcanza el servidor: `MaxRetriesPerRequestError` con ese mensaje, que NO contiene
 * "redis"/"connect"/"econnrefused" (comprobado contra ioredis 6 apuntando a un puerto cerrado).
 */
let forcedFailure: { name: string; message: string } | null = null;

/** Provoca que toda operación falle. `null` restaura el comportamiento normal. */
export function failFakeRedis(failure: { name: string; message: string } | null): void {
  forcedFailure = failure;
}

/** Redis inalcanzable: el error real de ioredis con `maxRetriesPerRequest`. */
export function failFakeRedisAsUnreachable(): void {
  failFakeRedis({
    name: "MaxRetriesPerRequestError",
    message:
      'Reached the max retries per request limit (which is 3). Refer to "maxRetriesPerRequest" option for details.',
  });
}

/** Vacía el almacén y retira cualquier fallo forzado. */
export function resetFakeRedis(): void {
  store.clear();
  forcedFailure = null;
}

/** Valor actual de una clave (`null` si no existe o expiró). */
export function fakeRedisGet(key: string): string | null {
  return live(key)?.value ?? null;
}

/** ¿La clave está en el almacén? */
export function fakeRedisHas(key: string): boolean {
  return live(key) !== undefined;
}

/** TTL restante en segundos con la misma convención que Redis (-2 ausente, -1 sin expiración). */
export function fakeRedisTtl(key: string): number {
  const entry = live(key);
  if (!entry) return -2;
  if (entry.expiresAt === null) return -1;
  return Math.ceil((entry.expiresAt - Date.now()) / 1000);
}

function live(key: string): Entry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

function assertReachable(): void {
  if (forcedFailure) {
    const error = new Error(forcedFailure.message);
    error.name = forcedFailure.name;
    throw error;
  }
}

/** Superficie mínima de `ioredis` que usa `packages/shared/src/redis/client.ts`. */
export class Redis {
  /** ioredis expone `status`; se anuncia listo para que ningún guard dependa de la conexión. */
  status = "ready";

  constructor(
    readonly url?: string,
    readonly options?: { maxRetriesPerRequest?: number },
  ) {}

  on(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  async get(key: string): Promise<string | null> {
    assertReachable();
    return live(key)?.value ?? null;
  }

  /** Soporta `SET key value [EX s] [NX]`, que es lo que usa el repositorio. */
  async set(key: string, value: string, ...args: Array<string | number>): Promise<"OK" | null> {
    assertReachable();
    const flags = args.map((arg) => String(arg).toUpperCase());
    if (flags.includes("NX") && live(key)) return null;

    const exIndex = flags.indexOf("EX");
    const ttlSeconds = exIndex >= 0 ? Number(args[exIndex + 1]) : null;
    store.set(key, {
      value: String(value),
      expiresAt: ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000,
    });
    return "OK";
  }

  async exists(key: string): Promise<number> {
    assertReachable();
    return live(key) ? 1 : 0;
  }

  async del(...keys: string[]): Promise<number> {
    assertReachable();
    let removed = 0;
    for (const key of keys) {
      if (store.delete(key)) removed += 1;
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    assertReachable();
    const current = live(key);
    const next = Number(current?.value ?? 0) + 1;
    store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    assertReachable();
    const entry = live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    assertReachable();
    return fakeRedisTtl(key);
  }

  async ping(): Promise<string> {
    assertReachable();
    return "PONG";
  }

  /**
   * `EVAL` del único script del repositorio (`releaseDistributedLock`: borra la clave si su valor
   * coincide). Cualquier otro script falla de forma explícita en vez de mentir.
   */
  async eval(script: string, _numKeys: number, ...args: string[]): Promise<number> {
    assertReachable();
    const isReleaseLock = script.includes('redis.call("get"') && script.includes('redis.call("del"');
    if (!isReleaseLock) {
      throw new Error("fake-redis: script Lua no soportado por el doble en memoria");
    }
    const [key, expected] = args;
    if (key === undefined || expected === undefined) {
      throw new Error("fake-redis: EVAL sin clave o sin valor esperado");
    }
    if (live(key)?.value !== expected) return 0;
    store.delete(key);
    return 1;
  }

  async quit(): Promise<"OK"> {
    return "OK";
  }

  disconnect(): void {
    // Sin conexión que cerrar.
  }
}

export default Redis;
