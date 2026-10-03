import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  RoomsRepository,
  RoomRepositoryError,
  type RoomOperationalStatus,
  type RoomPublicationStatus,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import {
  OPERATIONAL_STATUSES,
  PUBLICATION_STATUSES,
  parseAmenityCodes,
  parseRoomFields,
  parseRoomSpaces,
} from "@/lib/rooms";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/rooms/[id] — ficha con su galería, sus publicaciones, sus servicios, sus espacios y
 * las noches ocupadas de la ventana pedida (D-1, D-5, D-18; ficha ampliada 2026-10-02).
 *
 * La ventana del calendario llega por `?from=YYYY-MM-DD&to=YYYY-MM-DD`; sin parámetros se devuelve un
 * semestre alrededor de hoy, que es lo que cabe en la ficha sin pedir nada más.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const from = isoDateOr(request.nextUrl.searchParams.get("from"), -30);
  const to = isoDateOr(request.nextUrl.searchParams.get("to"), 150);
  try {
    const room = await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    const [images, publications, amenities, spaces, reservedNights] = await Promise.all([
      roomsRepo.listImages(id),
      roomsRepo.listPublications(id),
      roomsRepo.listAmenityCodes(id),
      roomsRepo.listRoomSpaces(id),
      roomsRepo.listReservedNights(id, from, to),
    ]);
    return NextResponse.json({ room, images, publications, amenities, spaces, reservedNights, window: { from, to } });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la habitación." },
      { status: 500 },
    );
  }
}

/** Fecha `YYYY-MM-DD` desplazada `offsetDays` desde hoy, o el valor recibido si es válido. */
function isoDateOr(value: string | null, offsetDays: number): string {
  if (value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
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

  // Servicios y espacios: si vienen, se validan ANTES de escribir la ficha (misma regla que el alta).
  const amenities = body.amenityCodes === undefined ? null : parseAmenityCodes(body.amenityCodes);
  if (amenities !== null && !amenities.ok) {
    return NextResponse.json({ error: amenities.error, message: amenities.message }, { status: 400 });
  }
  const spaces = body.spaces === undefined ? null : parseRoomSpaces(body.spaces);
  if (spaces !== null && !spaces.ok) {
    return NextResponse.json({ error: spaces.error, message: spaces.message }, { status: 400 });
  }

  try {
    let room = Object.keys(parsed.fields).length > 0 ? await roomsRepo.updateRoom(id, parsed.fields) : await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }

    if (amenities !== null && amenities.ok) await roomsRepo.setRoomAmenities(id, amenities.value);
    if (spaces !== null && spaces.ok) await roomsRepo.setRoomSpaces(id, spaces.value);

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

    return NextResponse.json({
      room,
      ...(amenities !== null && amenities.ok ? { amenities: amenities.value } : {}),
      ...(spaces !== null && spaces.ok ? { spaces: spaces.value } : {}),
    });
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
