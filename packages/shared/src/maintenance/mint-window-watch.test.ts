import { describe, expect, it, vi } from "vitest";
import { encodeTokenId } from "../domain/token-id";
import {
  buildMintWindowOverview,
  selectLowRooms,
  toIsoDate,
  type MintWindowOverviewDeps,
} from "./mint-window-watch";

/**
 * Banco de pruebas **multi-habitación** del barrido global (F8 · D-4/D-11/D-16/D-17).
 *
 * Reproduce lo que hace el back-office al pulsar «Barrido global» y lo que leerá el aviso de
 * agotamiento, sobre varias habitaciones con estados distintos: ventana completa, ventana a medias
 * con noches vendidas y ventana vacía. Comprueba que el cálculo es **idempotente por token**
 * (las noches ya acuñadas no se vuelven a contar), que las fichas **no publicadas** quedan fuera y
 * que el aviso de agotamiento sólo marca a las que de verdad están por debajo del umbral.
 */

const windowDays = 10;
const today = 20260601;
const firstNight = 20260602; // hoy + 1
const lastNight = 20260611; // hoy + windowDays

const room = (overrides: Record<string, unknown>) => ({
  id: `room-${overrides.roomNumber}`,
  roomNumber: 101,
  floor: 1,
  roomType: "SIMPLE" as const,
  capacity: 2,
  beds: 1,
  sizeM2: 20,
  descriptionEs: "Habitación de prueba",
  descriptionEn: null,
  descriptionRu: null,
  baseRateWei: "100000000000000000",
  publicationStatus: "PUBLISHED" as const,
  operationalStatus: "CLEAN" as const,
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const published = [
  room({ roomNumber: 101, roomType: "SIMPLE" }),
  room({ roomNumber: 116, roomType: "DOBLE", baseRateWei: "150000000000000000" }),
  room({ roomNumber: 201, roomType: "SUITE", baseRateWei: null }),
];
const draft = room({ roomNumber: 220, roomType: "SUITE", publicationStatus: "DRAFT" });

/** Noches existentes por habitación: token ya acuñado + estado de venta. */
const existingByRoom: Record<number, Array<{ tokenId: string; status: string }>> = {
  // Ventana completa y todo libre.
  101: Array.from({ length: windowDays }, (_, index) => ({
    tokenId: encodeTokenId(101, firstNight + index).toString(),
    status: "AVAILABLE",
  })),
  // Media ventana acuñada, con dos noches vendidas.
  116: Array.from({ length: 5 }, (_, index) => ({
    tokenId: encodeTokenId(116, firstNight + index).toString(),
    status: index < 3 ? "AVAILABLE" : "SOLD",
  })),
  // Ventana vacía.
  201: [],
};

function deps(overrides: Partial<MintWindowOverviewDeps> = {}): MintWindowOverviewDeps {
  return {
    rooms: { listRooms: vi.fn(async () => [...published, draft]) },
    nfts: {
      listByRoomInDateRange: vi.fn(async (roomNumber: number) => existingByRoom[roomNumber] ?? []),
    },
    settings: { getNumber: vi.fn(async () => windowDays) },
    todayYYYYMMDD: today,
    ...overrides,
  };
}

describe("buildMintWindowOverview (F8 · barrido global multi-habitación)", () => {
  it("resume la ventana de todas las habitaciones publicadas, ignorando los borradores", async () => {
    const depsUnderTest = deps();
    const overview = await buildMintWindowOverview(depsUnderTest);

    expect(depsUnderTest.settings.getNumber).toHaveBeenCalledWith("mint_window_days", 90);
    expect(depsUnderTest.nfts.listByRoomInDateRange).toHaveBeenCalledTimes(3);
    expect(depsUnderTest.nfts.listByRoomInDateRange).toHaveBeenCalledWith(
      101,
      toIsoDate(firstNight),
      toIsoDate(lastNight),
    );
    expect(depsUnderTest.nfts.listByRoomInDateRange).not.toHaveBeenCalledWith(
      220,
      expect.anything(),
      expect.anything(),
    );

    expect(overview.windowDays).toBe(windowDays);
    expect(overview.totals).toEqual({ rooms: 3, missing: 15, low: 2 });
    // Orden: lo que más falta acuñar primero; a igualdad, por número de habitación.
    expect(overview.rooms.map((entry) => entry.roomNumber)).toEqual([201, 116, 101]);
  });

  it("no vuelve a contar las noches ya acuñadas y respeta las vendidas (idempotencia D-16)", async () => {
    const overview = await buildMintWindowOverview(deps());
    const [suite, doble, simple] = overview.rooms;

    expect(simple).toMatchObject({ roomNumber: 101, missing: 0, freeNights: 10, low: false });
    expect(doble).toMatchObject({ roomNumber: 116, missing: 5, freeNights: 3, low: true });
    expect(suite).toMatchObject({ roomNumber: 201, missing: 10, freeNights: 0, low: true, basePriceWei: null });
  });

  it("el umbral de agotamiento es configurable (D-17)", async () => {
    const overview = await buildMintWindowOverview(deps({ threshold: 2 }));
    expect(overview.rooms.find((entry) => entry.roomNumber === 116)?.low).toBe(false);
    expect(selectLowRooms(overview).map((entry) => entry.roomNumber)).toEqual([201]);
    expect(overview.totals.low).toBe(1);
  });

  it("una ventana de 0 días no exige ninguna noche", async () => {
    const overview = await buildMintWindowOverview(
      deps({ settings: { getNumber: vi.fn(async () => 0) } }),
    );
    expect(overview.rooms.every((entry) => entry.missing === 0)).toBe(true);
  });

  it("devuelve un resumen vacío si no hay ninguna habitación publicada", async () => {
    const overview = await buildMintWindowOverview(
      deps({ rooms: { listRooms: vi.fn(async () => [draft]) } }),
    );
    expect(overview).toEqual({
      windowDays,
      threshold: 7,
      totals: { rooms: 0, missing: 0, low: 0 },
      rooms: [],
    });
  });
});

describe("toIsoDate", () => {
  it("formatea AAAAMMDD como fecha ISO con ceros a la izquierda", () => {
    expect(toIsoDate(20260601)).toBe("2026-06-01");
    expect(toIsoDate(20261231)).toBe("2026-12-31");
  });
});
