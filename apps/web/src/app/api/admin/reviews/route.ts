import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { REVIEW_STATUSES, ReviewsRepository, type ReviewStatus } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reviewsRepo = new ReviewsRepository();

/**
 * GET /api/admin/reviews — moderación de reseñas (F6 · D-58, solo owner).
 *
 * `?status=PENDING|APPROVED|REJECTED` (por defecto `PENDING`). Devuelve la reseña con su tipo de
 * habitación, nota, comentario y estado; **nunca** el `token_id` ni el número de habitación.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const raw = request.nextUrl.searchParams.get("status") ?? "PENDING";
  const status = (REVIEW_STATUSES as readonly string[]).includes(raw) ? (raw as ReviewStatus) : "PENDING";
  try {
    return NextResponse.json({ status, reviews: await reviewsRepo.listByStatus(status) });
  } catch (error: unknown) {
    console.error("[API /api/admin/reviews] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las reseñas." }, { status: 500 });
  }
}
