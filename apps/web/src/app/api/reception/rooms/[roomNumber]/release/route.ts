import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReceptionRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ReceptionRepository();

/**
 * POST /api/reception/rooms/:roomNumber/release
 *
 * Libera una habitación que esté en PENDING_CLEANING, pasándola a CLEAN (RF-50).
 * Solo recepción puede ejecutar esta acción.
 *
 * 200 `{ released: true, previousStatus: "PENDING_CLEANING" }`
 * 400 habitación no en estado de limpieza · 401/403 sin permiso · 404 no encontrada
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomNumber: string }> },
): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const roomNumber = Number((await params).roomNumber);
  if (!Number.isInteger(roomNumber) || roomNumber <= 0) {
    return NextResponse.json(
      { error: "HABITACION_INVALIDA", message: "El número de habitación no es válido." },
      { status: 400 },
    );
  }

  try {
    const result = await repo.releaseRoom(roomNumber, auth.session.username);
    if (result.released) {
      return NextResponse.json({ released: true, previousStatus: result.previousStatus });
    }
    return NextResponse.json(
      {
        released: false,
        previousStatus: result.previousStatus,
        message: `La habitación está en estado ${result.previousStatus}; no se puede liberar.`,
      },
      { status: 400 },
    );
  } catch (error: unknown) {
    console.error("[API /api/reception/rooms/release] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al liberar la habitación",
      },
      { status: 500 },
    );
  }
}
