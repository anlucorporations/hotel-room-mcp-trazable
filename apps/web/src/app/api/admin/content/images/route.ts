import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { ContentError, ContentRepository, CONTENT_SECTIONS, type ContentSection } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { buildHotelImageFileName } from "@/lib/hotel-images";
import { isJpegWithinLimit, roomImagesDir, ROOM_IMAGE_MAX_BYTES } from "@/lib/room-images";

export const dynamic = "force-dynamic";

const repo = new ContentRepository();
const MAX_IMAGES = 20;

function isSection(value: unknown): value is ContentSection {
  return typeof value === "string" && (CONTENT_SECTIONS as readonly string[]).includes(value);
}

function textOrNull(value: FormDataEntryValue | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** GET /api/admin/content/images?section=… — galería de contenido (F6 · D-73, solo owner). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const section = request.nextUrl.searchParams.get("section");
  try {
    const images = await repo.listImages(isSection(section) ? section : undefined);
    return NextResponse.json({ images });
  } catch (error: unknown) {
    console.error("[API /api/admin/content/images] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la galería." }, { status: 500 });
  }
}

/**
 * POST /api/admin/content/images — sube una imagen de la home (multipart/form-data, D-73).
 *
 * Solo **JPG** y **≤ 2 MB**, guardada en `docs/imagenes` con el nombre canónico
 * `hotel-<seccion>-<fecha>-<n>.jpg` (D-66) y registrada con su sección, posición y texto alternativo.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const section = form?.get("section");
  if (!(file instanceof File) || !isSection(section)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se requieren `file` y una `section` válida." },
      { status: 400 },
    );
  }

  try {
    const existing = await repo.listImages(section);
    if (existing.length >= MAX_IMAGES) {
      return NextResponse.json(
        { error: "IMAGE_LIMIT", message: `La sección ya tiene ${MAX_IMAGES} imágenes.` },
        { status: 409 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isJpegWithinLimit(bytes)) {
      return NextResponse.json(
        {
          error: "INVALID_IMAGE",
          message: `La imagen debe ser JPG y pesar como mucho ${ROOM_IMAGE_MAX_BYTES / (1024 * 1024)} MB (D-73).`,
        },
        { status: 400 },
      );
    }

    const position = Math.min(existing.reduce((max, image) => Math.max(max, image.position), 0) + 1, MAX_IMAGES);
    const fileName = buildHotelImageFileName(section, new Date(), position);
    const dir = roomImagesDir();
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${fileName}`, bytes);

    const image = await repo.addImage({
      section,
      fileName,
      storagePath: `docs/imagenes/${fileName}`,
      position,
      isCover: existing.length === 0,
      altTextEs: textOrNull(form?.get("altTextEs")),
      altTextEn: textOrNull(form?.get("altTextEn")),
      altTextRu: textOrNull(form?.get("altTextRu")),
      byteSize: bytes.byteLength,
      uploadedBy: auth.session.username,
    });
    return NextResponse.json({ image }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ContentError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/content/images] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo guardar la imagen." }, { status: 500 });
  }
}
