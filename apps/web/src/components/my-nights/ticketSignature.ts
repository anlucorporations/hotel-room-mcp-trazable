/**
 * Construcción del mensaje EIP-712 del resguardo (RF-07 · CU-08).
 *
 * Se aísla aquí (sin React ni wagmi) porque es la parte que tiene que ser **exactamente** la que
 * espera el servidor: el `tokenId` como `bigint`, la vigencia dentro del tope y el `nonce` tal cual.
 * Un error en cualquiera de las tres no rompe la compilación: produce un 401 al pedir el resguardo.
 */

/** Tope de vigencia de la firma. Debe coincidir con `MAX_SIGNATURE_TTL_SECONDS` de la API. */
export const TICKET_SIGNATURE_TTL_SECONDS = 120;

export interface TicketSignatureInput {
  readonly tokenId: string;
  readonly nonce: string;
  /** Instante actual en segundos UNIX (inyectable para poder probarlo sin reloj real). */
  readonly nowSeconds: number;
}

export interface TicketSignatureMessage {
  readonly tokenId: bigint;
  readonly nonce: string;
  readonly expiresAt: bigint;
}

/** Mensaje que firma el titular para autorizar la emisión de su resguardo. */
export function ticketSignatureMessage(input: TicketSignatureInput): TicketSignatureMessage {
  let tokenId: bigint;
  try {
    tokenId = BigInt(input.tokenId);
  } catch {
    throw new Error("tokenId inválido");
  }
  // Un `tokenId` decimal no es un identificador de noche: se rechaza en lugar de redondearlo.
  if (tokenId < 0n || `${tokenId}` !== input.tokenId.trim()) {
    throw new Error("tokenId inválido");
  }

  return {
    tokenId,
    nonce: input.nonce,
    expiresAt: BigInt(input.nowSeconds + TICKET_SIGNATURE_TTL_SECONDS),
  };
}
