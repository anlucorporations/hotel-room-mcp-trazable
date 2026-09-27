import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

/**
 * GET /api/housekeeping/supplies — lencería y suministros con su estado (D-51, D-64).
 *
 * Devuelve el catálogo completo y, aparte, los artículos en o por debajo de su umbral crítico. El
 * personal de limpieza lo consulta para saber con qué cuenta; la **reposición** la marca el
 * responsable desde Administración → Housekeeping → Lencería (`/api/admin/housekeeping/supplies`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  try {
    const [items, lowStock] = await Promise.all([repo.listSupplyItems(), repo.listLowStock()]);
    return NextResponse.json({ items, lowStock });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/supplies] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la lencería." }, { status: 500 });
  }
}
