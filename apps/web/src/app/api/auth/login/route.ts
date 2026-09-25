import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { AuthService } from "@hotel/shared";

export const dynamic = "force-dynamic";

const authService = new AuthService();

/**
 * POST /api/auth/login
 *
 * Primer factor del sistema canónico (D-04): usuario + contraseña.
 * NO emite tokens de sesión: devuelve un `sessionToken` (JWT de reto, 10 min) que acredita que
 * la contraseña ya se validó y que debe canjearse en `POST /api/auth/mfa/verify` con el código
 * TOTP o un código de rescate. Sin segundo factor no hay sesión.
 *
 * El usuario sale de la tabla `admin_users`: ya no existen `SYSTEM_USERS` ni contraseñas
 * embebidas en el código.
 *
 * Códigos de estado:
 *   200 reto MFA emitido · 400 body inválido · 401 credenciales inválidas
 *   423 cuenta bloqueada temporalmente · 429 rate limiting (5 intentos / 15 min)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => null)) as
      | { username?: unknown; email?: unknown; password?: unknown }
      | null;

    // `email` se acepta como alias histórico de `username` (los usuarios del piloto son emails).
    const rawUsername = body?.username ?? body?.email;
    const username = typeof rawUsername === "string" ? rawUsername.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Usuario y contraseña requeridos" },
        { status: 400 },
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const result = await authService.loginWithPassword({ username, password, ipAddress: ip });

    if (result.error === "RATE_LIMITED") {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Demasiados intentos fallidos. Bloqueado durante 15 minutos. Reintente en ${result.retryAfterSeconds}s`,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    if (result.error === "ACCOUNT_LOCKED") {
      return NextResponse.json(
        {
          error: "ACCOUNT_LOCKED",
          message: "Cuenta bloqueada temporalmente por intentos fallidos. Reintente en 15 minutos.",
        },
        { status: 423 },
      );
    }

    if (!result.challengeRequired || !result.sessionToken) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Credenciales inválidas",
          remainingAttempts: result.remainingAttempts,
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      challengeRequired: true,
      sessionToken: result.sessionToken,
      username: result.username,
    });
  } catch (error: unknown) {
    console.error("[API /api/auth/login] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error de autenticación",
      },
      { status: 500 },
    );
  }
}
