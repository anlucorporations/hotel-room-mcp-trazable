import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ALL_ROLE_NAMES, type RoleName } from "@hotel/shared";

/**
 * Sesión del back-office firmada con HMAC en una cookie (CU-01). Sin dependencias externas.
 * `SESSION_SECRET` se inyecta por entorno; es OBLIGATORIO en producción (fail-fast, CWE-798);
 * en dev cae a un valor inseguro y marcado.
 *
 * La sesión es una INSTANTÁNEA de los roles on-chain en el momento de autenticar (CU-01): se
 * usa solo para habilitar/deshabilitar UI. La autoridad sigue siendo el contrato (cada tx
 * revierte con `AccessControlUnauthorizedAccount` si la cuenta carece del rol, ADR-06).
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
  /** Roles on-chain que ostentaba la wallet al autenticar (instantánea, CU-01). */
  readonly roles: readonly RoleName[];
  readonly exp: number;
}

/** Conserva solo nombres de rol conocidos, en el orden canónico (defensa frente a payloads manipulados). */
function sanitizeRoles(roles: readonly string[] | undefined): RoleName[] {
  if (!Array.isArray(roles)) return [];
  return ALL_ROLE_NAMES.filter((name) => roles.includes(name));
}

export function signSession(address: string, roles: readonly RoleName[]): string {
  const session: Session = {
    address: address.toLowerCase(),
    roles: sanitizeRoles(roles),
    exp: Date.now() + SESSION_TTL_MS,
  };
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
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      address?: string;
      roles?: string[];
      exp?: number;
    };
    if (typeof parsed.address !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= Date.now()) return null;
    // Compatibilidad: tokens previos sin `roles` se tratan como sesión sin roles habilitados.
    return { address: parsed.address, roles: sanitizeRoles(parsed.roles), exp: parsed.exp };
  } catch {
    return null;
  }
}
