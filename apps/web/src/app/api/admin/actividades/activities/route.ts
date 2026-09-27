import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository, ActivityError } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

/**
 * GET/POST /api/admin/actividades/activities — catálogo de actividades (F5 · D-44, solo owner).
 *
 * El administrador configura el catálogo; la recepción inscribe. `POST` valida código, nombre ES y
 * precio (céntimos ≥ 0).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  try {
    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    return NextResponse.json({ activities: await repo.listActivities({ activeOnly }) });
  } catch (error: unknown) {
    console.error("[API /api/admin/actividades/activities] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo listar el catálogo." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  let body: {
    code?: unknown;
    nameEs?: unknown;
    nameEn?: unknown;
    nameRu?: unknown;
    descriptionEs?: unknown;
    priceCents?: unknown;
    currency?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const nameEs = typeof body.nameEs === "string" ? body.nameEs.trim() : "";
  const priceCents = typeof body.priceCents === "number" ? body.priceCents : 0;
  if (!code || !nameEs || !Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se requieren code, nameEs y priceCents (entero ≥ 0)." },
      { status: 400 },
    );
  }

  try {
    const activity = await repo.createActivity({
      code,
      nameEs,
      nameEn: typeof body.nameEn === "string" ? body.nameEn : null,
      nameRu: typeof body.nameRu === "string" ? body.nameRu : null,
      descriptionEs: typeof body.descriptionEs === "string" ? body.descriptionEs : null,
      priceCents,
      currency: typeof body.currency === "string" ? body.currency : "EUR",
      createdBy: auth.session.username,
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ActivityError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/actividades/activities] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear la actividad." }, { status: 500 });
  }
}
