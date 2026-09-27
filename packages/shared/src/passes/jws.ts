import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { verifyTypedData, type Address } from "viem";
import { requireSecret } from "../env/index";
import { decryptCheckInSecret, encryptCheckInSecret } from "../auth/crypto";

export interface TicketPayload {
  tokenId: string;
  roomNumber: number;
  checkInDate: string;
  roomType: string;
  guestWallet: string;
  issuedAt: number;
  expiresAt: number;
  /**
   * Identificador único del resguardo (D-05). Es lo que hace el pase **de un solo uso**: recepción
   * lo consume en Redis antes de anclar el check-in, así que el mismo QR no puede entrar dos veces
   * (ni con dos peticiones simultáneas desde dos puestos).
   */
  jti: string;
}

/**
 * Clave de firma interna del servidor para JWS de tickets.
 *
 * Se resuelve en el primer uso (no al importar el módulo) para no romper el build de Next, que
 * evalúa los módulos sin entorno de runtime. Sin `TICKET_SIGNING_SECRET` la firma/verificación
 * falla en cerrado: el literal por defecto del repositorio se eliminó (CWE-798).
 */
function ticketSigningSecret(): Uint8Array {
  return new TextEncoder().encode(requireSecret("TICKET_SIGNING_SECRET"));
}

/**
 * Genera un JWS compacto para el ticket de check-in que se entrega en el hash fragment (#ticket=<jws>).
 * El payload contiene la información validable sin exponer el secreto maestro al explorador ni a logs.
 *
 * Cada ticket lleva un `jti` propio (`randomUUID`): es la clave con la que recepción garantiza el
 * **uso único** del resguardo sin depender de la base de datos.
 */
export async function createTicketJWS(
  payload: Omit<TicketPayload, "jti"> & { jti?: string },
): Promise<string> {
  return new SignJWT({ ...payload, type: "checkin_ticket" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(payload.jti ?? randomUUID())
    .setIssuedAt(payload.issuedAt)
    .setExpirationTime(payload.expiresAt)
    .sign(ticketSigningSecret());
}

/**
 * Valida un ticket JWS recibido en recepción.
 *
 * Falla en cerrado si el ticket no trae `jti`: un resguardo sin identificador único no puede
 * garantizar el uso único y se rechaza (no se degrada a «sin protección»).
 */
export async function verifyTicketJWS(token: string): Promise<TicketPayload> {
  const { payload } = await jwtVerify(token, ticketSigningSecret());
  if (payload.type !== "checkin_ticket") {
    throw new Error("Tipo de ticket JWS inválido");
  }
  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    throw new Error("Ticket JWS sin identificador único (jti): no se puede garantizar el uso único");
  }

  return {
    tokenId: payload.tokenId as string,
    roomNumber: payload.roomNumber as number,
    checkInDate: payload.checkInDate as string,
    roomType: payload.roomType as string,
    guestWallet: payload.guestWallet as string,
    issuedAt: payload.issuedAt as number,
    expiresAt: payload.expiresAt as number,
    jti: payload.jti,
  };
}

/**
 * Cifra el `checkInSecret` que se persiste en `nfts.check_in_secret_enc` (AES-256-GCM).
 * La clave es `CHECKIN_SECRET_KEY` (obligatoria, sin valor por defecto).
 */
export function encryptSecret(rawSecret: string): string {
  return encryptCheckInSecret(rawSecret);
}

/**
 * Descifra el checkInSecret almacenado en BD con AES-256-GCM.
 */
export function decryptSecret(encryptedSecret: string): string {
  return decryptCheckInSecret(encryptedSecret);
}

export interface EIP712TicketDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/**
 * El dominio y los tipos del mensaje viven en `domain/ticket-auth.ts` (isomorfo) porque el CLIENTE
 * tiene que construir exactamente el mismo mensaje que aquí se verifica: si el componente de compra
 * los importara de este módulo, arrastraría `node:crypto` (y con él `pg`, `ioredis` y `bullmq`) al
 * bundle del navegador. Se reexportan para no romper a los consumidores de servidor que ya los
 * importaban desde `passes/jws`.
 */
import { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES, REVIEW_AUTH_TYPES } from "../domain/ticket-auth";
export { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES, REVIEW_AUTH_TYPES };

/**
 * Verifica la firma EIP-712 de una wallet que solicita la descarga de un resguardo.
 *
 * La vigencia declarada por el cliente (`expiresAt`) se acota por arriba: una autorización no
 * puede durar más de `maxTtlSeconds` (5 min por defecto). Sin este tope, el firmante podía pedir
 * un `expiresAt` a un año y dejar su firma reutilizable indefinidamente (el `nonce` de un solo uso
 * es la otra mitad de la defensa).
 */
export async function verifyEIP712TicketRequest(
  walletAddress: Address,
  signature: `0x${string}`,
  tokenId: bigint,
  nonce: string,
  expiresAt: bigint,
  domain: EIP712TicketDomain = QR_REDOWNLOAD_DOMAIN,
  maxTtlSeconds = 300,
): Promise<boolean> {
  // Verificar si la petición ya expiró o si pretende una vigencia mayor que la permitida
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiresAt < now) {
    return false;
  }
  if (expiresAt > now + BigInt(maxTtlSeconds)) {
    return false;
  }

  try {
    return await verifyTypedData({
      address: walletAddress,
      domain,
      types: QR_REDOWNLOAD_TYPES,
      primaryType: "DownloadTicket",
      message: {
        tokenId,
        nonce,
        expiresAt,
      },
      signature,
    });
  } catch (err) {
    console.error("[EIP712] Error al verificar firma:", err);
    return false;
  }
}

/**
 * Verifica la firma EIP-712 del titular de una noche **consumida** al enviar una reseña (F6 · D-59).
 *
 * Igual que el resguardo: la vigencia declarada se acota por arriba (5 min por defecto) y el `nonce`
 * es de un solo uso (lo consume el guardián). La diferencia es que la **nota** (`rating`) forma parte
 * del mensaje firmado, así que no se puede alterar después de firmar.
 */
export async function verifyEIP712ReviewRequest(
  walletAddress: Address,
  signature: `0x${string}`,
  tokenId: bigint,
  rating: number,
  nonce: string,
  expiresAt: bigint,
  domain: EIP712TicketDomain = QR_REDOWNLOAD_DOMAIN,
  maxTtlSeconds = 300,
): Promise<boolean> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiresAt < now) return false;
  if (expiresAt > now + BigInt(maxTtlSeconds)) return false;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return false;

  try {
    return await verifyTypedData({
      address: walletAddress,
      domain,
      types: REVIEW_AUTH_TYPES,
      primaryType: "SubmitReview",
      message: { tokenId, rating, nonce, expiresAt },
      signature,
    });
  } catch (err) {
    console.error("[EIP712] Error al verificar firma de reseña:", err);
    return false;
  }
}
