import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ContentRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new ContentRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/content/offers/[id] — edita o activa/pausa un plan (F6 · D-74, solo owner). */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const input: Parameters<ContentRepository["updateOffer"]>[1] = {};
  if (typeof body.titleEs === "string") input.titleEs = body.titleEs;
  if (typeof body.titleEn === "string" || body.titleEn === null) input.titleEn = body.titleEn as string | null;
  if (typeof body.titleRu === "string" || body.titleRu === null) input.titleRu = body.titleRu as string | null;
  if (typeof body.bodyEs === "string" || body.bodyEs === null) input.bodyEs = body.bodyEs as string | null;
  if (typeof body.bodyEn === "string" || body.bodyEn === null) input.bodyEn = body.bodyEn as string | null;
  if (typeof body.bodyRu === "string" || body.bodyRu === null) input.bodyRu = body.bodyRu as string | null;
  if (typeof body.imageId === "string" || body.imageId === null) input.imageId = body.imageId as string | null;
  if (typeof body.sortOrder === "number") input.sortOrder = body.sortOrder;
  if (typeof body.active === "boolean") input.active = body.active;
  if (typeof body.validFrom === "string" && isIsoDate(body.validFrom)) input.validFrom = body.validFrom;
  if (body.validFrom === null) input.validFrom = null;
  if (typeof body.validTo === "string" && isIsoDate(body.validTo)) input.validTo = body.validTo;
  if (body.validTo === null) input.validTo = null;

  try {
    const offer = await repo.updateOffer(id, input);
    if (!offer) {
      return NextResponse.json({ error: "NOT_FOUND", message: "El plan no existe." }, { status: 404 });
    }
    return NextResponse.json({ offer });
  } catch (error: unknown) {
    console.error("[API /api/admin/content/offers/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar el plan." }, { status: 500 });
  }
}

/** DELETE /api/admin/content/offers/[id] — retira un plan (F6 · D-74). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const removed = await repo.deleteOffer(id);
    if (!removed) {
      return NextResponse.json({ error: "NOT_FOUND", message: "El plan no existe." }, { status: 404 });
    }
    return NextResponse.json({ removed });
  } catch (error: unknown) {
    console.error("[API /api/admin/content/offers/[id]] DELETE:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo borrar el plan." }, { status: 500 });
  }
}
