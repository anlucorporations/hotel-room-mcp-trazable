import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ContentRepository, CONTENT_SECTIONS, type ContentSection } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ContentRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isSection(value: unknown): value is ContentSection {
  return typeof value === "string" && (CONTENT_SECTIONS as readonly string[]).includes(value);
}

/** DELETE /api/admin/content/images/[id] — retira una imagen de la galería (D-73, solo owner). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const removed = await repo.deleteImage(id);
    if (!removed) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La imagen no existe." }, { status: 404 });
    }
    return NextResponse.json({ removed });
  } catch (error: unknown) {
    console.error("[API /api/admin/content/images/[id]] DELETE:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo borrar la imagen." }, { status: 500 });
  }
}

/** PATCH /api/admin/content/images/[id] — marca la imagen como portada de su sección (D-73). */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: { section?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (!isSection(body.section)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Falta la sección." }, { status: 400 });
  }
  try {
    const image = await repo.setCoverImage(body.section, id);
    if (!image) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La imagen no existe en esa sección." }, { status: 404 });
    }
    return NextResponse.json({ image });
  } catch (error: unknown) {
    console.error("[API /api/admin/content/images/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo cambiar la portada." }, { status: 500 });
  }
}
