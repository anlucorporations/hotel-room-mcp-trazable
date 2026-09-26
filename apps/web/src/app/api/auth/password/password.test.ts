import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, resetGuardState, setGuardState } from "../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockFindUser, mockCompare, mockHash, mockUpdate } = vi.hoisted(() => ({
  mockFindUser: vi.fn(),
  mockCompare: vi.fn(),
  mockHash: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    AuthService: vi.fn().mockImplementation(() => ({
      findUser: mockFindUser,
      comparePassword: mockCompare,
      hashPassword: mockHash,
    })),
    UsersRepository: vi.fn().mockImplementation(() => ({ updatePasswordHash: mockUpdate })),
  };
});

import { POST } from "./route";

const request = (body: unknown): NextRequest =>
  new NextRequest("http://localhost:3000/api/auth/password", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("API cambio de contraseña propia (CU-46)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockHash.mockResolvedValue("$2b$nuevo");
    mockUpdate.mockResolvedValue(undefined);
  });

  it("exige sesión de back-office (401 sin sesión)", async () => {
    setGuardState("unauthorized");
    const res = await POST(request({ currentPassword: "x", newPassword: "unaClaveLarga1" }));
    expect(res.status).toBe(401);
  });

  it("rechaza una contraseña nueva corta", async () => {
    const res = await POST(request({ currentPassword: "actual", newPassword: "corta" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("PASSWORD_INVALIDA");
  });

  it("rechaza si la contraseña actual no es correcta", async () => {
    mockFindUser.mockResolvedValue({ username: "admin@hotel.es", passwordHash: "$2b$actual" });
    mockCompare.mockResolvedValue(false);

    const res = await POST(request({ currentPassword: "mala", newPassword: "unaClaveLarga1" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("PASSWORD_ACTUAL_INCORRECTA");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("cambia la contraseña cuando la actual es correcta", async () => {
    mockFindUser.mockResolvedValue({ username: "admin@hotel.es", passwordHash: "$2b$actual" });
    mockCompare.mockResolvedValue(true);

    const res = await POST(request({ currentPassword: "actual", newPassword: "unaClaveLarga1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("PASSWORD_UPDATED");
    expect(mockUpdate).toHaveBeenCalledWith("admin@hotel.es", "$2b$nuevo");
  });
});
