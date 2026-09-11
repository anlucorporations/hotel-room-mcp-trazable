import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "./service";
import type { SessionsRepository } from "../db/repositories/sessions.repository";
import * as redisClient from "../redis/client";

// Mock de redis client
vi.mock("../redis/client", () => ({
  blockJWT: vi.fn().mockResolvedValue(undefined),
  isJWTBlocked: vi.fn().mockResolvedValue(false),
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false, remainingAttempts: 5, retryAfterSeconds: 0 }),
  recordFailedAttempt: vi.fn().mockResolvedValue(1),
  resetFailedAttempts: vi.fn().mockResolvedValue(undefined),
}));

describe("AuthService (US-05)", () => {
  let authService: AuthService;
  let mockSessionsRepo: any;

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
    };
    authService = new AuthService(mockSessionsRepo as unknown as SessionsRepository);
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
      15000,
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
});
