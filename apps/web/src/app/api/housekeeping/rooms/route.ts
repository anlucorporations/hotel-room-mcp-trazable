import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { defaultBoardDate, isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

/**
 * GET /api/housekeeping/rooms?date=AAAA-MM-DD — habitaciones a limpiar según la ocupación (D-48).
 *
 * Devuelve cada habitación con el **motivo** por el que entra en el reparto (`CHECKOUT`, `DIRTY`,
 * `STAYOVER`). Es la entrada del reparto automático y del ajuste manual. Rol `HOUSEKEEPING`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? defaultBoardDate();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }
  try {
    return NextResponse.json({ date, rooms: await repo.listRoomsToClean(date) });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/rooms] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron calcular las habitaciones a limpiar." }, { status: 500 });
  }
}
