import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  NFTsRepository,
  RoomsRepository,
  SettingsRepository,
  buildMintWindowOverview,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const nftsRepo = new NFTsRepository();
const settingsRepo = new SettingsRepository();

/**
 * GET /api/admin/rooms/window-overview — estado de la **ventana global** para todas las
 * habitaciones **publicadas** (F8 · D-4/D-11/D-16/D-17), solo owner.
 *
 * Es la vista que alimenta el **barrido global**: cuántas noches faltan por acuñar y cuántas quedan
 * libres (para el aviso de agotamiento) en cada habitación publicada. No emite transacciones; el
 * acuñado lo firma la wallet del administrador (ADR-11), habitación a habitación, reutilizando el
 * endpoint `GET /api/admin/rooms/[id]/mint-window`.
 *
 * El cálculo vive en `@hotel/shared` (`buildMintWindowOverview`) porque lo comparte el **aviso de
 * agotamiento** del worker: una sola fuente de verdad para la vista y el correo.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const overview = await buildMintWindowOverview({
      rooms: roomsRepo,
      nfts: nftsRepo,
      settings: settingsRepo,
    });
    return NextResponse.json(overview);
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/window-overview] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo calcular la ventana global." },
      { status: 500 },
    );
  }
}
