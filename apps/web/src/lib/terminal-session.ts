import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { TERMINAL_SESSION_IDLE_MINUTES, TERMINAL_SESSION_MAX_HOURS } from "@hotel/shared";

/**
 * Sesión del **terminal de mantenimiento** (F5 · T5.1/T5.4/T5.5 · D-C35, RNF-M-18/20).
 *
 * El técnico no tiene wallet: se autentica con PIN en un terminal fijo y recibe un JWT corto en
 * cookie HttpOnly. La sesión caduca por **inactividad de 5 minutos** (el `exp` del token es corto y
 * cada petición autenticada lo renueva) y por **tope absoluto de 8 h** desde el login (claim
 * `startedAt`, que no se renueva). Así el token no puede prorrogarse indefinidamente.
 *
 * No se emiten permisos de back-office: el rol es el del operario (`MAINTENANCE_TECH`/`HOUSEKEEPER`)
 * y las APIs de terminal solo exponen lo asignado a ese usuario (D-C35).
 */

export const TERMINAL_TOKEN_COOKIE = "hotel_terminal_token";

export interface TerminalSession {
  readonly kind: "terminal";
  readonly operatorId: string;
  readonly username: string;
  readonly fullName: string;
  readonly role: "MAINTENANCE_TECH" | "HOUSEKEEPER";
  /** Instante de login (ISO). No se renueva: fija el tope absoluto de 8 h. */
  readonly startedAt: string;
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET no configurado: el terminal no puede emitir sesiones.");
  return new TextEncoder().encode(value);
}

/** Emite un token nuevo con caducidad corta (inactividad) conservando el inicio de sesión. */
export async function signTerminalToken(session: TerminalSession): Promise<string> {
  return new SignJWT({
    kind: "terminal",
    operatorId: session.operatorId,
    username: session.username,
    fullName: session.fullName,
    role: session.role,
    startedAt: session.startedAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TERMINAL_SESSION_IDLE_MINUTES}m`)
    .sign(secret());
}

export function readTerminalCookie(request: NextRequest): string | undefined {
  const value = request.cookies.get(TERMINAL_TOKEN_COOKIE)?.value;
  return value && value.length > 0 ? value : undefined;
}

export type TerminalSessionResult =
  | { ok: true; session: TerminalSession; refreshedToken: string }
  | { ok: false; reason: "unauthorized" | "expired"; message: string };

/**
 * Verifica la cookie del terminal y aplica el tope absoluto de 8 h. Devuelve también el token
 * renovado, que la ruta debe escribir en la respuesta para mantener viva la sesión activa.
 */
export async function readTerminalSession(request: NextRequest): Promise<TerminalSessionResult> {
  const token = readTerminalCookie(request);
  if (!token) {
    return { ok: false, reason: "unauthorized", message: "Sin sesión de terminal." };
  }
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, secret());
    payload = verified.payload as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "expired", message: "La sesión del terminal ha caducado." };
  }
  if (payload.kind !== "terminal" || typeof payload.username !== "string") {
    return { ok: false, reason: "unauthorized", message: "Token de terminal no válido." };
  }
  const startedAt = typeof payload.startedAt === "string" ? payload.startedAt : null;
  if (startedAt === null) {
    return { ok: false, reason: "unauthorized", message: "Sesión sin inicio declarado." };
  }
  const ageMs = Date.now() - new Date(startedAt).getTime();
  if (ageMs >= TERMINAL_SESSION_MAX_HOURS * 3_600_000) {
    return { ok: false, reason: "expired", message: "La sesión supera el máximo de 8 horas." };
  }
  const session: TerminalSession = {
    kind: "terminal",
    operatorId: String(payload.operatorId ?? ""),
    username: payload.username,
    fullName: typeof payload.fullName === "string" ? payload.fullName : payload.username,
    role: payload.role as TerminalSession["role"],
    startedAt,
  };
  return { ok: true, session, refreshedToken: await signTerminalToken(session) };
}

/** Cookie con la que se emite/renueva la sesión de terminal. */
export function terminalCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TERMINAL_SESSION_IDLE_MINUTES * 60,
  };
}
