import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingRepository } from "@hotel/shared";
import { isIsoDate } from "@/lib/housekeeping-board";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

/**
 * GET /api/housekeeping/reports?from=AAAA-MM-DD&to=AAAA-MM-DD — informe de productividad e
 * inspecciones por camarera/camarero (F6 · CU-V-26). Sin datos personales de huéspedes.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HOUSEKEEPING", "HOUSEKEEPER", "HEAD_KEEPER"]);
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);
  const from = params.get("from") ?? new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fechas no válidas (AAAA-MM-DD)." }, { status: 400 });
  }
  try {
    const rows = await repo.productivityReport(from, to);
    return NextResponse.json({ from, to, rows, generatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/reports] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo generar el informe." }, { status: 500 });
  }
}
