import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireSecret } from "@hotel/shared/env";
import { ALL_ROLE_NAMES, type RoleName } from "@hotel/shared/domain";

/**
 * Sesión del back-office firmada con HMAC en una cookie (CU-01, docs/SRS.md §9, vía SIWE).
 *
 * D-04: este módulo ya NO autoriza el back-office ni protege ninguna API. La sesión canónica es
 * contraseña + TOTP + JWT (`/api/auth/*` + `@/lib/guard`). SIWE se conserva únicamente como
 * vía secundaria de identificación con wallet.
 *
 * `SESSION_SECRET` es OBLIGATORIO: el antiguo valor de desarrollo permitía forjar cookies de
 * sesión en cualquier despliegue al que le faltase la variable (CWE-798). Ahora `requireSecret`
 * falla en cerrado.
 */
function secret(): string {
  return requireSecret("SESSION_SECRET");
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 h

/** Nombre de la cookie de sesión SIWE (configurable por entorno). */
export const SESSION_COOKIE = process.env.SESSION_COOKIE || "hotel_admin_session";

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
