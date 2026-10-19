import "server-only";
import { jwtVerify } from "jose";
import { TERMINAL_SESSION_MAX_HOURS } from "@hotel/shared";
import type { TerminalSession } from "./terminal-session";

/**
 * Verificación de la sesión del terminal **en el render** de un Server Component (F5).
 * Falla en cerrado: sin cookie válida no se renderiza nada de la suite del técnico.
 */
export async function readTerminalSessionFromCookieHeader(
  cookieHeader: string,
): Promise<{ ok: true; session: TerminalSession } | { ok: false }> {
  const match = /(?:^|;\s*)hotel_terminal_token=([^;]+)/.exec(cookieHeader);
  if (!match) return { ok: false };
  const secretValue = process.env.JWT_SECRET;
  if (!secretValue) return { ok: false };
  try {
    const verified = await jwtVerify(decodeURIComponent(match[1] as string), new TextEncoder().encode(secretValue));
    const payload = verified.payload as Record<string, unknown>;
    const startedAt = typeof payload.startedAt === "string" ? payload.startedAt : null;
    if (payload.kind !== "terminal" || typeof payload.username !== "string" || startedAt === null) {
      return { ok: false };
    }
    if (Date.now() - new Date(startedAt).getTime() >= TERMINAL_SESSION_MAX_HOURS * 3_600_000) {
      return { ok: false };
    }
    return {
      ok: true,
      session: {
        kind: "terminal",
        operatorId: String(payload.operatorId ?? ""),
        username: payload.username,
        fullName: typeof payload.fullName === "string" ? payload.fullName : payload.username,
        role: payload.role as TerminalSession["role"],
        startedAt,
      },
    };
  } catch {
    return { ok: false };
  }
}
