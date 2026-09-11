import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as login } from "./login/route";
import { POST as verifyMfa } from "./mfa/verify/route";
import { POST as refresh } from "./refresh/route";
import { POST as logout } from "./logout/route";
import { NextRequest } from "next/server";


vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<any>("@hotel/shared");
  return {
    ...actual,
    AuthService: vi.fn().mockImplementation(() => ({
      checkRateLimit: vi.fn().mockResolvedValue({ limited: false, remainingAttempts: 5, retryAfterSeconds: 0 }),
      recordAuthFailure: vi.fn().mockResolvedValue(1),
      recordAuthSuccess: vi.fn().mockResolvedValue(undefined),
      comparePassword: vi.fn().mockResolvedValue(true),
      createChallengeToken: vi.fn().mockResolvedValue("mock_challenge_token_jwt"),
      verifyChallengeToken: vi.fn().mockResolvedValue({ username: "admin@hotel.es", role: "DEFAULT_ADMIN_ROLE" }),
      verifyTOTP: vi.fn().mockReturnValue(true),
      issueTokens: vi.fn().mockResolvedValue({
        accessToken: "mock_access_jwt",
        refreshToken: "mock_refresh_token_hex",
        jti: "mock-jti",
      }),
      rotateRefreshToken: vi.fn().mockResolvedValue({
        accessToken: "new_access_jwt",
        refreshToken: "new_refresh_token_hex",
        role: "DEFAULT_ADMIN_ROLE",
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    })),
    SessionsRepository: vi.fn().mockImplementation(() => ({
      getRemainingRecoveryCodesCount: vi.fn().mockResolvedValue(8),
      consumeRecoveryCode: vi.fn().mockResolvedValue(true),
      saveRecoveryCodes: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe("Auth Endpoints (US-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/login", () => {
    it("debe verificar credenciales y devolver challengeToken para reto MFA", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@hotel.es", password: "Hotel2026Admin!" }),
      });

      const res = await login(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.challengeRequired).toBe(true);
      expect(data.sessionToken).toBe("mock_challenge_token_jwt");
    });

    it("debe rechazar petición si faltan credenciales", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@hotel.es" }),
      });

      const res = await login(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/mfa/verify", () => {
    it("debe verificar TOTP y devolver par accessToken + refreshToken con RTR", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ sessionToken: "mock_challenge_token_jwt", totpCode: "123456" }),
      });

      const res = await verifyMfa(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessToken).toBe("mock_access_jwt");
      expect(data.refreshToken).toBe("mock_refresh_token_hex");
      expect(data.roles).toContain("DEFAULT_ADMIN_ROLE");
      expect(data.recoveryRemaining).toBe(8);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("debe rotar el refreshToken de forma atómica", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: "mock_refresh_token_hex" }),
      });

      const res = await refresh(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessToken).toBe("new_access_jwt");
      expect(data.refreshToken).toBe("new_refresh_token_hex");
      expect(data.roles).toContain("DEFAULT_ADMIN_ROLE");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("debe invalidar sesión y responder success", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { authorization: "Bearer mock_access_jwt" },
        body: JSON.stringify({ refreshToken: "mock_refresh_token_hex" }),
      });

      const res = await logout(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
