import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { changeTerminalPin } from "@/lib/terminal-auth";
import {
  TERMINAL_TOKEN_COOKIE,
  readTerminalSession,
  signTerminalToken,
  terminalCookieOptions,
} from "@/lib/terminal-session";

export const dynamic = "force-dynamic";

/**
 * POST /api/terminal/auth/change-pin — rotación obligatoria/en caliente del PIN (F5 · T5.3).
 *
 * Tras el cambio se renueva la sesión: el operario puede seguir trabajando sin volver a entrar.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const current = await readTerminalSession(request);
  if (!current.ok) {
    return NextResponse.json({ error: "TERMINAL_UNAUTHORIZED", message: current.message }, { status: 401 });
  }
  let body: { newPin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.newPin !== "string") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "newPin es obligatorio." }, { status: 400 });
  }
  const result = await changeTerminalPin(current.session.operatorId, body.newPin);
  if (!result.ok) {
    return NextResponse.json({ error: "PIN_INVALIDO", message: result.message }, { status: 400 });
  }
  const token = await signTerminalToken(current.session);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TERMINAL_TOKEN_COOKIE, token, terminalCookieOptions());
  return response;
}
