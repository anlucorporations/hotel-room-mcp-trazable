import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sesión del back-office firmada con HMAC en una cookie (CU-01). Sin dependencias externas.
 * `SESSION_SECRET` se inyecta por entorno; es OBLIGATORIO en producción (fail-fast, CWE-798);
 * en dev cae a un valor inseguro y marcado.
 */
let cachedSecret: string | undefined;

// Lazy: se resuelve en el primer uso (runtime), no al importar el módulo, para no romper el
// build de Next. Falla fail-fast solo si en producción se usa sin SESSION_SECRET.
function secret(): string {
  if (cachedSecret !== undefined) return cachedSecret;
  const fromEnv = process.env.SESSION_SECRET;
  if (!fromEnv && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET es obligatorio en producción");
  }
  cachedSecret = fromEnv ?? "dev-insecure-session-secret-change-me";
  return cachedSecret;
}
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 h

export const SESSION_COOKIE = "hotel_admin_session";

export interface Session {
  readonly address: string;
  readonly exp: number;
}

export function signSession(address: string): string {
  const session: Session = { address: address.toLowerCase(), exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}
