import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationsRepository, RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const reservationsRepo = new ReservationsRepository();

/** Límite de saneo (2026-10-04): mismo tope que el lote de publicación. */
const MAX_BULK_ROOMS = 50;

/** Fecha `AAAA-MM-DD` válida por forma (la valida PostgreSQL al usarla). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ventana de «reservada» (2026-10-04): de hoy a +150 días, igual que el distintivo del tablero. */
function isoDateFromToday(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

interface BulkReleaseResult {
  roomId: string;
  roomNumber: number | null;
  released: number;
  error?: string;
  message?: string;
}

/**
 * POST /api/admin/rooms/bulk/release — acción masiva «Liberar» (2026-10-04, tablero Admin).
 *
 * Cancela las reservas **activas** (`PENDING`/`CONFIRMED`) que tienen al menos una noche dentro de la
 * ventana de hoy a +150 días, para cada habitación del lote. Es el equivalente masivo del «cancelar
 * reserva» de la recepción: auditable (mismo `cancelReservation`, con actor y motivo) y sin TOTP — la
 * cancelación de reservas nunca ha exigido TOTP en este sistema.
 *
 * Las noches ocupadas por tokens (NFTs) no se cancelan por esta vía: no son reservas. Si una
 * habitación solo tiene noches vendidas, `released` queda en 0.
 *
 * Respuesta: `200` con el detalle por habitación (`results` y `released` total).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { roomIds?: unknown; date?: unknown; from?: unknown; to?: unknown }
    | null;
  const roomIds = Array.isArray(body?.roomIds)
    ? [...new Set(body.roomIds.filter((value): value is string => typeof value === "string" && value.length > 0))]
    : [];
  if (roomIds.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Se requiere una lista no vacía de roomIds." },
      { status: 400 },
    );
  }
  if (roomIds.length > MAX_BULK_ROOMS) {
    return NextResponse.json(
      { error: "BULK_TOO_LARGE", message: `Máximo ${MAX_BULK_ROOMS} habitaciones por lote.` },
      { status: 400 },
    );
  }

  // Ventana de liberación (2026-10-04): por defecto «hoy → +150 días». El tablero de disponibilidad
  // manda un día concreto (`date`) para liberar solo esa noche.
  const date = typeof body?.date === "string" && DATE_RE.test(body.date) ? body.date : null;
  const from = date ?? (typeof body?.from === "string" && DATE_RE.test(body.from) ? body.from : isoDateFromToday(0));
  const to = date ?? (typeof body?.to === "string" && DATE_RE.test(body.to) ? body.to : isoDateFromToday(150));
  const results: BulkReleaseResult[] = [];
  let releasedTotal = 0;

  for (const id of roomIds) {
    try {
      const room = await roomsRepo.findById(id);
      if (!room) {
        results.push({ roomId: id, roomNumber: null, released: 0, error: "ROOM_NOT_FOUND", message: "La habitación no existe." });
        continue;
      }
      const ids = await roomsRepo.listReleaseableReservationIds(id, from, to);
      let released = 0;
      for (const reservationId of ids) {
        const cancelled = await reservationsRepo.cancelReservation(
          reservationId,
          auth.session.username,
          "Liberación masiva desde back-office (2026-10-04)",
        );
        if (cancelled) released += 1;
      }
      releasedTotal += released;
      results.push({ roomId: id, roomNumber: room.roomNumber, released });
    } catch (error: unknown) {
      console.error(`[API /api/admin/rooms/bulk/release] habitación ${id}:`, error);
      results.push({ roomId: id, roomNumber: null, released: 0, error: "INTERNAL_SERVER_ERROR", message: "No se pudieron liberar las reservas." });
    }
  }

  return NextResponse.json({ results, released: releasedTotal });
}
