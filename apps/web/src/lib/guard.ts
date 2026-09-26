import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AuthService, type AuthRole } from "@hotel/shared";
import type { RoleName } from "@hotel/shared/domain";

/**
 * Guard de autorización de las rutas de back-office y recepción (D-04, RNF-13).
 *
 * Antes de M3 NINGUNA ruta de `/api/admin/*` ni `/api/reception/*` validaba sesión: cualquiera
 * con acceso de red podía leer las métricas financieras o mintear. Este helper aplica, en este
 * orden y para TODAS esas rutas:
 *
 *   1. extrae el access token (cabecera `Authorization: Bearer` o cookie HttpOnly),
 *   2. verifica firma y expiración del JWT (HS256, `JWT_SECRET` obligatorio),
 *   3. comprueba la blocklist de Redis (logout/revocación inmediata),
 *   4. exige el rol declarado por la ruta.
 *
 * Sin token válido → **401**. Con sesión válida pero sin el rol → **403**. Errores de
 * configuración (secreto ausente, Redis caído) → **500**: cerrar en falso es preferible a
 * dejar pasar la petición.
 */

/** Cookie HttpOnly donde la web guarda el access token (el navegador no la lee). */
export const ACCESS_TOKEN_COOKIE = "hotel_access_token";
/** Cookie HttpOnly donde la web guarda el refresh token. */
export const REFRESH_TOKEN_COOKIE = "hotel_refresh_token";

/** Roles que puede exigir una ruta (subconjunto de los roles del contrato). */
export type RequiredRole = Extract<RoleName, "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE">;

export interface GuardedSession {
  readonly username: string;
  readonly role: AuthRole;
  readonly jti: string;
}

/**
 * Motivo del rechazo. `unauthorized` cubre "sin token / token inválido / revocado" (401) y
 * `forbidden` cubre "sesión válida sin el rol exigido" (403).
 */
export type GuardFailure = "unauthorized" | "forbidden" | "misconfigured";

export type GuardResult =
  | { ok: true; session: GuardedSession }
  | { ok: false; reason: GuardFailure; message: string };

const authService = new AuthService();

/** Lee una cookie del encabezado `Cookie` sin depender del contexto de Next (testeable). */
export function readRequestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? decodeURIComponent(value) : undefined;
  }
  return undefined;
}

/** Extrae el access token del encabezado `Authorization` o de la cookie HttpOnly. */
export function readAccessToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token.length > 0) return token;
  }
  return readRequestCookie(request, ACCESS_TOKEN_COOKIE);
}

/** Extrae el refresh token del cuerpo (si se aportó) o de la cookie HttpOnly. */
export function readRefreshToken(request: Request, body?: unknown): string | undefined {
  if (body && typeof body === "object" && "refreshToken" in body) {
    const fromBody = (body as { refreshToken?: unknown }).refreshToken;
    if (typeof fromBody === "string" && fromBody.length > 0) return fromBody;
  }
  return readRequestCookie(request, REFRESH_TOKEN_COOKIE);
}

/**
 * Valida la sesión y el rol exigido.
 *
 * `requiredRole` ausente = cualquier rol de back-office (`DEFAULT_ADMIN_ROLE` o
 * `RECEPTION_ROLE`). Un usuario autenticado con un rol fuera de esa lista se trata como
 * `forbidden` (rol insuficiente), no como `unauthorized`.
 *
 * El **owner** (`DEFAULT_ADMIN_ROLE`, D-30) satisface cualquier `requiredRole` exigido por una
 * ruta; el resto de roles necesitan coincidencia exacta (Recepción no accede a administración).
 * Sigue siendo autorización de aplicación: la cadena impone su propio `hasRole` al firmar.
 */
export async function authorize(request: Request, requiredRole?: RequiredRole): Promise<GuardResult> {
  const token = readAccessToken(request);
  if (!token) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Falta el token de acceso (Authorization: Bearer o cookie de sesión).",
    };
  }

  let payload: { sub: string; role: AuthRole; jti: string };
  try {
    payload = await authService.verifyAccessToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token inválido";
    // Un secreto ausente o Redis caído NO es "no autorizado": es una mala configuración. Se
    // distingue para no enmascarar un despliegue roto detrás de un 401.
    if (isConfigurationError(error)) {
      return { ok: false, reason: "misconfigured", message };
    }
    return { ok: false, reason: "unauthorized", message: "Token inválido, expirado o revocado." };
  }

  if (!isBackOfficeRole(payload.role)) {
    return {
      ok: false,
      reason: "forbidden",
      message: "El rol de la sesión no habilita el back-office.",
    };
  }

  if (requiredRole && payload.role !== requiredRole && payload.role !== "DEFAULT_ADMIN_ROLE") {
    return {
      ok: false,
      reason: "forbidden",
      message: `Esta operación requiere el rol ${requiredRole}.`,
    };
  }

  return { ok: true, session: { username: payload.sub, role: payload.role, jti: payload.jti } };
}

/** ¿El rol es uno de los dos que gobiernan el back-office (D-04)? */
function isBackOfficeRole(role: string): role is AuthRole {
  return role === "DEFAULT_ADMIN_ROLE" || role === "RECEPTION_ROLE";
}

/**
 * ¿El error proviene de configuración/arranque y no de la credencial presentada?
 * `MissingSecretError` (secreto sin configurar) y los fallos de conexión a Redis se tratan
 * como 500: la ruta no puede autorizar y debe cerrar en falso.
 *
 * OJO con el nombre del error: cuando Redis no responde, ioredis rechaza el comando con
 * `MaxRetriesPerRequestError` y el mensaje es "Reached the max retries per request limit…", que no
 * contiene "redis", "connect" ni "econnrefused". Clasificar solo por mensaje convertía una caída de
 * Redis en un 401 (credencial inválida) para todas las rutas protegidas, en contra del contrato
 * documentado de este guard.
 */
function isConfigurationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  return (
    message.includes("Secreto obligatorio no configurado") ||
    name === "MaxRetriesPerRequestError" ||
    /redis|econnrefused|enotfound|max retries per request|connect/i.test(message)
  );
}

/**
 * Variante para rutas Next: devuelve la sesión o la respuesta de error ya construida.
 * Uso:
 * ```ts
 * const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
 * if (!auth.ok) return auth.response;
 * const { username } = auth.session;
 * ```
 */
export async function requireRole(
  request: NextRequest | Request,
  requiredRole?: RequiredRole,
): Promise<
  | { ok: true; session: GuardedSession }
  | { ok: false; response: NextResponse }
> {
  const result = await authorize(request, requiredRole);
  if (result.ok) return result;

  const status = result.reason === "unauthorized" ? 401 : result.reason === "forbidden" ? 403 : 500;
  const error =
    result.reason === "unauthorized"
      ? "UNAUTHORIZED"
      : result.reason === "forbidden"
        ? "FORBIDDEN"
        : "SERVER_MISCONFIGURED";

  return {
    ok: false,
    response: NextResponse.json({ error, message: result.message }, { status }),
  };
}

/** Opciones de cookie para el access token: HttpOnly, SameSite=Lax y `Secure` en producción. */
export function accessTokenCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Opciones de cookie para el refresh token (7 días por defecto, `REFRESH_TOKEN_TTL_SECONDS`). */
export function refreshTokenCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
