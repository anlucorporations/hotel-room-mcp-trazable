/**
 * Motor EIP-712 de operaciones (vNext · F2 · T2.6 / T2.9).
 *
 * Módulo **isomorfo**: solo usa `viem` y el serializador canónico puro del dominio. Un componente de
 * cliente tiene que poder construir y firmar exactamente el mismo TypedData que verifica el servidor
 * (y el contrato), así que este barril se expone tanto desde `src/index.ts` como desde `src/browser.ts`.
 *
 * Piezas:
 *   - `types`      — vocabulario y formas del mensaje.
 *   - `domain`     — dominio EIP-712 (`HotelOperations`/`1`) y su `domainSeparator`.
 *   - `entity-id`  — `actionTypeHash`, `uuidToBytes16`, `entityIdOf`.
 *   - `payload`    — `payloadHashOf` / `payloadHashFromCanonicalJson`.
 *   - `typed-data` — tipos, ensamblado del TypedData, digest, entrada amigable y nonce.
 *   - `verify`     — recuperación de firmante y comparación.
 */
export * from "./types";
export * from "./domain";
export * from "./entity-id";
export * from "./payload";
export * from "./typed-data";
export * from "./verify";
