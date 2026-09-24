import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { AuthService } from "@hotel/shared";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  readRefreshToken,
  refreshTokenCookieOptions,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const authService = new AuthService();

/**
 * POST /api/auth/refresh
 *
 * Rotación de refresh token (RTR): el refresh presentado se revoca y se emite un par nuevo. Un
 * refresh ya usado no vuelve a servir (la sesión queda marcada como revocada en
 * `admin_sessions`), lo que convierte el reuso en un fallo de autorización explícito.
 *
 * El refresh se acepta del cuerpo o de la cookie HttpOnly; los tokens nuevos se devuelven en el
 * cuerpo y se refrescan las cookies.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const body = await request.json().catch(() => ({}));

    const refreshToken = readRefreshToken(request, body);
    if (!refreshToken) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "refreshToken requerido" },
        { status: 400 },
      );
    }

    const newSession = await authService.rotateRefreshToken(refreshToken, ip, userAgent);

    const response = NextResponse.json({
      accessToken: newSession.accessToken,
      refreshToken: newSession.refreshToken,
      roles: [newSession.role],
    });

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      newSession.accessToken,
      accessTokenCookieOptions(authService.accessTokenTtlSeconds()),
    );
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      newSession.refreshToken,
      refreshTokenCookieOptions(authService.refreshTokenTtlSeconds()),
    );
    return response;
  } catch (error: unknown) {
    console.warn(
      "[API /api/auth/refresh] Error al rotar token:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sesión inválida, revocada o expirada" },
      { status: 401 },
    );
  }
}
