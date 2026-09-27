import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingError, HousekeepingRepository, type SupplyConsumption } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { notifyLowStock } from "@/lib/low-stock";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/housekeeping/assignments/[id] — avanza una habitación del tablero.
 *
 * Cuerpo: `{ action: "start" | "complete", consumption?: [{ code, quantity }] }`.
 *
 * - `start` la marca **en curso** (IN_PROGRESS).
 * - `complete` la da por **limpia**: deja la habitación `CLEAN` con traza, descuenta el consumo de
 *   lencería (D-51) y, si algún artículo queda bajo umbral, **encola el aviso al responsable** (D-64).
 *
 * Rol `HOUSEKEEPING` (owner incluido, D-56/D-62). Sin PII: solo nombres de personal y códigos de artículo.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: { action?: unknown; consumption?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "start" && action !== "complete") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "action debe ser 'start' o 'complete'." }, { status: 400 });
  }

  try {
    if (action === "start") {
      const assignment = await repo.startAssignment(id);
      if (!assignment) {
        return NextResponse.json({ error: "ASSIGNMENT_NOT_FOUND", message: "La asignación no existe o ya está terminada." }, { status: 404 });
      }
      return NextResponse.json({ assignment });
    }

    const consumption = parseConsumption(body.consumption);
    const result = await repo.completeAssignment(id, auth.session.username, consumption);
    if (result.lowStock.length > 0) {
      void notifyLowStock(result.lowStock, `housekeeping:${id}`);
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof HousekeepingError) {
      const status = error.code === "ASSIGNMENT_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/housekeeping/assignments/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar la habitación." }, { status: 500 });
  }
}

/** Acepta solo líneas válidas `{ code, quantity>0 }`; `undefined` = consumo por defecto (D-51). */
function parseConsumption(value: unknown): readonly SupplyConsumption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines = value
    .filter((line): line is { code: string; quantity: number } => {
      if (typeof line !== "object" || line === null) return false;
      const candidate = line as { code?: unknown; quantity?: unknown };
      return typeof candidate.code === "string" && typeof candidate.quantity === "number" && candidate.quantity > 0;
    })
    .map((line) => ({ code: line.code, quantity: line.quantity }));
  return lines.length > 0 ? lines : undefined;
}
