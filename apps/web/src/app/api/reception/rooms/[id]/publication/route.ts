import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/**
 * POST /api/reception/rooms/[id]/publication — publicar o despublicar la venta (F10 · T10.2).
 *
 * D-C9: tras una inspección o un mantenimiento, la venta **no se libera automáticamente**; es
 * recepción (o el owner) quien la activa o desactiva manualmente, **sin firma on-chain** (D-C37).
 * Cuerpo: `{ action: "publish" | "unpublish" }`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireRole(request, ["RECEPTION_ROLE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (body.action !== "publish" && body.action !== "unpublish") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "action debe ser 'publish' o 'unpublish'." },
      { status: 400 },
    );
  }
  try {
    const room = await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    const status = body.action === "publish" ? "PUBLISHED" : "PAUSED";
    const updated = await roomsRepo.setPublicationStatus(
      id,
      status,
      auth.session.username,
      body.action === "publish"
        ? "Publicación manual desde recepción (T10.2)"
        : "Despublicación manual desde recepción (T10.2)",
    );
    if (!updated) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "No se pudo actualizar." }, { status: 404 });
    }
    return NextResponse.json({ room: updated, publicationStatus: status });
  } catch (error: unknown) {
    console.error("[API /api/reception/rooms/[id]/publication] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo cambiar la publicación." },
      { status: 500 },
    );
  }
}
