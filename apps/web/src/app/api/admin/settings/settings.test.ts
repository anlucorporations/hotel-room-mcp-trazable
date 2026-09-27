import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockSettings } = vi.hoisted(() => ({
  mockSettings: { getNumber: vi.fn(), set: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, SettingsRepository: vi.fn(() => mockSettings) };
});

import { GET, PUT } from "./route";

const put = (body: unknown): NextRequest =>
  new NextRequest("http://localhost/api/admin/settings", { method: "PUT", body: JSON.stringify(body) });

describe("API /api/admin/settings (D-11/D-37/D-42)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockSettings.getNumber.mockImplementation(async (_key: string, fallback: number) => fallback);
  });

  it("exige DEFAULT_ADMIN_ROLE", async () => {
    await GET(new NextRequest("http://localhost/api/admin/settings"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("GET devuelve los ajustes con su respaldo", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/settings"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.settings.reservation_deposit_percent).toBe(30);
    expect(data.settings.reservation_hold_hours).toBe(24);
  });

  it("PUT guarda un ajuste válido", async () => {
    mockSettings.set.mockResolvedValue(undefined);
    const res = await PUT(put({ reservation_deposit_percent: 50 }));
    expect(res.status).toBe(200);
    expect(mockSettings.set).toHaveBeenCalledWith("reservation_deposit_percent", "50", "admin@hotel.es");
  });

  it("PUT rechaza un valor fuera de rango sin escribir", async () => {
    const res = await PUT(put({ reservation_deposit_percent: 150 }));
    expect(res.status).toBe(400);
    expect(mockSettings.set).not.toHaveBeenCalled();
  });

  it("PUT rechaza un cuerpo sin ajustes conocidos", async () => {
    const res = await PUT(put({ otra_cosa: 1 }));
    expect(res.status).toBe(400);
  });
});
