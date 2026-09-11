import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@hotel/shared";

export const dynamic = "force-dynamic";

const authService = new AuthService();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    let accessToken: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
    }

    const body = await request.json().catch(() => ({}));
    const refreshToken = body.refreshToken;

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Token de acceso o de refresco requerido" },
        { status: 400 },
      );
    }

    await authService.logout(accessToken || "", refreshToken);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API /api/auth/logout] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al cerrar sesión" },
      { status: 500 },
    );
  }
}
