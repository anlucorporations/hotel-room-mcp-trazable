import { MINT_WINDOW_DAYS_KEY, type SettingsRepository } from "../db/repositories/settings.repository";
import type { NFTsRepository } from "../db/repositories/nfts.repository";
import type { RoomRecord, RoomsRepository } from "../db/repositories/rooms.repository";
import {
  addDaysYYYYMMDD,
  buildMintWindow,
  deriveMintWindowStatus,
  MINT_WINDOW_LOW_THRESHOLD,
  todayYYYYMMDDUtc,
} from "../domain/mint-window";
import { splitYYYYMMDD } from "../domain/token-id";
import type { NightType } from "../domain/types";

/**
 * Estado de la **ventana global de acuñación** por habitación (F8 · D-4/D-11/D-16/D-17).
 *
 * Es la pieza que comparten el **barrido global** del back-office
 * (`GET /api/admin/rooms/window-overview`) y el **aviso de agotamiento** del worker: una sola
 * fuente de verdad del cálculo, para que la vista y el correo no puedan discrepar.
 *
 * Sólo **lee**: no emite transacciones. El acuñado lo firma la wallet del administrador en el
 * navegador (ADR-11, `useMintWindow`), habitación a habitación.
 *
 * Los colaboradores entran por parámetro (`Pick<…>` de los repositorios) para poder probar el
 * cálculo multi-habitación sin base de datos, que es el banco de pruebas del barrido.
 */
export interface MintWindowRoomStatus {
  roomId: string;
  roomNumber: number;
  roomType: string;
  /** Tarifa base en wei como cadena; `null` si la ficha no la tiene (no se inventa precio). */
  basePriceWei: string | null;
  /** Noches de la ventana que aún no existen (0 = ventana completa). */
  missing: number;
  /** Noches existentes y todavía sin vender. */
  freeNights: number;
  /** Menos noches libres que el umbral: aviso de agotamiento (D-17). */
  low: boolean;
}

export interface MintWindowOverview {
  /** Días de la ventana vigente (`mint_window_days`, D-11). */
  windowDays: number;
  /** Umbral de noches libres por debajo del cual se avisa del agotamiento (D-17). */
  threshold: number;
  totals: { rooms: number; missing: number; low: number };
  rooms: MintWindowRoomStatus[];
}

export interface MintWindowOverviewDeps {
  readonly rooms: Pick<RoomsRepository, "listRooms">;
  readonly nfts: Pick<NFTsRepository, "listByRoomInDateRange">;
  readonly settings: Pick<SettingsRepository, "getNumber">;
  /** «Hoy» inyectable (pruebas deterministas); por defecto, el de UTC. */
  readonly todayYYYYMMDD?: number;
  /** Umbral de agotamiento (D-17); por defecto, {@link MINT_WINDOW_LOW_THRESHOLD}. */
  readonly threshold?: number;
}

/** `AAAAMMDD` → ISO `AAAA-MM-DD` (formato de `nfts.check_in_date`). */
export function toIsoDate(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Ventana vigente + estado por habitación **publicada**, ordenado por lo que más falta acuñar. */
export async function buildMintWindowOverview(
  deps: MintWindowOverviewDeps,
): Promise<MintWindowOverview> {
  const { rooms: roomsRepo, nfts: nftsRepo, settings: settingsRepo } = deps;
  const threshold = deps.threshold ?? MINT_WINDOW_LOW_THRESHOLD;
  const windowDays = await settingsRepo.getNumber(MINT_WINDOW_DAYS_KEY, 90);
  const today = deps.todayYYYYMMDD ?? todayYYYYMMDDUtc();

  const published = (await roomsRepo.listRooms()).filter(
    (room: RoomRecord) => room.publicationStatus === "PUBLISHED",
  );

  const fromIso = toIsoDate(addDaysYYYYMMDD(today, 1));
  const toIso = toIsoDate(addDaysYYYYMMDD(today, windowDays));

  let missingTotal = 0;
  let lowTotal = 0;
  const rooms: MintWindowRoomStatus[] = [];
  for (const room of published) {
    const existing = await nftsRepo.listByRoomInDateRange(room.roomNumber, fromIso, toIso);
    const existingIds = new Set(existing.map((row) => row.tokenId));
    const freeNights = existing.filter((row) => row.status === "AVAILABLE").length;
    const nights = buildMintWindow({
      room: room.roomNumber,
      roomType: room.roomType.toLowerCase() as NightType,
      todayYYYYMMDD: today,
      windowDays,
      isMinted: (tokenId) => existingIds.has(tokenId.toString()),
    });
    const status = deriveMintWindowStatus({
      windowDays,
      missing: nights.length,
      freeNights,
      threshold,
    });
    missingTotal += status.missing;
    if (status.low) lowTotal += 1;
    rooms.push({
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      basePriceWei: room.baseRateWei ?? null,
      missing: status.missing,
      freeNights: status.freeNights,
      low: status.low,
    });
  }
  rooms.sort((a, b) => b.missing - a.missing || a.roomNumber - b.roomNumber);

  return {
    windowDays,
    threshold,
    totals: { rooms: rooms.length, missing: missingTotal, low: lowTotal },
    rooms,
  };
}

/**
 * Habitaciones **publicadas** en agotamiento (menos noches libres que el umbral, D-17).
 *
 * Función pura sobre el resumen: la usa el planificador del aviso para redactar el correo y para
 * decidir qué avisos se rearman (las que dejan de estar en agotamiento).
 */
export function selectLowRooms(overview: MintWindowOverview): MintWindowRoomStatus[] {
  return overview.rooms.filter((room) => room.low);
}
