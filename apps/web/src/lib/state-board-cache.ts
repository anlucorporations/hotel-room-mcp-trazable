/**
 * Política de caché de muy corta vida del tablero de estados (A8 · RNF-M-05).
 *
 * Función pura para poder probar el TTL sin base de datos ni red: el tablero se refresca por
 * sondeo/SSE cada ≤2 s, así que compartir una lectura 1 s no retrasa la frescura más de un ciclo y
 * evita multiplicar consultas con peticiones concurrentes.
 */
export interface CacheEntry<T> {
  readonly key: string;
  readonly value: T & { readonly at: number };
}

export function isCacheFresh<T>(
  cached: CacheEntry<T> | null,
  key: string,
  now: number,
  ttlMs: number,
): boolean {
  return cached !== null && cached.key === key && now - cached.value.at < ttlMs;
}
