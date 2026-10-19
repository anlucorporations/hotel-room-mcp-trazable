import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { TerminalOperatorsError } from "@hotel/shared";
import { authenticateTerminalPin } from "@/lib/terminal-auth";
import {
  TERMINAL_TOKEN_COOKIE,
  readTerminalSession,
  signTerminalToken,
  terminalCookieOptions,
} from "@/lib/terminal-session";

export const dynamic = "force-dynamic";

/**
 * POST /api/terminal/auth — login del terminal por operario + PIN (F5 · T5.1/T5.4).
 *
 * Devuelve la sesión corta en cookie HttpOnly. Los fallos de PIN se agrupan en 401 (sin revelar si
 * el operario existe); el bloqueo por intentos responde 423 con `retryAfterSeconds`. GET valida y
 * renueva la sesión (inactividad 5 min); DELETE la cierra.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { username?: unknown; pin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.username !== "string" || typeof body.pin !== "string") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "username y pin son obligatorios." },
      { status: 400 },
    );
  }
  try {
    const result = await authenticateTerminalPin(body.username, body.pin);
    if (!result.ok) {
      const status = result.reason === "locked" ? 423 : result.reason === "inactive" ? 403 : 401;
      return NextResponse.json(
        {
          error: result.reason === "locked" ? "TERMINAL_LOCKED" : "TERMINAL_INVALID_CREDENTIALS",
          message: result.message,
          ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
        },
        { status },
      );
    }
    const token = await signTerminalToken(result.session);
    const response = NextResponse.json({
      operator: {
        id: result.operator.id,
        username: result.operator.username,
        fullName: result.operator.fullName,
        role: result.operator.role,
      },
      mustChangePin: result.mustChangePin,
      pinExpired: result.pinExpired,
    });
    response.cookies.set(TERMINAL_TOKEN_COOKIE, token, terminalCookieOptions());
    return response;
  } catch (error: unknown) {
    if (error instanceof TerminalOperatorsError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    console.error("[API /api/terminal/auth] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo iniciar la sesión del terminal." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readTerminalSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: "TERMINAL_UNAUTHORIZED", message: session.message }, { status: 401 });
  }
  const response = NextResponse.json({ session: session.session });
  response.cookies.set(TERMINAL_TOKEN_COOKIE, session.refreshedToken, terminalCookieOptions());
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TERMINAL_TOKEN_COOKIE, "", { ...terminalCookieOptions(), maxAge: 0 });
  return response;
}
