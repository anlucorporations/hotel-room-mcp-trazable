import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ContentError, ContentRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new ContentRepository();

/** GET/POST /api/admin/content/offers — planes informativos de la home (F6 · D-74, solo owner). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ offers: await repo.listOffers({ activeOnly: false }) });
  } catch (error: unknown) {
    console.error("[API /api/admin/content/offers] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los planes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  let body: {
    code?: unknown;
    titleEs?: unknown;
    titleEn?: unknown;
    titleRu?: unknown;
    bodyEs?: unknown;
    bodyEn?: unknown;
    bodyRu?: unknown;
    imageId?: unknown;
    validFrom?: unknown;
    validTo?: unknown;
    sortOrder?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const titleEs = typeof body.titleEs === "string" ? body.titleEs.trim() : "";
  const validFrom = typeof body.validFrom === "string" && body.validFrom.length > 0 ? body.validFrom : null;
  const validTo = typeof body.validTo === "string" && body.validTo.length > 0 ? body.validTo : null;
  if (!code || !titleEs) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se requieren code y titleEs." }, { status: 400 });
  }
  if ((validFrom !== null && !isIsoDate(validFrom)) || (validTo !== null && !isIsoDate(validTo))) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "La vigencia debe ser AAAA-MM-DD." }, { status: 400 });
  }
  if (validFrom && validTo && validTo < validFrom) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "La fecha final no puede ser anterior a la inicial." }, { status: 400 });
  }

  try {
    const offer = await repo.createOffer({
      code,
      titleEs,
      titleEn: typeof body.titleEn === "string" ? body.titleEn : null,
      titleRu: typeof body.titleRu === "string" ? body.titleRu : null,
      bodyEs: typeof body.bodyEs === "string" ? body.bodyEs : null,
      bodyEn: typeof body.bodyEn === "string" ? body.bodyEn : null,
      bodyRu: typeof body.bodyRu === "string" ? body.bodyRu : null,
      imageId: typeof body.imageId === "string" && body.imageId.length > 0 ? body.imageId : null,
      validFrom,
      validTo,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      createdBy: auth.session.username,
    });
    return NextResponse.json({ offer }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ContentError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/content/offers] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el plan." }, { status: 500 });
  }
}
