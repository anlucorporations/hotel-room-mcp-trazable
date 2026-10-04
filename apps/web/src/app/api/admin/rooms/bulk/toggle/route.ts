import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository, type RoomPublicationStatus } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/** Límite de saneo (2026-10-04): mismo tope que el resto de lotes del tablero. */
const MAX_BULK_ROOMS = 50;

interface BulkToggleResult {
  roomId: string;
  roomNumber: number | null;
  ok: boolean;
  toStatus?: RoomPublicationStatus;
  error?: string;
  message?: string;
}

/**
 * POST /api/admin/rooms/bulk/toggle — acción masiva «Activar/Desactivar» (2026-10-04, tablero Admin).
 *
 * Conmuta la venta entre `PUBLISHED` y `PAUSED` (reanudar/pausar), sin TOTP: esta transición es el
 * mismo cambio de estado que los botones «Pausar»/«Reanudar» de la ficha, y la regla de reanudación vía
 * PATCH (2026-10-04) ya permite `PAUSED → PUBLISHED` porque la ficha fue publicada y quedó anclada.
 *
 * Cualquier estado (borrador, mantenimiento, fuera de servicio) no se conmuta: requiere su propio flujo
 * (publicar con TOTP, o fijar el estado desde la ficha). La selección masiva de la interfaz solo habilita
 * habitaciones activas y sin reservas, pero la capa de API revérifica por seguridad.
 *
 * Respuesta: `200` con el detalle por habitación.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { roomIds?: unknown } | null;
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

  const results: BulkToggleResult[] = [];
  for (const id of roomIds) {
    try {
      const room = await roomsRepo.findById(id);
      if (!room) {
        results.push({ roomId: id, roomNumber: null, ok: false, error: "ROOM_NOT_FOUND", message: "La habitación no existe." });
        continue;
      }
      if (room.publicationStatus !== "PUBLISHED" && room.publicationStatus !== "PAUSED") {
        results.push({
          roomId: id,
          roomNumber: room.roomNumber,
          ok: false,
          error: "NOT_TOGGLEABLE",
          message: "Solo se pueden activar/desactivar habitaciones publicadas o en pausa.",
        });
        continue;
      }
      const target: RoomPublicationStatus =
        room.publicationStatus === "PUBLISHED" ? "PAUSED" : "PUBLISHED";
      const reason =
        target === "PAUSED"
          ? "Desactivada masivamente desde back-office (2026-10-04)"
          : "Reanudada masivamente desde back-office (2026-10-04)";
      await roomsRepo.setPublicationStatus(id, target, auth.session.username, reason);
      results.push({ roomId: id, roomNumber: room.roomNumber, ok: true, toStatus: target });
    } catch (error: unknown) {
      console.error(`[API /api/admin/rooms/bulk/toggle] habitación ${id}:`, error);
      results.push({
        roomId: id,
        roomNumber: null,
        ok: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "No se pudo cambiar el estado de esta habitación.",
      });
    }
  }

  const toggled = results.filter((result) => result.ok).length;
  if (toggled === 0) {
    return NextResponse.json({ results, toggled: 0 }, { status: 400 });
  }
  return NextResponse.json({ results, toggled });
}
