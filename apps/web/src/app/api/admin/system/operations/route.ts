import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { OperationsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { fetchWorkerHealth } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

const operationsRepo = new OperationsRepository();

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
    // T9.5: la cola de anclajes debe verse incluso si el worker está degradado (503 no debe ocultarla).
    const [health, signatures] = await Promise.all([
      fetchWorkerHealth().catch(() => null),
      operationsRepo.listSignatures({ limit: 50 }),
    ]);
    return NextResponse.json({
      health,
      workerAvailable: health !== null,
      anchorQueue: signatures.map((signature) => ({
        id: signature.id,
        entityType: signature.entityType,
        entityId: signature.entityId,
        status: signature.status,
        txHash: signature.txHash,
        createdAt: signature.createdAt,
        retryCount: signature.retryCount ?? 0,
      })),
      checkedAt: new Date().toISOString(),
    });
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
