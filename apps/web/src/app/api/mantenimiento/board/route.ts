import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { defaultBoardDate, isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/mantenimiento/board?date=AAAA-MM-DD — tablero del técnico (D-63).
 *
 * Devuelve las incidencias abiertas, las **tareas preventivas vencidas o de hoy** (aviso, D-54) y las
 * habitaciones bloqueadas por avería (D-53). Rol `MAINTENANCE` (owner incluido).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "MAINTENANCE");
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? defaultBoardDate();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }
  try {
    return NextResponse.json(await repo.getBoard(date));
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/board] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer el tablero." }, { status: 500 });
  }
}
