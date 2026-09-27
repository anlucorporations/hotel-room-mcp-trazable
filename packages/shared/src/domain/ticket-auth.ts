import type { Address } from "viem";

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

/** Dominio EIP-712 del resguardo. El `chainId` y el contrato los sobreescribe el consumidor. */
export const QR_REDOWNLOAD_DOMAIN: EIP712TicketDomain = {
  name: "Hotel Marina del Sol",
  version: "1",
  chainId: 137, // Polygon PoS por defecto
  verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
};

/** Campos que firma el titular para volver a descargar su resguardo. */
export const QR_REDOWNLOAD_TYPES = {
  DownloadTicket: [
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

/**
 * Campos que firma el titular de una noche **consumida** al enviar su reseña (F6 · D-59).
 *
 * La nota (`rating`) va **dentro de la firma**: el servidor rechaza una reseña cuya nota no sea la
 * que el huésped firmó. Reutiliza el mismo dominio que el resguardo (`QR_REDOWNLOAD_DOMAIN`) y el
 * patrón de ADR-05 (nonce de un solo uso + vigencia corta).
 */
export const REVIEW_AUTH_TYPES = {
  SubmitReview: [
    { name: "tokenId", type: "uint256" },
    { name: "rating", type: "uint8" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;
