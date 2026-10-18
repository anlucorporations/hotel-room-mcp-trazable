/**
 * Serialización JSON **canónica** del proyecto: claves ordenadas en profundidad, sin espacios y en
 * UTF-8. El mismo contenido debe dar SIEMPRE el mismo texto, independientemente del orden en que se
 * construyeron los objetos.
 *
 * Por qué vive en el dominio **isomorfo** (y no en `db/repositories/audit.repository.ts`, donde nació):
 * la cadena de auditoría la usa para su hash determinista, pero el motor EIP-712 de operaciones
 * (`../operations`) también la necesita para derivar el `payloadHash` que se firma. Si el motor la
 * importara del repositorio, arrastraría `node:crypto` y `pg` al bundle del navegador y el cliente no
 * podría construir el mismo TypedData que verifica el servidor. Este módulo es **puro**: no importa
 * `node:*`, ni `pg`, ni nada con E/S.
 *
 * La implementación es, a propósito, exactamente la que había en el repositorio de auditoría: moverla
 * no puede cambiar ningún hash ya persistido.
 */

/** JSON con claves ordenadas en profundidad: el mismo contenido debe dar SIEMPRE el mismo texto. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}
