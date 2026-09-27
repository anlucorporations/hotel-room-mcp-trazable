import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { generateSync } from "otplib";
import { AuthService } from "./service";
import type { SessionsRepository } from "../db/repositories/sessions.repository";
import type { UsersRepository } from "../db/repositories/users.repository";
import * as redisClient from "../redis/client";

// Mock de redis client
vi.mock("../redis/client", () => ({
  blockJWT: vi.fn().mockResolvedValue(undefined),
  isJWTBlocked: vi.fn().mockResolvedValue(false),
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false, remainingAttempts: 5, retryAfterSeconds: 0 }),
  recordFailedAttempt: vi.fn().mockResolvedValue(1),
  resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
}));

/** Dobles parciales de los repositorios: solo los métodos que ejercitan estas pruebas. */
type MockedSessionsRepo = SessionsRepository & {
  createSession: Mock;
  getSessionByHash: Mock;
  revokeSession: Mock;
  revokeSessionByHash: Mock;
  saveRecoveryCodes: Mock;
  getRemainingRecoveryCodesCount: Mock;
  consumeRecoveryCode: Mock;
};

type MockedUsersRepo = UsersRepository & {
  findByUsername: Mock;
  upsert: Mock;
  replaceRecoveryCodes: Mock;
  countRemainingRecoveryCodes: Mock;
  consumeRecoveryCode: Mock;
  registerFailedAttempt: Mock;
  resetFailedAttempts: Mock;
  updateTotpSecretEnc: Mock;
  isLocked: Mock;
};

