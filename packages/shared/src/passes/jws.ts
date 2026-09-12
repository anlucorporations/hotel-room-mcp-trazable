import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { verifyTypedData, type Address } from "viem";

export interface TicketPayload {
  tokenId: string;
  roomNumber: number;
  checkInDate: string;
  roomType: string;
  guestWallet: string;
  issuedAt: number;
  expiresAt: number;
}

// Clave de firma interna del servidor para JWS de tickets
const TICKET_SIGNING_SECRET = new TextEncoder().encode(
  process.env.TICKET_SIGNING_SECRET || "hotel_ticket_signing_secret_key_2026_at_least_32_chars",
);

/**
 * Genera un JWS compacto para el ticket de check-in que se entrega en el hash fragment (#ticket=<jws>).
 * El payload contiene la información validable sin exponer el secreto maestro al explorador ni a logs.
 */
export async function createTicketJWS(payload: TicketPayload): Promise<string> {
  return new SignJWT({ ...payload, type: "checkin_ticket" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(payload.issuedAt)
    .setExpirationTime(payload.expiresAt)
    .sign(TICKET_SIGNING_SECRET);
}

/**
 * Valida un ticket JWS recibido en recepción.
 */
export async function verifyTicketJWS(token: string): Promise<TicketPayload> {
  const { payload } = await jwtVerify(token, TICKET_SIGNING_SECRET);
  if (payload.type !== "checkin_ticket") {
    throw new Error("Tipo de ticket JWS inválido");
  }

  return {
    tokenId: payload.tokenId as string,
    roomNumber: payload.roomNumber as number,
    checkInDate: payload.checkInDate as string,
    roomType: payload.roomType as string,
    guestWallet: payload.guestWallet as string,
    issuedAt: payload.issuedAt as number,
    expiresAt: payload.expiresAt as number,
  };
}

/**
 * Descifra el checkInSecret almacenado en BD con AES-256-GCM.
 */
export function decryptSecret(encryptedSecret: string): string {
  const [ivHex, authTagHex, encryptedData] = encryptedSecret.split(":");
  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const encryptionKey = crypto
    .createHash("sha256")
    .update(process.env.CHECKIN_SECRET_KEY || "hotel_master_aes_key_32_bytes_2026")
    .digest();

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export interface EIP712TicketDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export const QR_REDOWNLOAD_DOMAIN: EIP712TicketDomain = {
  name: "Hotel Marina del Sol",
  version: "1",
  chainId: 137, // Polygon PoS por defecto
  verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
};

export const QR_REDOWNLOAD_TYPES = {
  DownloadTicket: [
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

/**
 * Verifica la firma EIP-712 de una wallet que solicita la descarga de un resguardo.
 */
export async function verifyEIP712TicketRequest(
  walletAddress: Address,
  signature: `0x${string}`,
  tokenId: bigint,
  nonce: string,
  expiresAt: bigint,
  domain: EIP712TicketDomain = QR_REDOWNLOAD_DOMAIN,
): Promise<boolean> {
  // Verificar si la petición ya expiró
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiresAt < now) {
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
