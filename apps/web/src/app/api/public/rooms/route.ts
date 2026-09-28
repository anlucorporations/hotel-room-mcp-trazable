import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ExchangeRateService,
  MaintenanceRepository,
  RoomsRepository,
  weiToEurCents,
} from "@hotel/shared";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const maintenanceRepo = new MaintenanceRepository();
const rates = new ExchangeRateService();

/**
 * GET /api/public/rooms — habitaciones **reservables** desde la web pública (F6 · D-65, D-72).
 *
 * Endpoint **público** (sin sesión): devuelve solo lo necesario para reservar —id, número, tipo,
 * capacidad, metros y tarifa— excluyendo las archivadas y las **bloqueadas por avería** (D-53). No
 * expone descripciones ni datos internos.
 *
 * Desde la Fase C.2 incluye `perNightCents`, convertido con la **misma tasa** que usa el cobro
 * (`POST /api/public/reservations`), de modo que el resumen que ve el huésped no puede separarse del
 * importe que se le pide. La conversión es **best-effort**: si la tasa no está disponible se devuelve
 * `null` y la interfaz dice que el importe se confirma al retener, en lugar de inventar un precio.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const [rooms, blocked] = await Promise.all([
      roomsRepo.listRooms(),
      maintenanceRepo.listBlockedRoomIds(),
    ]);
    const blockedIds = new Set(blocked);

    let rate: number | null = null;
    try {
      rate = (await rates.getRate()).rate;
    } catch {
      rate = null;
    }

    const reservable = rooms
      .filter((room) => room.publicationStatus === "PUBLISHED" && !blockedIds.has(room.id))
      .map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        capacity: room.capacity,
        sizeM2: room.sizeM2,
        baseRateWei: room.baseRateWei,
        perNightCents:
          rate === null || !room.baseRateWei ? null : weiToEurCents(room.baseRateWei, rate),
      }));
    return NextResponse.json({ rooms: reservable });
  } catch (error: unknown) {
    console.error("[API /api/public/rooms] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las habitaciones." },
      { status: 500 },
    );
  }
}
