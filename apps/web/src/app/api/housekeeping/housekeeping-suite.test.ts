import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockSettings, mockAssertSignature, mockFetchBoard } = vi.hoisted(() => ({
  mockRepo: {
    listInspections: vi.fn(),
    createInspection: vi.fn(),
    applyInspectionToRoom: vi.fn(),
  },
  mockSettings: { get: vi.fn() },
  mockAssertSignature: vi.fn(),
  mockFetchBoard: vi.fn(),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    HousekeepingRepository: vi.fn(() => mockRepo),
    SettingsRepository: vi.fn(() => mockSettings),
  };
});

vi.mock("@/lib/mantenimiento/signatures", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, assertSignatureAuthorizes: mockAssertSignature };
});

vi.mock("@/lib/housekeeping-state", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fetchRoomStateBoard: mockFetchBoard };
});

import { GET as inspectionsGet, POST as inspectionsPost } from "./inspections/route";
import { GET as stateBoardGet } from "./state-board/route";

const ROOM_ID = "c03d0ba4-d7e1-4102-beb0-5c3ec3413608";
const SIGNATURE_ID = "6f6d5f0e-4a2b-4e0b-8c3d-2c2d6f9d1a11";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("API Inspecciones del ama de llaves (F6 · T6.3/T6.4/T6.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("GET devuelve inspecciones y el flag de firma (por defecto desactivado)", async () => {
    mockRepo.listInspections.mockResolvedValue([]);
    mockSettings.get.mockResolvedValue(null);
    const res = await inspectionsGet(new NextRequest("http://localhost/api/housekeeping/inspections"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.signatureRequired).toBe(false);
    expect(lastRequiredRole()).toEqual(["HOUSEKEEPING", "HOUSEKEEPER", "HEAD_KEEPER"]);
  });

  it("con el flag activo, GET lo refleja", async () => {
    mockRepo.listInspections.mockResolvedValue([]);
    mockSettings.get.mockResolvedValue("true");
    const res = await inspectionsGet(new NextRequest("http://localhost/api/housekeeping/inspections"));
    expect((await res.json()).signatureRequired).toBe(true);
  });

  it("sin flag, la inspección se registra sin firma y aplica el resultado", async () => {
    mockSettings.get.mockResolvedValue(null);
    mockRepo.createInspection.mockResolvedValue({ id: "insp-1" });
    const res = await inspectionsPost(
      jsonRequest("http://localhost/api/housekeeping/inspections", {
        roomId: ROOM_ID,
        inspectionType: "CHECKOUT",
        result: "APPROVED",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockAssertSignature).not.toHaveBeenCalled();
    expect(mockRepo.createInspection).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: ROOM_ID, inspectionType: "CHECKOUT", result: "APPROVED", signatureId: null }),
    );
    expect(mockRepo.applyInspectionToRoom).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      result: "APPROVED",
      assignmentId: null,
    });
    expect((await res.json()).roomOperationalStatus).toBe("CLEAN");
  });

  it("con el flag activo, sin firma se rechaza con 409 SIGNATURE_REQUIRED", async () => {
    mockSettings.get.mockResolvedValue("true");
    const res = await inspectionsPost(
      jsonRequest("http://localhost/api/housekeeping/inspections", {
        roomId: ROOM_ID,
        inspectionType: "CHECKOUT",
        result: "APPROVED",
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("SIGNATURE_REQUIRED");
    expect(mockRepo.createInspection).not.toHaveBeenCalled();
  });

  it("con el flag activo y firma válida, se valida el payload INSPECTION y se enlaza", async () => {
    mockSettings.get.mockResolvedValue("true");
    mockAssertSignature.mockResolvedValue({ id: SIGNATURE_ID });
    mockRepo.createInspection.mockResolvedValue({ id: "insp-1", signatureId: SIGNATURE_ID });
    const res = await inspectionsPost(
      jsonRequest("http://localhost/api/housekeeping/inspections", {
        roomId: ROOM_ID,
        inspectionType: "DAILY_SERVICE",
        result: "REJECTED",
        observations: "Baño sin repasar",
        signatureId: SIGNATURE_ID,
      }),
    );
    expect(res.status).toBe(201);
    expect(mockAssertSignature).toHaveBeenCalledWith(
      expect.objectContaining({ action: "INSPECTION", entityUuid: ROOM_ID }),
    );
    // Rechazar devuelve la habitación a DIRTY (retrabajo); la publicación no se toca (D-C9).
    expect(mockRepo.applyInspectionToRoom).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: ROOM_ID, result: "REJECTED" }),
    );
    expect((await res.json()).roomOperationalStatus).toBe("DIRTY");
  });

  it("POST exige rol HEAD_KEEPER (o el owner)", async () => {
    mockSettings.get.mockResolvedValue(null);
    mockRepo.createInspection.mockResolvedValue({ id: "insp-1" });
    await inspectionsPost(
      jsonRequest("http://localhost/api/housekeeping/inspections", {
        roomId: ROOM_ID,
        inspectionType: "CHECKOUT",
        result: "APPROVED",
      }),
    );
    expect(lastRequiredRole()).toEqual(["HEAD_KEEPER", "DEFAULT_ADMIN_ROLE"]);
  });

  it("rechaza tipos o resultados fuera del vocabulario", async () => {
    const badType = await inspectionsPost(
      jsonRequest("http://localhost/api/housekeeping/inspections", {
        roomId: ROOM_ID,
        inspectionType: "MAGIA",
        result: "APPROVED",
      }),
    );
    expect(badType.status).toBe(400);
    const badResult = await inspectionsPost(
      jsonRequest("http://localhost/api/housekeeping/inspections", {
        roomId: ROOM_ID,
        inspectionType: "CHECKOUT",
        result: "QUIZA",
      }),
    );
    expect(badResult.status).toBe(400);
  });
});

describe("API Tablero de estados (F6 · T6.2/T6.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("devuelve el tablero de estados y exige rol de la suite", async () => {
    mockFetchBoard.mockResolvedValue({ date: "2026-10-19", rooms: [], summary: {}, generatedAt: "" });
    const res = await stateBoardGet(new NextRequest("http://localhost/api/housekeeping/state-board"));
    expect(res.status).toBe(200);
    expect(lastRequiredRole()).toEqual(["HOUSEKEEPING", "HOUSEKEEPER", "HEAD_KEEPER"]);
  });

  it("rechaza una fecha no válida", async () => {
    const res = await stateBoardGet(
      new NextRequest("http://localhost/api/housekeeping/state-board?date=2026-13-01"),
    );
    expect(res.status).toBe(400);
  });
});
