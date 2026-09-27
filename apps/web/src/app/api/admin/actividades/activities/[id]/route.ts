import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/actividades/activities/[id] — edita el catálogo o lo activa/pausa (D-44, owner). */
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

  const input: Parameters<ActivitiesRepository["updateActivity"]>[1] = {};
  if (typeof body.nameEs === "string") input.nameEs = body.nameEs;
  if (typeof body.nameEn === "string" || body.nameEn === null) input.nameEn = body.nameEn as string | null;
  if (typeof body.nameRu === "string" || body.nameRu === null) input.nameRu = body.nameRu as string | null;
  if (typeof body.descriptionEs === "string" || body.descriptionEs === null) input.descriptionEs = body.descriptionEs as string | null;
  if (typeof body.priceCents === "number") input.priceCents = body.priceCents;
  if (typeof body.currency === "string") input.currency = body.currency;
  if (typeof body.active === "boolean") input.active = body.active;

  try {
    const activity = await repo.updateActivity(id, input);
    if (!activity) {
      return NextResponse.json({ error: "ACTIVITY_NOT_FOUND", message: "La actividad no existe." }, { status: 404 });
    }
    return NextResponse.json({ activity });
  } catch (error: unknown) {
    console.error("[API /api/admin/actividades/activities/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar la actividad." }, { status: 500 });
  }
}
