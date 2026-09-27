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

/** `AAAAMMDD` → ISO `AAAA-MM-DD`. */
function toIso(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * GET /api/admin/rooms/window-overview — estado de la **ventana global** para todas las
 * habitaciones **publicadas** (F8 · D-4/D-11/D-16/D-17), solo owner.
 *
 * Es la vista que alimenta el **barrido global**: cuántas noches faltan por acuñar y cuántas quedan
 * libres (para el aviso de agotamiento) en cada habitación publicada. No emite transacciones; el
 * acuñado lo firma la wallet del administrador (ADR-11), habitación a habitación, reutilizando el
 * endpoint `GET /api/admin/rooms/[id]/mint-window`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const windowDays = await settingsRepo.getNumber(MINT_WINDOW_DAYS_KEY, 90);
    const rooms = (await roomsRepo.listRooms()).filter((room) => room.publicationStatus === "PUBLISHED");
    const today = todayYYYYMMDDUtc();
    const fromIso = toIso(addDaysYYYYMMDD(today, 1));
    const toIsoDate = toIso(addDaysYYYYMMDD(today, windowDays));

    let missingTotal = 0;
    let lowTotal = 0;
    const entries = [];
    for (const room of rooms) {
      const existing = await nftsRepo.listByRoomInDateRange(room.roomNumber, fromIso, toIsoDate);
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
      missingTotal += status.missing;
      if (status.low) lowTotal += 1;
      entries.push({
        roomId: room.id,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        basePriceWei: room.baseRateWei ?? null,
        missing: status.missing,
        freeNights: status.freeNights,
        low: status.low,
      });
    }
    entries.sort((a, b) => b.missing - a.missing || a.roomNumber - b.roomNumber);

    return NextResponse.json({
      windowDays,
      totals: { rooms: entries.length, missing: missingTotal, low: lowTotal },
      rooms: entries,
    });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/window-overview] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo calcular la ventana global." },
      { status: 500 },
    );
  }
}
