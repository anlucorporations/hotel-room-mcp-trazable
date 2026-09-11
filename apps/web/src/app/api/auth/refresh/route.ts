import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@hotel/shared";

export const dynamic = "force-dynamic";

const authService = new AuthService();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    const userAgent = request.headers.get("user-agent") || "unknown";
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "refreshToken requerido" },
        { status: 400 },
      );
    }

    // Refresh Token Rotation (RTR): revoca el token anterior y emite uno nuevo
    const newSession = await authService.rotateRefreshToken(refreshToken, ip, userAgent);

    return NextResponse.json({
      accessToken: newSession.accessToken,
      refreshToken: newSession.refreshToken,
      roles: [newSession.role],
    });
  } catch (error: any) {
    console.warn("[API /api/auth/refresh] Error al rotar token:", error?.message);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sesión inválida, revocada o expirada" },
      { status: 401 },
    );
  }
}
