import { describe, expect, it } from "vitest";
import { buildRoomSeed } from "./room-registry";
import type { RoomSeedEntry } from "./room-registry";
import {
  auditRoomsVsChain,
  planMasterSeed,
  splitIndexAgainsChain,
  type DbRoomRow,
} from "./room-reconciliation";

const dbRoom = (overrides: Partial<DbRoomRow> = {}): DbRoomRow => ({
  roomNumber: 101,
  roomType: "SIMPLE",
  publicationStatus: "DRAFT",
  archivedAt: null,
  ...overrides,
});

describe("planMasterSeed (D-14: la base es la fuente, el maestro la semilla)", () => {
  const seed: RoomSeedEntry[] = [
    { ...buildRoomSeed()[0]!, roomNumber: 101 },
    { ...buildRoomSeed()[0]!, roomNumber: 102 },
    { ...buildRoomSeed()[0]!, roomNumber: 103 },
  ];

  it("siembra solo las que faltan, ordenadas", () => {
    const pending = planMasterSeed(new Set([102]), seed);
    expect(pending.map((room) => room.roomNumber)).toEqual([101, 103]);
  });

  it("con la base vacía siembra todo el maestro", () => {
    expect(planMasterSeed(new Set(), buildRoomSeed())).toHaveLength(50);
  });

  it("una base ya completa no re-siembra nada (idempotente)", () => {
    const all = new Set(buildRoomSeed().map((room) => room.roomNumber));
    expect(planMasterSeed(all, buildRoomSeed())).toEqual([]);
  });
});

describe("auditRoomsVsChain (registro on-chain ↔ maestro administrado)", () => {
  it("base vacía + habitación registrada = MISSING_IN_DB (el caso real del 2026-10-18)", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [],
      chainRooms: [{ room: 201, roomType: "suite" }],
    });
    expect(issues.map((issue) => issue.kind)).toContain("MISSING_IN_DB");
    expect(issues[0]?.roomNumber).toBe(201);
  });

  it("un tipo distinto entre cadena y base es TYPE_MISMATCH", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [dbRoom({ roomNumber: 101, roomType: "DOBLE" })],
      chainRooms: [{ room: 101, roomType: "simple" }],
    });
    expect(issues.some((issue) => issue.kind === "TYPE_MISMATCH")).toBe(true);
  });

  it("una habitación publicada sin registro on-chain se informa", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [dbRoom({ roomNumber: 201, roomType: "SUITE", publicationStatus: "PUBLISHED" })],
      chainRooms: [],
    });
    expect(issues.map((issue) => issue.kind)).toContain("PUBLISHED_NOT_REGISTERED");
  });

  it("una habitación DRAFT del maestro es correcta sin registro (no se publica todavía)", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [dbRoom({ roomNumber: 101, roomType: "SIMPLE", publicationStatus: "DRAFT" })],
      chainRooms: [],
    });
    expect(issues).toEqual([]);
  });

  it("una archivada registrada se informa (deuda de contrato)", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [
        dbRoom({
          roomNumber: 201,
          roomType: "SUITE",
          archivedAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      chainRooms: [{ room: 201, roomType: "suite" }],
    });
    expect(issues.map((issue) => issue.kind)).toContain("ARCHIVED_BUT_REGISTERED");
  });

  it("un tipo de la base fuera del maestro se informa", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [dbRoom({ roomNumber: 101, roomType: "SUITE" })],
      chainRooms: [],
    });
    expect(issues.map((issue) => issue.kind)).toContain("DB_TYPE_NOT_CANONICAL");
  });

  it("un número fuera del maestro canónico se informa", () => {
    const issues = auditRoomsVsChain({
      dbRooms: [dbRoom({ roomNumber: 999, roomType: "SIMPLE" })],
      chainRooms: [],
    });
    expect(issues.map((issue) => issue.kind)).toContain("NOT_IN_MASTER");
  });
});

describe("splitIndexAgainsChain (purga de filas heredadas del redeploy)", () => {
  it("separa por tokenId lo que existe en la cadena vigente de lo heredado", () => {
    const { keep, stale } = splitIndexAgainsChain(
      ["10120261018", "20120261115", "10120261019"],
      new Set(["20120261115"]),
    );
    expect(keep).toEqual(["20120261115"]);
    expect(stale).toEqual(["10120261018", "10120261019"]);
  });

  it("una cadena sin noches deja todo el índice como obsoleto", () => {
    const { keep, stale } = splitIndexAgainsChain(["10120261018"], new Set());
    expect(keep).toEqual([]);
    expect(stale).toEqual(["10120261018"]);
  });
});
