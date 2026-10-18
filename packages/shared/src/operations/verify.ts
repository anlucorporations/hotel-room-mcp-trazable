import { recoverTypedDataAddress } from "viem";
import type { Hex, TypedDataDomain } from "viem";
import { operationalTypedData } from "./typed-data";
import type { OperationalActionMessage } from "./types";

/**
 * Verificación off-chain de una firma de operación (vNext · F2 · T2.9).
 *
 * Es la comprobación **ágil y con mensajes ricos** que corre antes de aceptar `status = SIGNED`; el
 * contrato repite la misma verificación EIP-712 on-chain como prueba de no repudio. Las dos tienen
 * que usar el mismo TypedData: por eso ambas rutas de este módulo derivan de `operationalTypedData`.
 *
 * **Por qué son `async`:** la API mínima pedía una función síncrona, pero en viem toda la recuperación
 * de firmante es asíncrona —`recoverPublicKey`/`recoverAddress`/`recoverTypedDataAddress` cargan
 * `@noble/curves/secp256k1` con `await import(...)`, y hacerlo sync exigiría declarar `@noble/curves`
 * como dependencia directa del paquete. Con las dependencias permitidas (`viem`), la firma correcta
 * es `Promise`. El nombre, los parámetros y la semántica se mantienen; el consumidor solo tiene que
 * `await`. Queda reportado como desviación consciente de la API.
 */

/** Argumentos de `verifyOperationalSignature`. */
export interface VerifyOperationalSignatureArgs {
  readonly domain: TypedDataDomain;
  readonly message: OperationalActionMessage;
  readonly signature: Hex;
  /** Dirección que la app espera (la wallet activa del firmante). */
  readonly expectedSigner: `0x${string}`;
}

/**
 * Recupera la dirección que firmó el mensaje. Delega en `recoverTypedDataAddress` de viem: no se
 * reimplementa `ecrecover` ni el prefijo `0x1901`.
 */
export async function recoverOperationalSigner(
  domain: TypedDataDomain,
  message: OperationalActionMessage,
  signature: Hex,
): Promise<`0x${string}`> {
  return recoverTypedDataAddress({ ...operationalTypedData(domain, message), signature });
}

/**
 * ¿La firma es de `expectedSigner`? Compara en minúsculas para no depender del *checksum* EIP-55 con
 * el que llegue la dirección. No captura errores de una firma mal formada: `recoverTypedDataAddress`
 * rechaza, y eso es información (una firma corrupta no es "de otra persona").
 */
export async function verifyOperationalSignature(
  args: VerifyOperationalSignatureArgs,
): Promise<boolean> {
  const recovered = await recoverOperationalSigner(args.domain, args.message, args.signature);
  return recovered.toLowerCase() === args.expectedSigner.toLowerCase();
}
