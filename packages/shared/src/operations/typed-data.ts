import { hashTypedData, keccak256, stringToHex } from "viem";
import type { Hex, TypedDataDomain } from "viem";
import { actionTypeHash, entityIdOf } from "./entity-id";
import { payloadHashOf } from "./payload";
import type { OperationalActionInput, OperationalActionMessage } from "./types";

/**
 * Mensaje firmado de una operación (vNext · F2 · T2.6):
 * `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2 y §4.2.1.
 *
 * La firma de tipo es `OperationalAction(bytes32 actionType,bytes32 entityId,bytes32 payloadHash,
 * bytes32 nonce,uint256 deadline)` y el digest es `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct)`.
 * Todo lo que aquí se construye tiene que coincidir **byte a byte** con lo que verifica el contrato:
 * un campo reordenado o un tipo cambiado no rompe el test de tipos, rompe la firma on-chain.
 */

/** Firma de tipo EIP-712 del mensaje. El orden de los campos ES el orden de la firma de tipo. */
export const OPERATIONAL_ACTION_TYPES = {
  OperationalAction: [
    { name: "actionType", type: "bytes32" },
    { name: "entityId", type: "bytes32" },
    { name: "payloadHash", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** `primaryType` del TypedData. */
export const OPERATIONAL_ACTION_PRIMARY_TYPE = "OperationalAction" as const;

/** TypedData completo tal y como lo consumen viem, wagmi y `eth_signTypedData_v4`. */
export interface OperationalTypedData {
  readonly domain: TypedDataDomain;
  readonly types: typeof OPERATIONAL_ACTION_TYPES;
  readonly primaryType: typeof OPERATIONAL_ACTION_PRIMARY_TYPE;
  readonly message: OperationalActionMessage;
}

/** Ensambla el TypedData (dominio + tipos + mensaje) que la wallet firma. */
export function operationalTypedData(
  domain: TypedDataDomain,
  message: OperationalActionMessage,
): OperationalTypedData {
  return {
    domain,
    types: OPERATIONAL_ACTION_TYPES,
    primaryType: OPERATIONAL_ACTION_PRIMARY_TYPE,
    message,
  };
}

/** Digest EIP-712 (`keccak256(0x1901 ‖ domainSeparator ‖ hashStruct)`), lo que firma la wallet. */
export function hashOperationalAction(
  domain: TypedDataDomain,
  message: OperationalActionMessage,
): Hex {
  return hashTypedData(operationalTypedData(domain, message));
}

/**
 * Traduce la entrada amigable (literal + UUID + payload) al mensaje firmable.
 *
 * Es la **única** traducción permitida: la app y el worker tienen que derivar `actionType`,
 * `entityId` y `payloadHash` con estos mismos helpers para no firmar algo que el contrato rechace.
 */
export function buildOperationalMessage(input: OperationalActionInput): OperationalActionMessage {
  return {
    actionType: actionTypeHash(input.actionType),
    entityId: entityIdOf(input.actionType, input.entityUuid),
    payloadHash: payloadHashOf(input.actionType, input.payload),
    nonce: input.nonce,
    deadline: input.deadline,
  };
}

/**
 * Nonce EIP-712 determinista a partir de una semilla: `keccak256(bytes(seed))`.
 *
 * Es solo una **convención de acuñación**: el llamador debe usar una semilla única por firma (p. ej.
 * el id del registro en `on_chain_signatures` o un UUID nuevo). El anti-replay de verdad lo imponen
 * el índice `uq_on_chain_signatures_nonce` en PostgreSQL y `consumedNonce[signer][nonce]` on-chain;
 * esta función no comprueba unicidad porque un módulo puro no puede consultar estado.
 */
export function deriveActionNonce(seed: string): Hex {
  return keccak256(stringToHex(seed));
}
