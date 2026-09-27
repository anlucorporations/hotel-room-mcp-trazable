import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReviewsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reviewsRepo = new ReviewsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/reviews/[id] — aprueba o rechaza una reseña (F6 · D-58, solo owner).
 *
 * Cuerpo `{ action: "approve" | "reject", reason? }`. La moderación deja registrado **quién**,
 * **cuándo** y el **motivo**. Solo actúa sobre reseñas `PENDING`: una ya moderada responde 409.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { action?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "action debe ser 'approve' o 'reject'." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : null;

  try {
    const review = await reviewsRepo.moderate(
      id,
      body.action === "approve" ? "APPROVED" : "REJECTED",
      auth.session.username,
      reason,
    );
    if (!review) {
      return NextResponse.json(
        { error: "REVIEW_NOT_MODERABLE", message: "La reseña no existe o ya estaba moderada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ review });
  } catch (error: unknown) {
    console.error("[API /api/admin/reviews/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo moderar la reseña." }, { status: 500 });
  }
}
