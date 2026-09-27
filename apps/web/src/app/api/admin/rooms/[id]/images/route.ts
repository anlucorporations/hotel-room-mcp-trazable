import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { RoomsRepository, RoomRepositoryError } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import {
  buildRoomImageFileName,
  isJpegWithinLimit,
  roomImagesDir,
  ROOM_IMAGE_MAX_BYTES,
} from "@/lib/room-images";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const MAX_IMAGES = 5;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/rooms/[id]/images — galería de la habitación, ordenada por posición (D-5). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const room = await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    const images = await roomsRepo.listImages(id);
    return NextResponse.json({
      images: images.map((image) => ({ ...image, url: `/api/rooms/images/${image.fileName}` })),
    });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]/images] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la galería." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/rooms/[id]/images — sube una foto (multipart/form-data).
 *
 * Valida **solo JPG** y **≤ 2 MB** (D-20), la guarda en `docs/imagenes` con el nombre canónico
 * (D-5/D-12) y registra la fila. Máximo **5 fotos** por habitación; la primera es la portada.
 * El texto alternativo es opcional y accesible (alt text por idioma).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const room = await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }

    const existing = await roomsRepo.listImages(id);
    if (existing.length >= MAX_IMAGES) {
      return NextResponse.json(
        { error: "IMAGE_LIMIT", message: `La habitación ya tiene ${MAX_IMAGES} fotos (D-20).` },
        { status: 409 },
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Falta el fichero `file` en el formulario." },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isJpegWithinLimit(bytes)) {
      return NextResponse.json(
        {
          error: "INVALID_IMAGE",
          message: `La imagen debe ser JPG y pesar como mucho ${ROOM_IMAGE_MAX_BYTES / (1024 * 1024)} MB (D-20).`,
        },
        { status: 400 },
      );
    }

    const position = Math.min(existing.reduce((max, image) => Math.max(max, image.position), 0) + 1, MAX_IMAGES);
    const fileName = buildRoomImageFileName(room.roomNumber, room.roomType, new Date(), position);

    const dir = roomImagesDir();
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${fileName}`, bytes);

    const image = await roomsRepo.addImage({
      roomId: id,
      fileName,
      storagePath: `docs/imagenes/${fileName}`,
      position,
      isCover: position === 1,
      altTextEs: textOrNull(form?.get("altTextEs")),
      altTextEn: textOrNull(form?.get("altTextEn")),
      altTextRu: textOrNull(form?.get("altTextRu")),
      byteSize: bytes.byteLength,
      uploadedBy: auth.session.username,
    });

    return NextResponse.json(
      { image: { ...image, url: `/api/rooms/images/${image.fileName}` } },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof RoomRepositoryError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/rooms/[id]/images] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo subir la imagen." },
      { status: 500 },
    );
  }
}

function textOrNull(value: FormDataEntryValue | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}
