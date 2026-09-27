import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { resolveRoomImagePath } from "@/lib/room-images";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

interface RouteParams {
  params: Promise<{ id: string; imageId: string }>;
}

/**
 * PATCH /api/admin/rooms/[id]/images/[imageId] — marca la imagen como portada.
 *
 * El repositorio retira la portada anterior; el índice único parcial garantiza que solo hay una.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id, imageId } = await params;
  const body = (await request.json().catch(() => null)) as { isCover?: unknown } | null;
  if (body?.isCover !== true) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Solo se admite {\"isCover\": true}." },
      { status: 400 },
    );
  }

  try {
    const ok = await roomsRepo.setCoverImage(id, imageId);
    if (!ok) {
      return NextResponse.json(
        { error: "IMAGE_NOT_FOUND", message: "La imagen no existe en esta habitación." },
        { status: 404 },
      );
    }
    const images = await roomsRepo.listImages(id);
    return NextResponse.json({
      images: images.map((image) => ({ ...image, url: `/api/rooms/images/${image.fileName}` })),
    });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]/images/[imageId]] PATCH:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo marcar la portada." },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/rooms/[id]/images/[imageId] — elimina la imagen (fila y fichero). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id, imageId } = await params;
  try {
    const image = await roomsRepo.findImageById(imageId);
    if (!image || image.roomId !== id) {
      return NextResponse.json(
        { error: "IMAGE_NOT_FOUND", message: "La imagen no existe en esta habitación." },
        { status: 404 },
      );
    }

    await roomsRepo.deleteImage(imageId);

    // El fichero se borra en mejor esfuerzo: si ya no está, la fila ya no existe y no es un error.
    const absolute = resolveRoomImagePath(image.fileName);
    if (absolute) {
      await unlink(absolute).catch(() => undefined);
    }

    return NextResponse.json({ status: "DELETED", imageId });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]/images/[imageId]] DELETE:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo eliminar la imagen." },
      { status: 500 },
    );
  }
}
