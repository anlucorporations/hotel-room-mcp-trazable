import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingError, HousekeepingRepository, SupplyAlertsRepository, type SupplyMovementReason } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { notifyLowStock } from "@/lib/low-stock";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();
const alertsRepo = new SupplyAlertsRepository();

const MOVEMENT_REASONS: readonly SupplyMovementReason[] = ["ROOM_CLEANED", "GUEST_CHECKIN", "RESTOCK", "ADJUSTMENT"];

/**
 * GET /api/admin/housekeeping/supplies — panel de **Lencería** (D-64): catálogo y alertas.
 *
 * POST — el responsable **repone** (`{ itemId, quantity>0 }`) o registra un ajuste
 * (`{ lines: [{ code, quantity }], reason }`). Solo owner. Tras reponer no se envía aviso; tras un
 * ajuste que deje algo bajo umbral, se avisa igual que al limpiar una habitación (D-51/D-64).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const [items, lowStock] = await Promise.all([repo.listSupplyItems(), repo.listLowStock()]);
    return NextResponse.json({ items, lowStock });
  } catch (error: unknown) {
    console.error("[API /api/admin/housekeeping/supplies] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la lencería." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  let body: { itemId?: unknown; quantity?: unknown; lines?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  try {
    // Reposición de un artículo.
    if (typeof body.itemId === "string" && typeof body.quantity === "number") {
      const item = await repo.restock(body.itemId, body.quantity, auth.session.username);
      return NextResponse.json({ item });
    }

    // Ajuste manual de varias líneas.
    const lines = Array.isArray(body.lines)
      ? body.lines
          .filter((line): line is { code: string; quantity: number } => {
            if (typeof line !== "object" || line === null) return false;
            const candidate = line as { code?: unknown; quantity?: unknown };
            return typeof candidate.code === "string" && typeof candidate.quantity === "number" && candidate.quantity > 0;
          })
          .map((line) => ({ code: line.code, quantity: line.quantity }))
      : [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "Se requiere { itemId, quantity } o { lines }." }, { status: 400 });
    }
    const reason: SupplyMovementReason =
      typeof body.reason === "string" && (MOVEMENT_REASONS as readonly string[]).includes(body.reason)
        ? (body.reason as SupplyMovementReason)
        : "ADJUSTMENT";
    const results = await repo.consumeSupplies(lines, auth.session.username, reason);
    const lowStock = results.filter((result) => result.lowStock).map((result) => result.item);
    if (lowStock.length > 0) void notifyLowStock(lowStock, "admin:supplies");
    return NextResponse.json({ results, lowStock });
  } catch (error: unknown) {
    if (error instanceof HousekeepingError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    console.error("[API /api/admin/housekeeping/supplies] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar la lencería." }, { status: 500 });
  }
}


/**
 * PATCH /api/admin/housekeeping/supplies — configura el **umbral** de un artículo (F8 · T8.6, D-C33).
 * Cuerpo `{ itemId, thresholdQty >= 0 }`. Tras cambiarlo concilia la alerta del artículo.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  let body: { itemId?: unknown; thresholdQty?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.itemId !== "string" || typeof body.thresholdQty !== "number" || body.thresholdQty < 0) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "itemId y thresholdQty (>=0) son obligatorios." }, { status: 400 });
  }
  try {
    const item = await repo.setSupplyThreshold(body.itemId, body.thresholdQty, auth.session.username);
    const sync = await alertsRepo.syncForItem(body.itemId);
    return NextResponse.json({ item, alertAction: sync.action });
  } catch (error: unknown) {
    console.error("[API /api/admin/housekeeping/supplies] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar el umbral." }, { status: 500 });
  }
}
