import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockRevoke, mockProvision } = vi.hoisted(() => ({
  mockRepo: {
    listAll: vi.fn(),
    findByUsername: vi.fn(),
    setActive: vi.fn(),
  },
  mockRevoke: vi.fn(),
  mockProvision: vi.fn(),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    UsersRepository: vi.fn().mockImplementation(() => mockRepo),
    SessionsRepository: vi.fn().mockImplementation(() => ({ revokeAllUserSessions: mockRevoke })),
    AuthService: vi.fn().mockImplementation(() => ({ provisionUser: mockProvision })),
  };
});

import { GET, POST, PATCH } from "./users/route";

const request = (method: string, body?: unknown): NextRequest =>
  new NextRequest("http://localhost:3000/api/admin/system/users", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe("API Sistemas → Usuarios (CU-42)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockRepo.listAll.mockResolvedValue([]);
  });

  it("exige DEFAULT_ADMIN_ROLE y responde 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await GET(request("GET"));
    expect(res.status).toBe(401);

    resetGuardState();
    await GET(request("GET"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("responde 403 con una sesión que no es owner", async () => {
    setGuardState("forbidden");
    const res = await GET(request("GET"));
    expect(res.status).toBe(403);
  });

  it("el listado NO expone passwordHash ni totpSecretEnc", async () => {
    mockRepo.listAll.mockResolvedValue([
      {
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
        passwordHash: "$2b$secret",
        totpSecretEnc: "aes:secret",
        id: "u1",
      },
    ]);

    const res = await GET(request("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users).toHaveLength(1);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("totpSecretEnc");
    expect(serialized).not.toContain("$2b$secret");
  });

  it("rechaza un usuario que no es correo", async () => {
    const res = await POST(request("POST", { username: "recepcion", role: "RECEPTION_ROLE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("USUARIO_INVALIDO");
  });

  it("rechaza un rol no admitido", async () => {
    const res = await POST(request("POST", { username: "x@hotel.es", role: "MINTER_ROLE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("ROL_INVALIDO");
  });

  it("rechaza una contraseña corta", async () => {
    const res = await POST(request("POST", { username: "x@hotel.es", role: "RECEPTION_ROLE", password: "corta" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("PASSWORD_INVALIDA");
  });

  it("crea el operador y devuelve las credenciales una vez", async () => {
    mockProvision.mockResolvedValue({
      username: "x@hotel.es",
      role: "RECEPTION_ROLE",
      secret: "SECRET",
      uri: "otpauth://x",
      recoveryCodes: ["A", "B"],
    });

    const res = await POST(request("POST", { username: "x@hotel.es", role: "RECEPTION_ROLE" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("PROVISIONED");
    expect(typeof data.password).toBe("string");
    expect(data.password.length).toBeGreaterThanOrEqual(12);
    expect(data.uri).toBe("otpauth://x");
  });

  it("no permite que el owner se desactive a sí mismo", async () => {
    const res = await PATCH(request("PATCH", { username: "admin@hotel.es", active: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("AUTO_DESACTIVACION");
    expect(mockRepo.setActive).not.toHaveBeenCalled();
  });

  it("responde 404 al desactivar un usuario inexistente", async () => {
    mockRepo.findByUsername.mockResolvedValue(null);
    const res = await PATCH(request("PATCH", { username: "nadie@hotel.es", active: false }));
    expect(res.status).toBe(404);
  });

  it("desactiva un operador y revoca sus sesiones", async () => {
    mockRepo.findByUsername.mockResolvedValue({ username: "op@hotel.es", role: "RECEPTION_ROLE" });
    mockRepo.setActive.mockResolvedValue(undefined);
    mockRevoke.mockResolvedValue(undefined);

    const res = await PATCH(request("PATCH", { username: "op@hotel.es", active: false }));
    expect(res.status).toBe(200);
    expect(mockRepo.setActive).toHaveBeenCalledWith("op@hotel.es", false);
    expect(mockRevoke).toHaveBeenCalledWith("op@hotel.es");
  });
});
