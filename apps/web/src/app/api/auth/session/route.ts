import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { UsersRepository } from "@hotel/shared";
import { authorize } from "@/lib/guard";

export const dynamic = "force-dynamic";

const usersRepo = new UsersRepository();

/**
 * GET /api/auth/session
 *
 * Devuelve la sesión canónica del back-office (D-04): usuario, rol y códigos de rescate
 * restantes. Exige un access token válido y no revocado.
 *
 * Antes esta ruta leía la cookie HMAC de SIWE y devolvía `address`/`roles` on-chain; la UI la
 * usaba para autorizar el panel. Ahora SIWE no autoriza nada y la sesión es la del JWT.
 *
 * 200 `{ authenticated: true, username, role, roles, recoveryRemaining }`
 * 401 `{ authenticated: false, error: "UNAUTHORIZED" }` sin token válido
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        return NextResponse.json(
          { error: "SERVER_MISCONFIGURED", message: auth.message },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { authenticated: false, username: null, role: null, roles: [] },
        { status: 401 },
      );
    }

    const recoveryRemaining = await usersRepo.countRemainingRecoveryCodes(auth.session.username);

    return NextResponse.json({
      authenticated: true,
      username: auth.session.username,
      role: auth.session.role,
      roles: [auth.session.role],
      recoveryRemaining,
    });
  } catch (error: unknown) {
    console.error("[API /api/auth/session] Error:", error);
    return NextResponse.json(
      { authenticated: false, username: null, role: null, roles: [] },
      { status: 401 },
    );
  }
}
