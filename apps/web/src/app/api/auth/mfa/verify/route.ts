import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { AuthService, type AuthRole } from "@hotel/shared";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const authService = new AuthService();

/**
 * POST /api/auth/mfa/verify
 *
 * Segundo factor obligatorio (D-04): código TOTP de 6 dígitos o un código de rescate de un solo
 * uso. El reto (`sessionToken`) identifica al operador; el secreto TOTP se lee de
 * `admin_users.totp_secret_enc` (cifrado con AES-256-GCM) y se descifra en memoria.
 *
 * Ya no existe el mapa `USER_TOTP_SECRETS` con semillas embebidas: cada operador tiene la suya,
 * generada y persistida por el aprovisionamiento o por `POST /api/auth/mfa/setup`.
 *
 * En éxito emite access token (15 min) + refresh token (7 días con RTR) y los deja también en
 * cookies HttpOnly, para que el panel pueda navegar y descargar el CSV sin exponer el token a
 * JavaScript.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const body = (await request.json().catch(() => null)) as
      | { sessionToken?: unknown; totpCode?: unknown; recoveryCode?: unknown }
      | null;

    const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
    const totpCode = typeof body?.totpCode === "string" ? body.totpCode : undefined;
    const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode : undefined;

    if (!sessionToken || (!totpCode && !recoveryCode)) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "sessionToken y totpCode o recoveryCode requeridos" },
        { status: 400 },
      );
    }

    let challenge: { username: string; role: AuthRole };
    try {
      challenge = await authService.verifyChallengeToken(sessionToken);
    } catch {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Token de desafío MFA inválido o expirado" },
        { status: 401 },
      );
    }

    const result = await authService.verifyMfa({
      username: challenge.username,
      totpCode,
      recoveryCode,
      ipAddress: ip,
      userAgent,
    });

    if (result.error === "RATE_LIMITED") {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: "Demasiados intentos MFA fallidos. Bloqueado durante 15 minutos.",
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

    if (!result.accessToken || !result.refreshToken || !result.role) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Código TOTP o de rescate inválido" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      roles: [result.role],
      username: challenge.username,
      recoveryRemaining: result.recoveryRemaining,
    });

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      accessTokenCookieOptions(authService.accessTokenTtlSeconds()),
    );
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      refreshTokenCookieOptions(authService.refreshTokenTtlSeconds()),
    );
    return response;
  } catch (error: unknown) {
    console.error("[API /api/auth/mfa/verify] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al verificar MFA",
      },
      { status: 500 },
    );
  }
}
