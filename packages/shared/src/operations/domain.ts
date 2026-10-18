import { hashDomain } from "viem";
import type { Hex, TypedDataDomain } from "viem";
import {
  HOTEL_OPERATIONS_DOMAIN_NAME,
  HOTEL_OPERATIONS_DOMAIN_VERSION,
} from "../constants";

/**
 * Dominio EIP-712 de las operaciones (`RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2).
 *
 * `name` y `version` son constantes de protocolo: cambiarlos invalida TODAS las firmas antiguas
 * (el `domainSeparator` entra en el digest). `chainId` y `verifyingContract` se reciben por parámetro
 * porque el dominio se fija por despliegue (Besu 81234 en producción, Anvil en desarrollo) y la
 * verificación off-chain tiene que usar exactamente el mismo que el contrato.
 *
 * La **fuente única** del nombre y la versión es `constants.ts` (junto al resto de constantes de red):
 * aquí solo se reexportan con el nombre corto que consume el motor, para que el contrato, el motor y
 * las constantes no puedan divergir.
 */
export const OPERATIONS_DOMAIN_NAME = HOTEL_OPERATIONS_DOMAIN_NAME;

/** Versión del dominio: subirla es un corte de compatibilidad de firmas, no un cambio cosmético. */
export const OPERATIONS_DOMAIN_VERSION = HOTEL_OPERATIONS_DOMAIN_VERSION;

/**
 * Tipos de `EIP712Domain`, explícitos y en el orden canónico de EIP-712.
 *
 * `hashDomain` de viem los exige: sin ellos no puede codificar el `domainSeparator`. Se declaran una
 * sola vez para que hash y (en su caso) firma no puedan divergir.
 */
export const OPERATIONS_DOMAIN_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

/** Construye el dominio EIP-712 de operaciones para una red y un contrato concretos. */
export function operationsDomain(chainId: number, verifyingContract: `0x${string}`): TypedDataDomain {
  return {
    name: OPERATIONS_DOMAIN_NAME,
    version: OPERATIONS_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

/**
 * `domainSeparator` EIP-712: `keccak256(encodeType(EIP712Domain) ‖ encodeData(domain))`.
 *
 * Se calcula con `hashDomain` de viem (la misma ruta que valida el contrato al recomputar
 * `_domainSeparatorV4` equivalentes), y `operationsDomain.test.ts` comprueba además el resultado
 * contra el vector canónico del documento.
 */
export function operationsDomainSeparator(chainId: number, verifyingContract: `0x${string}`): Hex {
  return hashDomain({
    // `chainId` va como `bigint` porque `uint256` se codifica igual (el vector canónico lo comprueba)
    // y así el dominio encaja con el tipo de mensaje que infiere `types`.
    domain: {
      name: OPERATIONS_DOMAIN_NAME,
      version: OPERATIONS_DOMAIN_VERSION,
      chainId: BigInt(chainId),
      verifyingContract,
    },
    types: OPERATIONS_DOMAIN_TYPES,
  });
}
