import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MINT_WINDOW_DAYS_KEY,
  NFTsRepository,
  RoomsRepository,
  SettingsRepository,
  addDaysYYYYMMDD,
  buildMintWindow,
  deriveMintWindowStatus,
  splitYYYYMMDD,
  todayYYYYMMDDUtc,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const nftsRepo = new NFTsRepository();
const settingsRepo = new SettingsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** `AAAAMMDD` → ISO `AAAA-MM-DD` (formato de `nfts.check_in_date`). */
function toIso(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * GET /api/admin/rooms/[id]/mint-window — noches que faltan por acuñar de una habitación dentro de
 * la **ventana global** (F8 · D-4/D-11/D-16/D-17), solo owner.
 *
 * Devuelve la lista de noches **ausentes** (idempotencia: las que ya existen en `nfts` no se
 * repiten) con su `tokenId` y precio, y el estado de agotamiento (noches existentes sin vender).
 * La firma on-chain la hace la wallet del administrador en el navegador (ADR-11); esta ruta no
 * emite transacciones.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const room = await roomsRepo.findById(id);
    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }

    const windowDays = await settingsRepo.getNumber(MINT_WINDOW_DAYS_KEY, 90);
    const today = todayYYYYMMDDUtc();
    const existing = await nftsRepo.listByRoomInDateRange(
      room.roomNumber,
      toIso(addDaysYYYYMMDD(today, 1)),
      toIso(addDaysYYYYMMDD(today, windowDays)),
    );
    const existingIds = new Set(existing.map((row) => row.tokenId));
    const freeNights = existing.filter((row) => row.status === "AVAILABLE").length;

    const nights = buildMintWindow({
      room: room.roomNumber,
      roomType: room.roomType.toLowerCase() as "simple" | "doble" | "suite",
      todayYYYYMMDD: today,
      windowDays,
      isMinted: (tokenId) => existingIds.has(tokenId.toString()),
    });

    const status = deriveMintWindowStatus({ windowDays, missing: nights.length, freeNights });

    return NextResponse.json({
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      windowDays,
      /** Precio base de la ficha; si falta, el cliente no debe acuñar (no se inventa una tarifa). */
      basePriceWei: room.baseRateWei ?? null,
      canMint: room.publicationStatus === "PUBLISHED" && room.baseRateWei !== null,
      nights: nights.map((night) => ({
        dateYYYYMMDD: night.dateYYYYMMDD,
        tokenId: night.tokenId.toString(),
        priceWei: room.baseRateWei ?? null,
      })),
      status,
    });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]/mint-window] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo calcular la ventana de acuñación." },
      { status: 500 },
    );
  }
}
