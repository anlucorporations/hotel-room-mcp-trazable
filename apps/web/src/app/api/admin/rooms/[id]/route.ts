import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  RoomsRepository,
  RoomRepositoryError,
  type RoomOperationalStatus,
  type RoomPublicationStatus,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { OPERATIONAL_STATUSES, PUBLICATION_STATUSES, parseRoomFields } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/rooms/[id] — ficha con su galería y sus publicaciones (D-1, D-5, D-18). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const room = await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    const [images, publications] = await Promise.all([
      roomsRepo.listImages(id),
      roomsRepo.listPublications(id),
    ]);
    return NextResponse.json({ room, images, publications });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la habitación." },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/rooms/[id] — edita la ficha y/o cambia el estado.
 *
 * Cambiar a `PUBLISHED` **no** se admite por aquí: la publicación exige TOTP y deja huella anclada
 * (D-2/D-18) y vive en `POST /publish`. El resto de estados (pausar, mantenimiento, fuera de
 * servicio, volver a borrador) sí se pueden fijar aquí.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se espera un objeto JSON." }, { status: 400 });
  }

  const parsed = parseRoomFields(body, { partial: true });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, message: parsed.message }, { status: 400 });
  }

  try {
    let room = Object.keys(parsed.fields).length > 0 ? await roomsRepo.updateRoom(id, parsed.fields) : await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }

    if (body.publicationStatus !== undefined) {
      const status = body.publicationStatus;
      if (status === "PUBLISHED") {
        return NextResponse.json(
          {
            error: "USE_PUBLISH_ENDPOINT",
            message: "Publicar exige confirmación TOTP: usa POST /api/admin/rooms/[id]/publish (D-2/D-18).",
          },
          { status: 400 },
        );
      }
      if (typeof status !== "string" || !PUBLICATION_STATUSES.includes(status as RoomPublicationStatus)) {
        return NextResponse.json(
          { error: "INVALID_STATUS", message: `Estado no válido (admitidos: ${PUBLICATION_STATUSES.join(", ")}).` },
          { status: 400 },
        );
      }
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      room = await roomsRepo.setPublicationStatus(id, status as RoomPublicationStatus, auth.session.username, reason);
    }

    if (body.operationalStatus !== undefined) {
      const status = body.operationalStatus;
      if (typeof status !== "string" || !OPERATIONAL_STATUSES.includes(status as RoomOperationalStatus)) {
        return NextResponse.json(
          { error: "INVALID_STATUS", message: `Estado operativo no válido (admitidos: ${OPERATIONAL_STATUSES.join(", ")}).` },
          { status: 400 },
        );
      }
      room = await roomsRepo.setOperationalStatus(id, status as RoomOperationalStatus, auth.session.username);
    }

    return NextResponse.json({ room });
  } catch (error: unknown) {
    if (error instanceof RoomRepositoryError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/rooms/[id]] PATCH:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar la habitación." },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/rooms/[id] — archiva la habitación; nunca la borra (D-8, D-23). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const room = await roomsRepo.archiveRoom(id, auth.session.username);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    return NextResponse.json({ room });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]] DELETE:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo archivar la habitación." },
      { status: 500 },
    );
  }
}
