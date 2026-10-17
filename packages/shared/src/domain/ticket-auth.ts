import type { Address } from "viem";
import { WALLET_DOMAIN_NAME, WALLET_DOMAIN_VERSION } from "./wallet-messages";

/**
 * Tipos y mensaje EIP-712 con el que el titular autoriza la emisión de su resguardo (RF-07 · CU-08).
 *
 * Vive en `domain/` —y por tanto en el punto de entrada isomorfo `@hotel/shared/domain`— porque el
 * **cliente** tiene que construir exactamente el mismo mensaje que verifica el servidor: si el
 * componente de compra importara estos valores del barril raíz, arrastraría `node:crypto` (y con él
 * `pg`, `ioredis` y `bullmq`) al bundle del navegador y rompería la aplicación. Aquí no hay E/S: son
 * datos constantes y un tipo.
 */
export interface EIP712TicketDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/**
 * Dominio EIP-712 del resguardo. El `chainId` y el contrato los sobreescribe el consumidor.
 *
 * **v2 (ADR-30)**: el nombre sale de `WALLET_DOMAIN_NAME` y la versión de `WALLET_DOMAIN_VERSION`;
 * el mensaje firmado ya no es `{ tokenId, nonce, expiresAt }` sino
 * `{ motivo, habitacion, noche, nonce, validoHasta }` (ver `wallet-messages.ts`).
 */
export const QR_REDOWNLOAD_DOMAIN: EIP712TicketDomain = {
  name: WALLET_DOMAIN_NAME,
  version: WALLET_DOMAIN_VERSION,
  chainId: 137, // Polygon PoS por defecto
  verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
};

/**
 * Campos v2 (ADR-30) que firma el titular. Se re-exportan desde `wallet-messages.ts`, que es la
 * **fuente única**: cliente y servidor construyen y verifican con estas mismas estructuras.
 */
export {
  TICKET_AUTHORIZATION_TYPES,
  REVIEW_AUTHORIZATION_TYPES,
  TICKET_AUTHORIZATION_MOTIVO,
  REVIEW_AUTHORIZATION_MOTIVO,
  ticketAuthorizationMessage,
  reviewAuthorizationMessage,
} from "./wallet-messages";
