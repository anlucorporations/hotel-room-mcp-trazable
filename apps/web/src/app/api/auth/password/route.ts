import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthService, UsersRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const authService = new AuthService();
const usersRepo = new UsersRepository();

/**
 * POST /api/auth/password
 *
 * Cambio de contraseña del **propio operador** (RF-46, CU-46). Exige la contraseña actual y una
 * nueva de al menos 12 caracteres. Cualquier rol de back-office puede cambiar la suya; nadie puede
 * cambiar la de otro por esta vía (la gestión de usuarios del owner vive en Sistemas).
 *
 * Body: `{ currentPassword, newPassword }`
 * 200 `{ status: "PASSWORD_UPDATED" }` · 400 formato · 401 contraseña actual incorrecta
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    } | null;

    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 12) {
      return NextResponse.json(
        { error: "PASSWORD_INVALIDA", message: "La nueva contraseña debe tener al menos 12 caracteres." },
        { status: 400 },
      );
    }

    const user = await authService.findUser(auth.session.username);
    if (!user) {
      return NextResponse.json(
        { error: "USUARIO_NO_ENCONTRADO", message: "El operador no existe." },
        { status: 404 },
      );
    }

    const valid = await authService.comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "PASSWORD_ACTUAL_INCORRECTA", message: "La contraseña actual no es correcta." },
        { status: 401 },
      );
    }

    await usersRepo.updatePasswordHash(
      auth.session.username,
      await authService.hashPassword(newPassword),
    );

    return NextResponse.json({ status: "PASSWORD_UPDATED" });
  } catch (error: unknown) {
    console.error("[API /api/auth/password] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo cambiar la contraseña." },
      { status: 500 },
    );
  }
}
