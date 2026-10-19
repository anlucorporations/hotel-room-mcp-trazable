import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { defaultBoardDate, isIsoDate } from "@/lib/housekeeping-board";
import { fetchRoomStateBoard } from "@/lib/housekeeping-state";

export const dynamic = "force-dynamic";

/**
 * GET /api/housekeeping/state-board?date=AAAA-MM-DD — tablero de estado operativo (F6 · T6.2).
 *
 * Los cinco estados canónicos + marca de mantenimiento, con recuento. Es la fuente del tablero de la
 * suite del ama de llaves y del SSE (`/api/housekeeping/stream?view=rooms`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HOUSEKEEPING", "HOUSEKEEPER", "HEAD_KEEPER"]);
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? defaultBoardDate();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchRoomStateBoard(date));
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/state-board] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer el tablero de habitaciones." },
      { status: 500 },
    );
  }
}
