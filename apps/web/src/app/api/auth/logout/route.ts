import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { AuthService } from "@hotel/shared";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  readAccessToken,
  readRefreshToken,
} from "@/lib/guard";

export const dynamic = "force-dynamic";

const authService = new AuthService();

/**
 * POST /api/auth/logout
 *
 * Revoca la sesión por completo (D-04):
 *   1. añade el `jti` del access token a la blocklist de Redis con TTL = vida restante del
 *      token, de modo que el MISMO token deja de servir de inmediato (401);
 *   2. revoca el refresh token en `admin_sessions` para que no pueda renovarse;
 *   3. **borra las cookies** de access y refresh.
 *
 * El punto 3 faltaba: la cookie de sesión nunca se limpiaba, así que el navegador seguía
 * presentando un token revocado.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = readAccessToken(request);
    const refreshToken = readRefreshToken(request, body);

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Token de acceso o de refresco requerido" },
        { status: 400 },
      );
    }

    await authService.logout(accessToken ?? "", refreshToken);

    const response = NextResponse.json({ success: true });
    // `maxAge: 0` elimina la cookie en el navegador; el `path` debe coincidir con el de alta.
    response.cookies.set(ACCESS_TOKEN_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
    response.cookies.set(REFRESH_TOKEN_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
    return response;
  } catch (error: unknown) {
    console.error("[API /api/auth/logout] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al cerrar sesión",
      },
      { status: 500 },
    );
  }
}
