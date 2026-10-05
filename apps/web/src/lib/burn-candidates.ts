/**
 * Selección de **candidatas a quema** (`burnExpired`, CU-13) a partir de los eventos de la cadena.
 *
 * Vive aparte del hook que la usa para poder probarla sin navegador ni RPC.
 *
 * Regla (defecto corregido el 2026-10-05): candidata = **minteada − vendida alguna vez − ya quemada**.
 *
 * Por qué importa descontar las quemadas: `_isExpired(tokenId)` en el contrato **solo mira la fecha**
 * del token, no si el token existe. Una noche ya quemada con fecha pasada sigue devolviendo
 * `isExpired == true`, así que el panel la ofrecía como candidata y `burnExpired` revertía con
 * `ERC721NonexistentToken` (0x7e273289) al intentar quemarla. La UI no debe anunciar lo que la cadena
 * va a revertir.
 *
 * Las vendidas se excluyen porque una noche que cambió de manos es de un cliente y el contrato la
 * rechaza con `AlreadySold`: nunca es inventario quemable del hotel.
 */
export interface MintedNight {
  readonly tokenId: bigint;
  readonly dateYYYYMMDD: bigint;
}

/**
 * Devuelve `tokenId → fecha (AAAAMMDD)` de las noches **candidatas** (antes de confirmar la fecha con
 * `isExpired`, que es lo que hace el escaneo después).
 */
export function selectBurnCandidates(
  mints: readonly MintedNight[],
  soldTokenIds: ReadonlySet<string>,
  burnedTokenIds: ReadonlySet<string>,
): Map<string, number> {
  const candidates = new Map<string, number>();
  for (const log of mints) {
    const id = log.tokenId.toString();
    if (soldTokenIds.has(id) || burnedTokenIds.has(id)) continue;
    candidates.set(id, Number(log.dateYYYYMMDD));
  }
  return candidates;
}
