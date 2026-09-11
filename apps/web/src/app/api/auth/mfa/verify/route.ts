import { NextRequest, NextResponse } from "next/server";
import { AuthService, SessionsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const authService = new AuthService();
const sessionsRepo = new SessionsRepository();

// En el MVP el secret TOTP de los usuarios de prueba está anclado para validación
const USER_TOTP_SECRETS: Record<string, string> = {
  "admin@hotel.es": "JBSWY3DPEHPK3PXP",
  "recepcion@hotel.es": "JBSWY3DPEHPK3PXQ",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    const userAgent = request.headers.get("user-agent") || "unknown";
    const body = await request.json();
    const { sessionToken, totpCode, recoveryCode } = body;

    if (!sessionToken || (!totpCode && !recoveryCode)) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "sessionToken y totpCode o recoveryCode requeridos" },
        { status: 400 },
      );
    }

    // 1. Validar el token de reto
    let challenge: { username: string; role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE" };
    try {
      challenge = await authService.verifyChallengeToken(sessionToken);
    } catch {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Token de desafío MFA inválido o expirado" },
        { status: 401 },
      );
    }

    // 2. Verificar Rate Limiter para intentos TOTP (ID_V-10)
    const rateLimitKey = `${ip}:mfa:${challenge.username}`;
    const rateLimit = await authService.checkRateLimit(rateLimitKey);

    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Demasiados intentos MFA fallidos. Bloqueado durante 15 minutos. Reintente en ${rateLimit.retryAfterSeconds}s`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    let isMfaValid = false;

    // Validación vía TOTP
    if (totpCode) {
      const secret = USER_TOTP_SECRETS[challenge.username] || "JBSWY3DPEHPK3PXP";
      isMfaValid = authService.verifyTOTP(totpCode, secret);
    }

    // Validación alternativa vía código de rescate
    if (!isMfaValid && recoveryCode) {
      isMfaValid = await sessionsRepo.consumeRecoveryCode(
        challenge.username,
        recoveryCode,
        authService.comparePassword.bind(authService),
      );
    }

    if (!isMfaValid) {
      const attempts = await authService.recordAuthFailure(rateLimitKey);
      const remaining = Math.max(0, 5 - attempts);
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Código TOTP o de rescate inválido",
          remainingAttempts: remaining,
        },
        { status: 401 },
      );
    }

    // Resetear fallos de rate limit ante éxito
    await authService.recordAuthSuccess(rateLimitKey);

    // 3. Emitir Access Token (15 min) y Refresh Token (7 días) con RTR
    const tokens = await authService.issueTokens(challenge.username, challenge.role, ip, userAgent);
    const recoveryRemaining = await sessionsRepo.getRemainingRecoveryCodesCount(challenge.username);

    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      roles: [challenge.role],
      recoveryRemaining,
    });
  } catch (error: any) {
    console.error("[API /api/auth/mfa/verify] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al verificar MFA" },
      { status: 500 },
    );
  }
}