describe("AuthService (US-05)", () => {
  let authService: AuthService;
  let mockSessionsRepo: MockedSessionsRepo;
  let mockUsersRepo: MockedUsersRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionsRepo = {
      createSession: vi.fn().mockResolvedValue("mock-session-id-123"),
      getSessionByHash: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeSessionByHash: vi.fn().mockResolvedValue(undefined),
      saveRecoveryCodes: vi.fn().mockResolvedValue(undefined),
      getRemainingRecoveryCodesCount: vi.fn().mockResolvedValue(8),
      consumeRecoveryCode: vi.fn().mockResolvedValue(true),
    } as MockedSessionsRepo;
    mockUsersRepo = {
      findByUsername: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      replaceRecoveryCodes: vi.fn().mockResolvedValue(undefined),
      countRemainingRecoveryCodes: vi.fn().mockResolvedValue(8),
      consumeRecoveryCode: vi.fn().mockResolvedValue(true),
      registerFailedAttempt: vi.fn().mockResolvedValue({ failedAttempts: 1, lockedUntil: null }),
      resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
      updateTotpSecretEnc: vi.fn().mockResolvedValue(undefined),
      isLocked: vi.fn().mockReturnValue(false),
    } as MockedUsersRepo;
    authService = new AuthService(mockSessionsRepo, mockUsersRepo);
  });

  describe("Password Hashing (bcrypt)", () => {
    it("debe generar un hash válido y verificar la contraseña correcta", async () => {
      const password = "SuperSecretPassword2026!";
      const hash = await authService.hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);

      const isValid = await authService.comparePassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await authService.comparePassword("WrongPassword", hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe("TOTP RFC 6238 (otplib)", () => {
    it("debe generar secreto y URI otpauth válidos", () => {
      const secret = authService.generateTOTPSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(15);

      const uri = authService.generateTOTPUri("admin@hotel.com", secret);
      expect(uri).toContain("otpauth://totp/HotelMarinaDelSol:");
      expect(uri).toContain("admin");
      expect(uri).toContain(`secret=${secret}`);

    });

    it("debe validar correctamente el token TOTP generado con el secreto", async () => {
      const { generateSync } = await import("otplib");
      const secret = authService.generateTOTPSecret();
      const code = generateSync({ secret });

      expect(authService.verifyTOTP(code, secret)).toBe(true);
      expect(authService.verifyTOTP("000000", secret)).toBe(false);
    });
  });

  describe("Recovery Codes", () => {
    it(
      "debe generar exactamente 8 códigos de rescate de 10 caracteres hex",
      async () => {
        const { plainCodes, hashedCodes } = authService.generateRecoveryCodes(8);
        expect(plainCodes).toHaveLength(8);
        plainCodes.forEach((code) => {
          expect(code).toMatch(/^[A-F0-9]{10}$/);
        });

        const resolvedHashes = await hashedCodes;
        expect(resolvedHashes).toHaveLength(8);
        for (let i = 0; i < 8; i++) {
          const match = await authService.comparePassword(plainCodes[i], resolvedHashes[i]);
          expect(match).toBe(true);
        }
      },
      // bcrypt es deliberadamente costoso: 8 hashes + 8 comparaciones. Bajo la ejecución de todo el
      // workspace en paralelo, 15 s quedaban al borde y el test se volvía intermitente (medido el
      // 27-09-2026: timeout en la pasada de turbo, verde en aislamiento). 30 s mantiene la afirmación
      // y absorbe la contención de CPU sin volverlo un test laxo.
      30000,
    );
  });


  describe("Challenge Token (MFA Reto)", () => {
    it("debe generar un challenge token verificable con expiración y datos de usuario", async () => {
      const challengeToken = await authService.createChallengeToken("carlos_admin", "DEFAULT_ADMIN_ROLE");
      expect(challengeToken).toBeDefined();

      const decoded = await authService.verifyChallengeToken(challengeToken);
      expect(decoded.username).toBe("carlos_admin");
      expect(decoded.role).toBe("DEFAULT_ADMIN_ROLE");
    });
  });

  describe("Tokens & Refresh Token Rotation (RTR)", () => {
    it("debe emitir par de tokens Access (15m) + Refresh (7d) y registrar sesión", async () => {
      const tokens = await authService.issueTokens("carlos_admin", "DEFAULT_ADMIN_ROLE");
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.jti).toBeDefined();
      expect(mockSessionsRepo.createSession).toHaveBeenCalledTimes(1);

      // Verificar Access Token emitido
      const payload = await authService.verifyAccessToken(tokens.accessToken);
      expect(payload.sub).toBe("carlos_admin");
      expect(payload.role).toBe("DEFAULT_ADMIN_ROLE");
      expect(payload.jti).toBe(tokens.jti);
    });

    it("debe rechazar token si está en la blocklist de Redis", async () => {
      const tokens = await authService.issueTokens("carlos_admin", "DEFAULT_ADMIN_ROLE");
      vi.mocked(redisClient.isJWTBlocked).mockResolvedValueOnce(true);

      await expect(authService.verifyAccessToken(tokens.accessToken)).rejects.toThrow(
        "Token revocado (blocklist)",
      );
    });

    it("debe rotar el Refresh Token revocando el anterior y emitiendo uno nuevo", async () => {
      mockSessionsRepo.getSessionByHash.mockResolvedValueOnce({
        id: "session-uuid-1",
        username: "carlos_admin",
        role: "DEFAULT_ADMIN_ROLE",
        refreshTokenHash: "old_hash",
        expiresAt: new Date(Date.now() + 100000),
      });
      // La rotación revalida que el operador siga activo y sin bloqueo (D-04).
      mockUsersRepo.findByUsername.mockResolvedValueOnce({
        username: "carlos_admin",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        lockedUntil: null,
      });

      const oldRefreshToken = "old_refresh_token_hex_value_1234567890";
      const newTokens = await authService.rotateRefreshToken(oldRefreshToken);

      expect(mockSessionsRepo.revokeSession).toHaveBeenCalledWith("session-uuid-1");
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.role).toBe("DEFAULT_ADMIN_ROLE");
    });

    it("debe rechazar rotación si la sesión no existe o está revocada", async () => {
      mockSessionsRepo.getSessionByHash.mockResolvedValueOnce(null);

      await expect(
        authService.rotateRefreshToken("invalid_or_expired_token"),
      ).rejects.toThrow("Sesión inválida o expirada");
    });
  });

  describe("Logout", () => {
    it("debe registrar JTI en blocklist y revocar sesión de base de datos", async () => {
      const tokens = await authService.issueTokens("carlos_admin", "DEFAULT_ADMIN_ROLE");
      await authService.logout(tokens.accessToken, tokens.refreshToken);

      expect(redisClient.blockJWT).toHaveBeenCalledTimes(1);
      expect(mockSessionsRepo.revokeSessionByHash).toHaveBeenCalledTimes(1);
    });

    it("propaga el fallo de Redis en vez de simular un logout correcto", async () => {
      const tokens = await authService.issueTokens("carlos_admin", "DEFAULT_ADMIN_ROLE");
      // Error real de ioredis cuando no alcanza el servidor.
      const redisFailure = new Error(
        'Reached the max retries per request limit (which is 3). Refer to "maxRetriesPerRequest" option for details.',
      );
      redisFailure.name = "MaxRetriesPerRequestError";
      vi.mocked(redisClient.blockJWT).mockRejectedValueOnce(redisFailure);

      await expect(authService.logout(tokens.accessToken, tokens.refreshToken)).rejects.toThrow(
        /max retries per request/i,
      );
      // La revocación del refresh se intenta igualmente: la sesión no debe poder renovarse.
      expect(mockSessionsRepo.revokeSessionByHash).toHaveBeenCalledTimes(1);
    });

    it("sigue ignorando un token malformado o ya expirado (no hay nada que bloquear)", async () => {
      await expect(authService.logout("no-es-un-jwt", "refresh-vigente")).resolves.toBeUndefined();
      expect(redisClient.blockJWT).not.toHaveBeenCalled();
      expect(mockSessionsRepo.revokeSessionByHash).toHaveBeenCalledTimes(1);
    });
  });

  describe("Rate Limiting (ID_V-10)", () => {
    it("debe delegar en funciones de Redis client", async () => {
      await authService.checkRateLimit("admin_user");
      expect(redisClient.checkRateLimit).toHaveBeenCalledWith("admin_user", 5, 900);

      await authService.recordAuthFailure("admin_user");
      expect(redisClient.recordFailedAttempt).toHaveBeenCalledWith("admin_user", 900);

      await authService.recordAuthSuccess("admin_user");
      expect(redisClient.resetFailedAttempts).toHaveBeenCalledWith("admin_user");
    });
  });

  describe("Aprovisionamiento y semilla TOTP cifrada (D-04)", () => {
    // `provisionUser` calcula 9 hashes bcrypt (contraseña + 8 códigos): ~1,4 s en solitario y por
    // encima del límite por defecto de 5 s cuando `turbo run test` ejecuta los paquetes en
    // paralelo. Mismo timeout explícito que usa la prueba de códigos de rescate.
    it(
      "persiste la semilla CIFRADA (nunca en claro) y devuelve otpauth + códigos de rescate",
      async () => {
        const provisioned = await authService.provisionUser({
          username: "admin@hotel.es",
          password: "una-contraseña-larga-2026",
          role: "DEFAULT_ADMIN_ROLE",
          recoveryCodeCount: 8,
        });

        expect(provisioned.uri).toContain("otpauth://totp/");
        expect(provisioned.uri).toContain(`secret=${provisioned.secret}`);
        expect(provisioned.recoveryCodes).toHaveLength(8);

        const persisted = mockUsersRepo.upsert.mock.calls[0]![0];
        // La semilla persistida es un criptograma iv:tag:ciphertext, no la semilla en claro.
        expect(persisted.totpSecretEnc).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
        expect(persisted.totpSecretEnc).not.toContain(provisioned.secret);
        expect(persisted.passwordHash).not.toBe("una-contraseña-larga-2026");

        // Los hashes bcrypt de los códigos de rescate sí sustituyen a los anteriores.
        expect(mockUsersRepo.replaceRecoveryCodes).toHaveBeenCalledWith(
          "admin@hotel.es",
          expect.any(Array),
        );
      },
      15000,
    );

    it(
      "la semilla aprovisionada se puede verificar después de descifrarla",
      async () => {
        const provisioned = await authService.provisionUser({
          username: "admin@hotel.es",
          password: "una-contraseña-larga-2026",
          role: "DEFAULT_ADMIN_ROLE",
        });

        const user = { totpSecretEnc: mockUsersRepo.upsert.mock.calls[0]![0].totpSecretEnc };
        const code = generateSync({ secret: provisioned.secret });
        expect(authService.verifyUserTotp(user, code)).toBe(true);
        expect(authService.verifyUserTotp(user, "000000")).toBe(false);
      },
      15000,
    );

    it("no verifica si el criptograma está corrupto (devuelve false, sin lanzar)", () => {
      expect(authService.verifyUserTotp({ totpSecretEnc: "no-es-un-criptograma" }, "123456")).toBe(false);
    });
  });

  describe("Login con contraseña + TOTP (D-04)", () => {
    async function userWithPassword(password: string, overrides: Record<string, unknown> = {}) {
      return {
        id: "user-1",
        username: "admin@hotel.es",
        passwordHash: await authService.hashPassword(password),
        totpSecretEnc: authService.encryptTotpSecret(authService.generateTOTPSecret()),
        role: "DEFAULT_ADMIN_ROLE" as const,
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it("devuelve reto MFA con la contraseña correcta y NO emite tokens de sesión", async () => {
      const user = await userWithPassword("contraseña-correcta-2026");
      mockUsersRepo.findByUsername.mockResolvedValueOnce(user);

      const result = await authService.loginWithPassword({
        username: "admin@hotel.es",
        password: "contraseña-correcta-2026",
      });

      expect(result.challengeRequired).toBe(true);
      expect(result.sessionToken).toBeDefined();
      expect(result.role).toBe("DEFAULT_ADMIN_ROLE");
      expect((result as { accessToken?: string }).accessToken).toBeUndefined();
      expect(mockSessionsRepo.createSession).not.toHaveBeenCalled();
    });

    it("rechaza credenciales inválidas y registra el intento fallido", async () => {
      const user = await userWithPassword("contraseña-correcta-2026");
      mockUsersRepo.findByUsername.mockResolvedValueOnce(user);

      const result = await authService.loginWithPassword({
        username: "admin@hotel.es",
        password: "incorrecta",
      });

      expect(result.error).toBe("INVALID_CREDENTIALS");
      expect(mockUsersRepo.registerFailedAttempt).toHaveBeenCalledWith("admin@hotel.es");
      expect(redisClient.recordFailedAttempt).toHaveBeenCalled();
    });

    it("no distingue un usuario inexistente de una contraseña incorrecta", async () => {
      mockUsersRepo.findByUsername.mockResolvedValueOnce(null);

      const result = await authService.loginWithPassword({
        username: "no-existe@hotel.es",
        password: "lo-que-sea",
      });

      expect(result.error).toBe("INVALID_CREDENTIALS");
      expect(result.challengeRequired).toBe(false);
    });

    it("rechaza a un operador desactivado", async () => {
      const user = await userWithPassword("contraseña-correcta-2026", { active: false });
      mockUsersRepo.findByUsername.mockResolvedValueOnce(user);

      const result = await authService.loginWithPassword({
        username: "admin@hotel.es",
        password: "contraseña-correcta-2026",
      });

      expect(result.error).toBe("INVALID_CREDENTIALS");
    });

    it("responde ACCOUNT_LOCKED mientras el bloqueo temporal sigue vigente", async () => {
      const user = await userWithPassword("contraseña-correcta-2026");
      mockUsersRepo.findByUsername.mockResolvedValueOnce(user);
      mockUsersRepo.isLocked.mockReturnValueOnce(true);

      const result = await authService.loginWithPassword({
        username: "admin@hotel.es",
        password: "contraseña-correcta-2026",
      });

      expect(result.error).toBe("ACCOUNT_LOCKED");
    });

    it("corta antes de leer la base si el rate limiter está activo (5 / 15 min)", async () => {
      vi.mocked(redisClient.checkRateLimit).mockResolvedValueOnce({
        limited: true,
        remainingAttempts: 0,
        retryAfterSeconds: 420,
      });

      const result = await authService.loginWithPassword({
        username: "admin@hotel.es",
        password: "x",
      });

      expect(result.error).toBe("RATE_LIMITED");
      expect(result.retryAfterSeconds).toBe(420);
      expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled();
    });

    it("bloquea la cuenta al alcanzar el máximo de intentos fallidos", async () => {
      const user = await userWithPassword("contraseña-correcta-2026");
      mockUsersRepo.findByUsername.mockResolvedValueOnce(user);
      mockUsersRepo.registerFailedAttempt.mockResolvedValueOnce({
        failedAttempts: 0,
        lockedUntil: new Date(Date.now() + 900_000),
      });
      mockUsersRepo.isLocked.mockReturnValueOnce(true);

      const result = await authService.loginWithPassword({
        username: "admin@hotel.es",
        password: "incorrecta",
      });

      expect(result.error).toBe("ACCOUNT_LOCKED");
    });
  });

  describe("Segundo factor (TOTP y código de rescate)", () => {
    it("emite tokens con un TOTP válido y reinicia los contadores", async () => {
      const secret = authService.generateTOTPSecret();
      mockUsersRepo.findByUsername.mockResolvedValueOnce({
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        lockedUntil: null,
        totpSecretEnc: authService.encryptTotpSecret(secret),
      });

      const result = await authService.verifyMfa({
        username: "admin@hotel.es",
        totpCode: generateSync({ secret }),
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.role).toBe("DEFAULT_ADMIN_ROLE");
      expect(result.recoveryRemaining).toBe(8);
      expect(mockUsersRepo.resetFailedAttempts).toHaveBeenCalledWith("admin@hotel.es");
    });

    it("rechaza un TOTP inválido y consume un intento", async () => {
      const secret = authService.generateTOTPSecret();
      mockUsersRepo.findByUsername.mockResolvedValueOnce({
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        lockedUntil: null,
        totpSecretEnc: authService.encryptTotpSecret(secret),
      });

      const result = await authService.verifyMfa({ username: "admin@hotel.es", totpCode: "000000" });

      expect(result.error).toBe("INVALID_MFA");
      expect(result.accessToken).toBeUndefined();
      expect(mockUsersRepo.registerFailedAttempt).toHaveBeenCalledWith("admin@hotel.es");
      expect(mockSessionsRepo.createSession).not.toHaveBeenCalled();
    });

    it("acepta un código de rescate y lo consume", async () => {
      mockUsersRepo.findByUsername.mockResolvedValueOnce({
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        lockedUntil: null,
        totpSecretEnc: authService.encryptTotpSecret(authService.generateTOTPSecret()),
      });
      mockUsersRepo.consumeRecoveryCode.mockResolvedValueOnce(true);

      const result = await authService.verifyMfa({
        username: "admin@hotel.es",
        recoveryCode: "ABCDEF1234",
      });

      expect(result.accessToken).toBeDefined();
      expect(mockUsersRepo.consumeRecoveryCode).toHaveBeenCalledWith(
        "admin@hotel.es",
        "ABCDEF1234",
        expect.any(Function),
      );
    });

    it("rechaza un código de rescate ya usado", async () => {
      mockUsersRepo.findByUsername.mockResolvedValueOnce({
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        lockedUntil: null,
        totpSecretEnc: authService.encryptTotpSecret(authService.generateTOTPSecret()),
      });
      mockUsersRepo.consumeRecoveryCode.mockResolvedValueOnce(false);

      const result = await authService.verifyMfa({
        username: "admin@hotel.es",
        recoveryCode: "YA-USADO-01",
      });

      expect(result.error).toBe("INVALID_MFA");
    });
  });

  describe("Rotación y revocación de sesión (D-04)", () => {
    it("un refresh ya usado no vuelve a servir", async () => {
      // Repositorio con ESTADO: la rotación revoca la sesión y el mismo refresh deja de encontrarse.
      const sessions = new Map<string, { id: string; username: string; role: "DEFAULT_ADMIN_ROLE" }>();
      sessions.set(authService.hashRefreshToken("refresh-de-un-solo-uso"), {
        id: "session-1",
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
      });
      mockSessionsRepo.getSessionByHash.mockImplementation(async (hash: string) => sessions.get(hash) ?? null);
      mockSessionsRepo.revokeSession.mockImplementation(async (id: string) => {
        for (const [hash, session] of sessions) {
          if (session.id === id) sessions.delete(hash);
        }
      });
      mockUsersRepo.findByUsername.mockResolvedValue({
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
        active: true,
        lockedUntil: null,
      });

      const first = await authService.rotateRefreshToken("refresh-de-un-solo-uso");
      expect(first.accessToken).toBeDefined();
      expect(mockSessionsRepo.revokeSession).toHaveBeenCalledWith("session-1");

      await expect(authService.rotateRefreshToken("refresh-de-un-solo-uso")).rejects.toThrow(
        "Sesión inválida o expirada",
      );
    });

    it("rechaza la rotación si la sesión no existe", async () => {
      mockSessionsRepo.getSessionByHash.mockResolvedValueOnce(null);
      await expect(authService.rotateRefreshToken("refresh-inexistente")).rejects.toThrow(
        "Sesión inválida o expirada",
      );
    });

    it("no renueva si el operador está desactivado o bloqueado", async () => {
      mockSessionsRepo.getSessionByHash.mockResolvedValueOnce({
        id: "session-1",
        username: "admin@hotel.es",
        role: "DEFAULT_ADMIN_ROLE",
      });
      mockUsersRepo.findByUsername.mockResolvedValueOnce({
        username: "admin@hotel.es",
        active: false,
        lockedUntil: null,
      });

      await expect(authService.rotateRefreshToken("refresh-vigente")).rejects.toThrow(
        "Operador inactivo o bloqueado",
      );
    });

    it("logout mete el jti en la blocklist con la vida restante del token", async () => {
      const tokens = await authService.issueTokens("admin@hotel.es", "DEFAULT_ADMIN_ROLE");

      await authService.logout(tokens.accessToken, tokens.refreshToken);

      expect(redisClient.blockJWT).toHaveBeenCalledWith(tokens.jti, expect.any(Number));
      const ttl = vi.mocked(redisClient.blockJWT).mock.calls[0][1];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
      expect(mockSessionsRepo.revokeSessionByHash).toHaveBeenCalledTimes(1);
    });

    it("el hash del refresh token nunca es el token en claro", () => {
      const hash = authService.hashRefreshToken("refresh-token-en-claro");
      expect(hash).toHaveLength(64);
      expect(hash).not.toContain("refresh-token-en-claro");
    });
  });
});
