import { describe, it, expect } from "vitest";
import { isRoomEligibleForBulk, reservedNightsOf, selectableRoomIds } from "./room-bulk";
import type { AdminRoom } from "./room-dto";

/** Habitación mínima del tablero: solo lo que miran las reglas de elegibilidad. */
function room(overrides: Partial<AdminRoom> = {}): AdminRoom {
  return {
    id: "room-1",
    roomNumber: 101,
    floor: 1,
    roomType: "DOBLE",
    capacity: 2,
    beds: 2,
    sizeM2: null,
    descriptionEs: "Doble",
    descriptionEn: null,
    descriptionRu: null,
    baseRateWei: null,
    viewKind: null,
    hasBalcony: false,
    isAccessible: false,
    decorStyle: null,
    decorPalette: null,
    decorMaterials: null,
    decorNotesEs: null,
    decorNotesEn: null,
    decorNotesRu: null,
    publicationStatus: "DRAFT",
    operationalStatus: "CLEAN",
    reservedNights: 0,
    archivedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isRoomEligibleForBulk (2026-10-04, acciones masivas)", () => {
  describe("PUBLISH — habilitada (limpia y sin reserva) y no publicada", () => {
    it("admite una limpia, sin reservas y en borrador", () => {
      expect(isRoomEligibleForBulk(room({ publicationStatus: "DRAFT" }), "PUBLISH")).toBe(true);
    });

    it("admite una pausada limpia y sin reservas", () => {
      expect(isRoomEligibleForBulk(room({ publicationStatus: "PAUSED" }), "PUBLISH")).toBe(true);
    });

    it("rechaza la que ya está publicada", () => {
      expect(isRoomEligibleForBulk(room({ publicationStatus: "PUBLISHED" }), "PUBLISH")).toBe(false);
    });

    it("rechaza la sucia o la ocupada", () => {
      expect(isRoomEligibleForBulk(room({ operationalStatus: "DIRTY" }), "PUBLISH")).toBe(false);
      expect(isRoomEligibleForBulk(room({ operationalStatus: "OCCUPIED" }), "PUBLISH")).toBe(false);
    });

    it("rechaza la que tiene noches reservadas", () => {
      expect(isRoomEligibleForBulk(room({ reservedNights: 2 }), "PUBLISH")).toBe(false);
    });
  });

  describe("RELEASE — solo las reservadas", () => {
    it("admite la que tiene noches reservadas", () => {
      expect(isRoomEligibleForBulk(room({ reservedNights: 1 }), "RELEASE")).toBe(true);
    });

    it("rechaza la que no tiene reservas", () => {
      expect(isRoomEligibleForBulk(room({ reservedNights: 0 }), "RELEASE")).toBe(false);
    });
  });

  describe("TOGGLE — solo las activas y sin reserva", () => {
    it("admite la publicada sin reservas", () => {
      expect(isRoomEligibleForBulk(room({ publicationStatus: "PUBLISHED" }), "TOGGLE")).toBe(true);
    });

    it("rechaza la publicada con reservas", () => {
      expect(isRoomEligibleForBulk(room({ publicationStatus: "PUBLISHED", reservedNights: 3 }), "TOGGLE")).toBe(false);
    });

    it("rechaza la que no está publicada", () => {
      expect(isRoomEligibleForBulk(room({ publicationStatus: "PAUSED" }), "TOGGLE")).toBe(false);
      expect(isRoomEligibleForBulk(room({ publicationStatus: "DRAFT" }), "TOGGLE")).toBe(false);
    });
  });
});

describe("selectableRoomIds", () => {
  it("devuelve solo las elegibles y en el orden del listado", () => {
    const rooms = [
      room({ id: "a", publicationStatus: "DRAFT" }),
      room({ id: "b", publicationStatus: "PUBLISHED" }),
      room({ id: "c", publicationStatus: "PAUSED", reservedNights: 1 }),
      room({ id: "d", publicationStatus: "PAUSED" }),
    ];
    expect(selectableRoomIds(rooms, "PUBLISH")).toEqual(["a", "d"]);
    expect(selectableRoomIds(rooms, "RELEASE")).toEqual(["c"]);
    expect(selectableRoomIds(rooms, "TOGGLE")).toEqual(["b"]);
  });
});

describe("reservedNightsOf · regresión bigint→cadena (release v21, 2026-10-04)", () => {
  it("normaliza una cadena numérica a número", () => {
    expect(reservedNightsOf(room({ reservedNights: "0" as unknown as number }))).toBe(0);
    expect(reservedNightsOf(room({ reservedNights: "3" as unknown as number }))).toBe(3);
  });

  it("trata un valor no numérico como 0", () => {
    expect(reservedNightsOf(room({ reservedNights: "x" as unknown as number }))).toBe(0);
    expect(reservedNightsOf(room({ reservedNights: null as unknown as number }))).toBe(0);
  });

  it("PUBLICAR y ACTIVAR siguen habilitadas cuando el JSON trae «0» como cadena", () => {
    const clean = room({ publicationStatus: "DRAFT", reservedNights: "0" as unknown as number });
    expect(isRoomEligibleForBulk(clean, "PUBLISH")).toBe(true);

    const published = room({ publicationStatus: "PUBLISHED", reservedNights: "0" as unknown as number });
    expect(isRoomEligibleForBulk(published, "TOGGLE")).toBe(true);
  });

  it("LIBERAR reconoce las reservas cuando llegan como cadena", () => {
    const reserved = room({ reservedNights: "2" as unknown as number });
    expect(isRoomEligibleForBulk(reserved, "RELEASE")).toBe(true);
    expect(isRoomEligibleForBulk(reserved, "PUBLISH")).toBe(false);
  });
});
