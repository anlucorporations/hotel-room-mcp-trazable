import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { AuthService, UsersRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const authService = new AuthService();
const usersRepo = new UsersRepository();

/**
 * POST /api/auth/mfa/setup
 *
 * Rota el segundo factor del operador autenticado: genera una semilla TOTP y 8 códigos de
 * rescate NUEVOS y **persiste la semilla cifrada** en `admin_users.totp_secret_enc`.
 *
 * Antes esta ruta generaba la semilla, devolvía el `otpauth://` y la DESCARTABA: el operador
 * escaneaba un QR que nunca podría verificar, así que el MFA era inutilizable. Ahora la semilla
 * se guarda cifrada con AES-256-GCM (`AES_SECRET_KEY`) y los códigos de rescate se reemplazan.
 *
 * La semilla y los códigos en claro se devuelven UNA sola vez (solo se persisten el criptograma
 * y los hashes bcrypt). Exige sesión de `DEFAULT_ADMIN_ROLE`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
    if (!auth.ok) return auth.response;

    const secret = authService.generateTOTPSecret();
    const { plainCodes, hashedCodes } = authService.generateRecoveryCodes(8);
    const resolvedHashes = await hashedCodes;

    await usersRepo.updateTotpSecretEnc(auth.session.username, authService.encryptTotpSecret(secret));
    await usersRepo.replaceRecoveryCodes(auth.session.username, resolvedHashes);

    return NextResponse.json({
      uri: authService.generateTOTPUri(auth.session.username, secret),
      secret,
      recoveryCodes: plainCodes,
    });
  } catch (error: unknown) {
    console.error("[API /api/auth/mfa/setup] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al configurar MFA",
      },
      { status: 500 },
    );
  }
}
