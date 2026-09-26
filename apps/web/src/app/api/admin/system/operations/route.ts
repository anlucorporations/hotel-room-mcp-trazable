import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { fetchWorkerHealth } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/system/operations
 *
 * Salud operativa del sistema (RF-45, CU-45): estado del worker indexador (bloque al día, `lag`,
 * agregados y degradaciones). **Solo owner**. Si el worker no responde se declara con 503 en lugar
 * de inventar ceros.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const health = await fetchWorkerHealth();
    return NextResponse.json({ health, checkedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      {
        error: "WORKER_UNAVAILABLE",
        message: "El worker no responde; no se puede leer su estado.",
      },
      { status: 503 },
    );
  }
}
