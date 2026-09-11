import { NextRequest, NextResponse } from "next/server";
import { AuthService, SessionsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const authService = new AuthService();
const sessionsRepo = new SessionsRepository();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Cabecera Authorization requerida" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const payload = await authService.verifyAccessToken(token);

    // Generar nuevo secreto TOTP RFC 6238
    const secret = authService.generateTOTPSecret();
    const uri = authService.generateTOTPUri(payload.sub, secret);

    // Generar 8 códigos de rescate
    const { plainCodes, hashedCodes } = authService.generateRecoveryCodes(8);
    const resolvedHashes = await hashedCodes;

    // Guardar hashes de códigos de rescate
    await sessionsRepo.saveRecoveryCodes(payload.sub, resolvedHashes);

    return NextResponse.json({
      secret,
      uri,
      recoveryCodes: plainCodes,
    });
  } catch (error: any) {
    console.error("[API /api/auth/mfa/setup] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al configurar MFA" },
      { status: 500 },
    );
  }
}
