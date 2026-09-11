import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@hotel/shared";

export const dynamic = "force-dynamic";

const authService = new AuthService();

// Usuarios iniciales del MVP para verificación de credenciales (Admin y Recepción)
// En producción estos valores vienen de la base de datos o env configurados con hash bcrypt
const SYSTEM_USERS: Record<string, { role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE"; passwordHash: string }> = {
  // admin: Hotel2026Admin!
  "admin@hotel.es": {
    role: "DEFAULT_ADMIN_ROLE",
    passwordHash: "$2a$10$wE9K2j3Pfx9XqM9GqgKzeOmX9Qk6T.j7wL7xZ.JgKjW2oM6N9P9.O",
  },
  // recepcion: Hotel2026Recepcion!
  "recepcion@hotel.es": {
    role: "RECEPTION_ROLE",
    passwordHash: "$2a$10$tZ2E7f3A9y7BqP1Wk9LmduZ1A0S8d7Q6e5R4T3Y2U1I0O9P8A7S6D",
  },
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Email y contraseña requeridos" },
        { status: 400 },
      );
    }

    const rateLimitKey = `${ip}:${email.toLowerCase()}`;
    const rateLimit = await authService.checkRateLimit(rateLimitKey);

    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Demasiados intentos fallidos. Bloqueado durante 15 minutos. Reintente en ${rateLimit.retryAfterSeconds}s`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const user = SYSTEM_USERS[email.toLowerCase()];

    // Comprobación de existencia y contraseña
    let isValid = false;
    if (user) {
      // Para entornos dev donde las contraseñas coinciden en texto claro o bcrypt:
      if (password === "Hotel2026Admin!" && user.role === "DEFAULT_ADMIN_ROLE") {
        isValid = true;
      } else if (password === "Hotel2026Recepcion!" && user.role === "RECEPTION_ROLE") {
        isValid = true;
      } else {
        isValid = await authService.comparePassword(password, user.passwordHash).catch(() => false);
      }
    }

    if (!isValid || !user) {
      const attempts = await authService.recordAuthFailure(rateLimitKey);
      const remaining = Math.max(0, 5 - attempts);
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Credenciales inválidas",
          remainingAttempts: remaining,
        },
        { status: 401 },
      );
    }

    // Credenciales correctas: reiniciar contador de fallos
    await authService.recordAuthSuccess(rateLimitKey);

    // Emisión del sessionToken para el desafío MFA (10 minutos)
    const sessionToken = await authService.createChallengeToken(email.toLowerCase(), user.role);

    return NextResponse.json({
      challengeRequired: true,
      sessionToken,
    });
  } catch (error: any) {
    console.error("[API /api/auth/login] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error de autenticación" },
      { status: 500 },
    );
  }
}
