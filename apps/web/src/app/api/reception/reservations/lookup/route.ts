import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReceptionRepository, normalizeRecoveryCode } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ReceptionRepository();

/**
 * GET /api/reception/reservations/lookup?code=MDS-XXXXXXXX
 *
 * Búsqueda de la reserva por código de recuperación (RF-33, CU-32). Es la vía del mostrador cuando
 * el huésped no puede mostrar el QR. Protegido: `RECEPTION_ROLE` o owner.
 *
 * 200 `{ reservation }` · 400 código con formato inválido · 401/403 · 404 sin coincidencia
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const raw = request.nextUrl.searchParams.get("code") ?? "";
  const code = normalizeRecoveryCode(raw);
  if (!code) {
    return NextResponse.json(
      {
        error: "CODIGO_INVALIDO",
        message: "El código de recuperación debe empezar por MDS- y tener 6-12 caracteres.",
      },
      { status: 400 },
    );
  }

  try {
    await repo.ensureRecoveryCodes();
    const reservation = await repo.findByRecoveryCode(code);
    if (!reservation) {
      return NextResponse.json(
        { error: "RESERVA_NO_ENCONTRADA", message: "No se encontró ninguna reserva con ese código." },
        { status: 404 },
      );
    }
    return NextResponse.json({ reservation });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations/lookup] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al buscar la reserva",
      },
      { status: 500 },
    );
  }
}
