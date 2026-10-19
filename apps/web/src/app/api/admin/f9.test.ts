import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockChain, mockTerminalRepo, mockOperationsRepo, mockAuthService, mockUsersRepo, mockSettings } = vi.hoisted(() => ({
  mockChain: {
    operationsAddress: vi.fn(() => "0x222d74f33b0d07687a769a44399e2272a4cb9ffe"),
    verifySuccessfulTx: vi.fn(async () => true),
    hasRoleOnChain: vi.fn(async () => true),
    backupForRoleOnChain: vi.fn(async () => "0x0000000000000000000000000000000000000000"),
  },
  mockTerminalRepo: { list: vi.fn(), create: vi.fn(), changePin: vi.fn(), setActive: vi.fn(), unlock: vi.fn() },
  mockOperationsRepo: {
    listWallets: vi.fn(),
    assignWallet: vi.fn(),
    revokeWallet: vi.fn(),
    findById: vi.fn(),
    createSignatureRequest: vi.fn(),
    markSigned: vi.fn(),
    listSignatures: vi.fn(),
  },
  mockAuthService: { verifyUserTotp: vi.fn(() => true) },
  mockUsersRepo: { findByUsername: vi.fn(async () => ({ username: "admin@hotel.es" })) },
  mockSettings: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));

vi.mock("@/lib/chain-admin", () => mockChain);
vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    TerminalOperatorsRepository: vi.fn(() => mockTerminalRepo),
    OperationsRepository: vi.fn(() => mockOperationsRepo),
    AuthService: vi.fn(() => mockAuthService),
    UsersRepository: vi.fn(() => mockUsersRepo),
    SettingsRepository: vi.fn(() => mockSettings),
  };
});

import { POST as operatorsPost, PATCH as operatorsPatch } from "./system/terminal-operators/route";
import { GET as flagsGet, PATCH as flagsPatch } from "./settings/flags/route";
import { POST as walletsPost, DELETE as walletsDelete } from "./system/wallets/route";

const req = (body: unknown, method = "POST"): NextRequest =>
  new NextRequest("http://localhost/api/admin/x", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const OPERATOR = {
  id: "op-1", username: "tecnico9", fullName: "Técnico Nueve", role: "MAINTENANCE_TECH",
  active: true, mustChangePin: true, failedAttempts: 0, lockedUntil: null, pinChangedAt: new Date(), createdAt: new Date(),
};

describe("F9 · administración y gobernanza", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockAuthService.verifyUserTotp.mockReturnValue(true);
    mockChain.verifySuccessfulTx.mockResolvedValue(true);
    mockChain.hasRoleOnChain.mockResolvedValue(true);
    mockSettings.get.mockResolvedValue(null);
  });

  it("alta de operario de terminal devuelve el PIN una vez y no el hash", async () => {
    mockTerminalRepo.create.mockResolvedValue(OPERATOR);
    const response = await operatorsPost(req({ username: "tecnico9", fullName: "Técnico Nueve", role: "MAINTENANCE_TECH" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pin).toMatch(/^\d{6}$/);
    expect(JSON.stringify(body)).not.toContain("pinHash");
    expect(mockTerminalRepo.create).toHaveBeenCalledWith(expect.objectContaining({ username: "tecnico9" }));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("rotación de PIN y baja lógica usan el repositorio correspondiente", async () => {
    mockTerminalRepo.changePin.mockResolvedValue({ ...OPERATOR, mustChangePin: true });
    const rotate = await operatorsPatch(req({ id: "op-1", action: "rotate-pin" }, "PATCH"));
    expect(rotate.status).toBe(200);
    expect((await rotate.json()).pin).toMatch(/^\d{6}$/);
    mockTerminalRepo.setActive.mockResolvedValue({ ...OPERATOR, active: false });
    const deactivate = await operatorsPatch(req({ id: "op-1", action: "deactivate" }, "PATCH"));
    expect(deactivate.status).toBe(200);
  });

  it("flags: GET devuelve valor efectivo y PATCH exige firma CONFIG al desactivar un flag obligatorio", async () => {
    const get = await flagsGet(new NextRequest("http://localhost/api/admin/settings/flags"));
    expect(get.status).toBe(200);
    const flags = (await get.json()).flags as Array<{ key: string; value: string; mandatory: boolean }>;
    expect(flags.find((flag) => flag.key === "ENABLE_OPERATIONAL_SIGNATURES")?.mandatory).toBe(true);

    const noSignature = await flagsPatch(
      req({ key: "ENABLE_OPERATIONAL_SIGNATURES", value: "false", totpCode: "123456" }, "PATCH"),
    );
    expect(noSignature.status).toBe(409);
    expect((await noSignature.json()).error).toBe("CONFIG_SIGNATURE_REQUIRED");
    expect(mockSettings.set).not.toHaveBeenCalled();
  });

  it("flags: TOTP inválido no cambia nada", async () => {
    mockAuthService.verifyUserTotp.mockReturnValue(false);
    const response = await flagsPatch(req({ key: "INSPECTION_REQUIRES_SIGNATURE", value: "true", totpCode: "000000" }, "PATCH"));
    expect(response.status).toBe(401);
    expect(mockSettings.set).not.toHaveBeenCalled();
  });

  it("wallets: no marca en BD si la tx no está minada o el rol sigue activo al revocar", async () => {
    mockChain.verifySuccessfulTx.mockResolvedValueOnce(false);
    const notMined = await walletsPost(req({ username: "jefe", role: "HEAD_MAINTENANCE", walletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", txHash: "0x" + "ab".repeat(32) }));
    expect(notMined.status).toBe(409);
    expect(mockOperationsRepo.assignWallet).not.toHaveBeenCalled();

    mockOperationsRepo.listWallets.mockResolvedValue([
      { username: "jefe", role: "HEAD_MAINTENANCE", walletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
    ]);
    const stillActive = await walletsDelete(
      req({ username: "jefe", txHash: "0x" + "cd".repeat(32) }, "DELETE"),
    );
    expect(stillActive.status).toBe(409);
    expect((await stillActive.json()).error).toBe("ROLE_STILL_ACTIVE");
    expect(mockOperationsRepo.revokeWallet).not.toHaveBeenCalled();
  });

  it("wallets: la baja solo revoca en BD tras comprobar que el rol ya no está on-chain", async () => {
    mockOperationsRepo.listWallets.mockResolvedValue([
      { username: "jefe", role: "HEAD_MAINTENANCE", walletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
    ]);
    mockChain.hasRoleOnChain.mockResolvedValue(false);
    mockOperationsRepo.revokeWallet.mockResolvedValue({ username: "jefe" });
    const response = await walletsDelete(req({ username: "jefe", txHash: "0x" + "ef".repeat(32) }, "DELETE"));
    expect(response.status).toBe(200);
    expect(mockChain.verifySuccessfulTx).toHaveBeenCalled();
    expect(mockOperationsRepo.revokeWallet).toHaveBeenCalledWith("jefe");
  });
});
