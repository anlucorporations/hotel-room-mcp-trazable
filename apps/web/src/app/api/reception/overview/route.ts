import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ALL_ROOMS, ReceptionRepository, buildRoomBoard } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ReceptionRepository();

/** Fecha ISO `YYYY-MM-DD` (la que envía el panel; por defecto, la del servidor). */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/reception/overview?date=YYYY-MM-DD
 *
 * Panel del día de recepción (RF-31/RF-32, CU-31): reservas de la fecha y estado de las 50
 * habitaciones del maestro, todo derivado del índice PostgreSQL (D-31). Protegido: exige sesión de
 * `RECEPTION_ROLE` o del owner (D-37).
 *
 * 200 `{ date, reservations, rooms, stats }`
 * 400 fecha con formato inválido · 401 sin sesión · 403 rol insuficiente
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json(
      { error: "FECHA_INVALIDA", message: "La fecha debe tener el formato YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    // Rellena los códigos de recuperación de filas antiguas (idempotente y acotado).
    await repo.ensureRecoveryCodes();

    const nights = await repo.listNightsByDate(date);
    const rooms = buildRoomBoard(
      ALL_ROOMS,
      nights.map((night) => ({ roomNumber: night.roomNumber, status: night.status })),
    );
    const reservations = nights.filter(
      (night) =>
        night.status === "SOLD" || night.status === "CHECKED_IN" || night.status === "CHECKED_OUT",
    );

    const count = (status: string): number => rooms.filter((room) => room.status === status).length;

    return NextResponse.json({
      date,
      reservations,
      rooms,
      stats: {
        totalRooms: rooms.length,
        reserved: count("RESERVADA"),
        occupied: count("OCUPADA"),
        departures: count("SALIDA"),
        free: count("LIBRE"),
        blocked: count("BLOQUEADA"),
      },
    });
  } catch (error: unknown) {
    console.error("[API /api/reception/overview] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al cargar el panel del día",
      },
      { status: 500 },
    );
  }
}
