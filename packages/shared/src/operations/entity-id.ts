import { concatHex, keccak256, stringToHex } from "viem";
import type { Hex } from "viem";
import type { OperationalActionType } from "./types";

/**
 * Derivación canónica de `entityId` y del hash del tipo de acción (DT-AUD-03,
 * `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2.1).
 *
 * Qué bytes se hashean, exactamente:
 *
 * ```text
 * uuidToBytes16(uuid) = los 16 bytes crudos del UUID, sin guiones
 * entityId            = keccak256( actionType ‖ uuidToBytes16(uuid) )
 * ```
 *
 * `actionType` es el **literal ASCII** (`"ROOM_BLOCK"`, `"INSPECTION"`…), no su hash: es el mismo
 * literal cuya constante `keccak256("ROOM_BLOCK")` usa el contrato. `entityId` no contiene el UUID en
 * claro (RNF-M-07), pero es determinista: el worker lo deriva desde `entity_id` sin recalcularlo por
 * su cuenta.
 */

/**
 * UUID textual canónico `8-4-4-4-12` en hexadecimal. Se acepta cualquier valor de PostgreSQL (que
 * admite UUID sin exigir versión/variante RFC), pero se rechaza cualquier cosa que no sean 16 bytes:
 * un UUID mal formado produciría silenciosamente un `entityId` distinto del que el contrato espera.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Convierte el UUID textual en sus **16 bytes crudos** (`0x` + 32 hex), sin guiones.
 *
 * Lanza si el UUID no tiene la forma canónica: preferimos un error en el borde a firmar un `entityId`
 * que on-chain no cuadre.
 */
export function uuidToBytes16(uuid: string): Hex {
  if (typeof uuid !== "string" || !UUID_PATTERN.test(uuid)) {
    throw new Error(`uuidToBytes16: UUID mal formado: ${JSON.stringify(uuid)}`);
  }
  return `0x${uuid.replace(/-/g, "").toLowerCase()}`;
}

/** `keccak256` del literal ASCII de la acción: la misma constante que declara el contrato. */
export function actionTypeHash(actionType: OperationalActionType): Hex {
  return keccak256(stringToHex(actionType));
}

/**
 * `entityId` determinista de una entidad firmable: `keccak256(actionType ‖ uuidToBytes16(uuid))`.
 *
 * Se usa `concatHex` (no `encodePacked`) porque ambos operandos ya son bytes de longitud fija/conocida
 * y así el encoding no depende de reglas implícitas de relleno.
 */
export function entityIdOf(actionType: OperationalActionType, entityUuid: string): Hex {
  return keccak256(concatHex([stringToHex(actionType), uuidToBytes16(entityUuid)]));
}
