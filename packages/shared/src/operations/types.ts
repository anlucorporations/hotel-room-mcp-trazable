import type { Hex } from "viem";
import type { SignatureEntityType } from "../domain/operations-state";

/**
 * Tipos del **motor EIP-712 de operaciones** (vNext · F2 · T2.6 / T2.9).
 *
 * El vocabulario de acciones es el **canónico de F1** (`SignatureEntityType`, 7 valores): el mismo que
 * imponen los `CHECK` de `on_chain_signatures.entity_type` en el esquema. No se declara una lista
 * nueva aquí a propósito; dos listas divergirían y la app firmaría una acción que el worker no sabe
 * derivar.
 */
export type OperationalActionType = SignatureEntityType;

/**
 * Mensaje EIP-712 tal y como entra en el TypedData: `actionType` ya es el `bytes32` hasheado y
 * `entityId`/`payloadHash` ya están derivados. Es lo que se firma y lo que reconstruye el verificador.
 */
export interface OperationalActionMessage {
  readonly actionType: Hex;
  readonly entityId: Hex;
  readonly payloadHash: Hex;
  readonly nonce: Hex;
  readonly deadline: bigint;
}

/**
 * Entrada **amigable** para construir el mensaje: la app conoce el literal de la acción, el UUID de
 * PostgreSQL y el payload de negocio, no sus hashes. `buildOperationalMessage` es la única traducción
 * permitida entre ambos mundos.
 */
export interface OperationalActionInput {
  readonly actionType: OperationalActionType;
  readonly entityUuid: string;
  readonly payload: unknown;
  readonly nonce: Hex;
  readonly deadline: bigint;
}
