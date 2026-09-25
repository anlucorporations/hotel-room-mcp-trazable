import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import type * as SharedModule from "@hotel/shared";
import { signTestAccessToken } from "../../../../test/auth-tokens";
import { fakeRedisGet, resetFakeRedis } from "../../../../test/fake-redis";

// Las rutas importan `@/lib/guard`, que declara `server-only`; en el proceso de Vitest (Node) ese
// marcador no aplica, así que se sustituye por un módulo vacío.
vi.mock("server-only", () => ({}));

/**
 * Doble controlable de `@hotel/shared`.
 *
 * El módulo de la ruta construye su `AuthService` al importarse (antes de que el cuerpo del test
 * se ejecute), así que las instancias hay que capturarlas en la propia fábrica. `authService` y
 * `usersRepo` son los objetos EXACTOS que usan las rutas: se configuran aquí y cada prueba
 * reajusta el comportamiento con `mockResolvedValue`. `vi.hoisted` los eleva por encima de las
 * fábricas de `vi.mock`, que Vitest iza al principio del fichero.
 *
 * `verifyAccessToken` y `logout` NO se doblan con `mockResolvedValue`: delegan en una instancia
 * real para que la verificación del JWT y la escritura de la blocklist sean las de producción.
 * El cliente de Redis es el doble en memoria de `test/fake-redis.ts` (alias de `ioredis` en
 * `vitest.config.ts`), de modo que la prueba sigue siendo hermética: sin Redis ni PostgreSQL.
 */
const { authService, usersRepo } = vi.hoisted(() => ({
  authService: {
    loginWithPassword: vi.fn(),
    verifyChallengeToken: vi.fn(),
    verifyMfa: vi.fn(),
    verifyAccessToken: vi.fn(),
    rotateRefreshToken: vi.fn(),
    logout: vi.fn(),
    accessTokenTtlSeconds: vi.fn(),
    refreshTokenTtlSeconds: vi.fn(),
  },
  usersRepo: {
    countRemainingRecoveryCodes: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<typeof SharedModule>("@hotel/shared");
  const realInstance = new actual.AuthService();

  // `vi.clearAllMocks()` no borra las implementaciones, así que esta delegación sobrevive a cada
  // `beforeEach`: el guard real de `/api/auth/session` y la revocación real del logout se
  // ejercitan contra el Redis en memoria.
  authService.verifyAccessToken.mockImplementation((token: string) =>
    realInstance.verifyAccessToken(token),
  );
  authService.logout.mockImplementation((accessToken: string, refreshToken?: string) =>
    realInstance.logout(accessToken, refreshToken),
  );

  return {
    ...actual,
    AuthService: vi.fn(() => authService),
    UsersRepository: vi.fn(() => usersRepo),
  };
});

import { POST as login } from "./login/route";
import { POST as verifyMfa } from "./mfa/verify/route";
import { POST as refresh } from "./refresh/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function sessionRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/session", { headers });
}

describe("Auth Endpoints (D-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeRedis();
    // Comportamiento por defecto de cada escenario (cada prueba lo ajusta si lo necesita).
    authService.loginWithPassword.mockResolvedValue({
      challengeRequired: true,
      sessionToken: "mock_challenge_token_jwt",
      username: "admin@hotel.es",
      role: "DEFAULT_ADMIN_ROLE",
    });
    authService.verifyChallengeToken.mockResolvedValue({
      username: "admin@hotel.es",
      role: "DEFAULT_ADMIN_ROLE",
    });
    authService.verifyMfa.mockResolvedValue({
      accessToken: "mock_access_jwt",
      refreshToken: "mock_refresh_token_hex",
      role: "DEFAULT_ADMIN_ROLE",
      recoveryRemaining: 7,
    });
    authService.rotateRefreshToken.mockResolvedValue({
      accessToken: "new_access_jwt",
      refreshToken: "new_refresh_token_hex",
      role: "DEFAULT_ADMIN_ROLE",
    });
    // `logout` conserva la delegación en el servicio real; cada prueba la sustituye si necesita
    // no tocar la base (p. ej. al aportar un refresh token, cuya revocación usa PostgreSQL).
    authService.accessTokenTtlSeconds.mockReturnValue(900);
    authService.refreshTokenTtlSeconds.mockReturnValue(604800);
    usersRepo.countRemainingRecoveryCodes.mockResolvedValue(8);
  });

  describe("POST /api/auth/login (primer factor)", () => {
    it("devuelve el reto MFA ante credenciales válidas", async () => {
      const res = await login(
        jsonRequest("http://localhost:3000/api/auth/login", {
          username: "admin@hotel.es",
          password: "una-contraseña-correcta",
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.challengeRequired).toBe(true);
      expect(data.sessionToken).toBe("mock_challenge_token_jwt");
      expect(data.username).toBe("admin@hotel.es");
    });

    it("acepta `email` como alias histórico de `username`", async () => {
      const res = await login(
        jsonRequest("http://localhost:3000/api/auth/login", { email: "admin@hotel.es", password: "x" }),
      );
      expect(res.status).toBe(200);
      expect(authService.loginWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ username: "admin@hotel.es" }),
      );
    });

    it("responde 400 si faltan usuario o contraseña", async () => {
      const res = await login(jsonRequest("http://localhost:3000/api/auth/login", { username: "a" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_REQUEST");
    });

    it("responde 401 con credenciales inválidas e informa de los intentos restantes", async () => {
      authService.loginWithPassword.mockResolvedValue({
        challengeRequired: false,
        error: "INVALID_CREDENTIALS",
        remainingAttempts: 3,
      });

      const res = await login(
        jsonRequest("http://localhost:3000/api/auth/login", { username: "admin@hotel.es", password: "incorrecta" }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).remainingAttempts).toBe(3);
    });

    it("responde 429 al superar el rate limiting (5 intentos / 15 min)", async () => {
      authService.loginWithPassword.mockResolvedValue({
        challengeRequired: false,
        error: "RATE_LIMITED",
        retryAfterSeconds: 600,
      });

      const res = await login(
        jsonRequest("http://localhost:3000/api/auth/login", { username: "admin@hotel.es", password: "x" }),
      );
      expect(res.status).toBe(429);
      expect((await res.json()).retryAfterSeconds).toBe(600);
    });

    it("responde 423 cuando la cuenta está bloqueada temporalmente", async () => {
      authService.loginWithPassword.mockResolvedValue({
        challengeRequired: false,
        error: "ACCOUNT_LOCKED",
      });

      const res = await login(
        jsonRequest("http://localhost:3000/api/auth/login", { username: "admin@hotel.es", password: "x" }),
      );
      expect(res.status).toBe(423);
      expect((await res.json()).error).toBe("ACCOUNT_LOCKED");
    });
  });

  describe("POST /api/auth/mfa/verify (segundo factor)", () => {
    it("verifica el TOTP y devuelve el par de tokens, dejándolos en cookies HttpOnly", async () => {
      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", {
          sessionToken: "mock_challenge_token_jwt",
          totpCode: "123456",
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessToken).toBe("mock_access_jwt");
      expect(data.refreshToken).toBe("mock_refresh_token_hex");
      expect(data.roles).toContain("DEFAULT_ADMIN_ROLE");
      expect(data.recoveryRemaining).toBe(7);

      const cookies = res.cookies.getAll();
      expect(cookies.map((cookie) => cookie.name).sort()).toEqual([
        "hotel_access_token",
        "hotel_refresh_token",
      ]);
      expect(cookies.every((cookie) => cookie.httpOnly)).toBe(true);
    });

    it("acepta un código de rescate en lugar del TOTP", async () => {
      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", {
          sessionToken: "mock_challenge_token_jwt",
          recoveryCode: "ABCDEF1234",
        }),
      );

      expect(res.status).toBe(200);
      expect(authService.verifyMfa).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCode: "ABCDEF1234" }),
      );
    });

    it("responde 400 si faltan el reto o el código", async () => {
      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", { sessionToken: "mock_challenge_token_jwt" }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_REQUEST");
    });

    it("responde 401 si el reto MFA está manipulado o caducado", async () => {
      authService.verifyChallengeToken.mockRejectedValue(new Error("firma inválida"));

      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", {
          sessionToken: "reto-falso",
          totpCode: "123456",
        }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("UNAUTHORIZED");
    });

    it("responde 401 si el TOTP o el código de rescate no son válidos", async () => {
      authService.verifyMfa.mockResolvedValue({ error: "INVALID_MFA" });

      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", {
          sessionToken: "mock_challenge_token_jwt",
          totpCode: "000000",
        }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("UNAUTHORIZED");
    });

    it("responde 429 si se agotan los intentos de MFA", async () => {
      authService.verifyMfa.mockResolvedValue({ error: "RATE_LIMITED" });

      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", {
          sessionToken: "mock_challenge_token_jwt",
          totpCode: "000000",
        }),
      );
      expect(res.status).toBe(429);
    });

    it("responde 423 si la cuenta queda bloqueada por intentos fallidos", async () => {
      authService.verifyMfa.mockResolvedValue({ error: "ACCOUNT_LOCKED" });

      const res = await verifyMfa(
        jsonRequest("http://localhost:3000/api/auth/mfa/verify", {
          sessionToken: "mock_challenge_token_jwt",
          totpCode: "000000",
        }),
      );
      expect(res.status).toBe(423);
    });
  });

  describe("POST /api/auth/refresh (rotación de refresh token)", () => {
    it("rota el refresh y devuelve un par nuevo", async () => {
      const res = await refresh(
        jsonRequest("http://localhost:3000/api/auth/refresh", { refreshToken: "mock_refresh_token_hex" }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessToken).toBe("new_access_jwt");
      expect(data.refreshToken).toBe("new_refresh_token_hex");
      expect(data.roles).toContain("DEFAULT_ADMIN_ROLE");
    });

    it("acepta el refresh desde la cookie HttpOnly del navegador", async () => {
      const res = await refresh(
        jsonRequest("http://localhost:3000/api/auth/refresh", {}, { cookie: "hotel_refresh_token=cookie_refresh_hex" }),
      );
      expect(res.status).toBe(200);
      expect(authService.rotateRefreshToken).toHaveBeenCalledWith(
        "cookie_refresh_hex",
        expect.any(String),
        expect.any(String),
      );
    });

    it("responde 400 si no se aporta refresh token", async () => {
      const res = await refresh(jsonRequest("http://localhost:3000/api/auth/refresh", {}));
      expect(res.status).toBe(400);
    });

    it("responde 401 si el refresh ya se usó o fue revocado", async () => {
      authService.rotateRefreshToken.mockRejectedValue(new Error("Sesión inválida o expirada"));

      const res = await refresh(
        jsonRequest("http://localhost:3000/api/auth/refresh", { refreshToken: "refresh_ya_usado" }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("UNAUTHORIZED");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revoca la sesión (blocklist del jti), invalida el token y BORRA las cookies de sesión", async () => {
      const accessToken = await signTestAccessToken({ jti: "jti-de-prueba-logout" });

      // Antes de cerrar sesión el token sirve (guard real, Redis en memoria).
      expect((await session(sessionRequest({ authorization: `Bearer ${accessToken}` }))).status).toBe(200);

      const res = await logout(
        jsonRequest(
          "http://localhost:3000/api/auth/logout",
          {},
          { authorization: `Bearer ${accessToken}` },
        ),
      );

      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      // El access token y su jti llegan al servicio de revocación, que lo escribe en la blocklist
      // (la escritura es la real: el Redis es el doble en memoria).
      expect(authService.logout).toHaveBeenCalledWith(accessToken, undefined);
      expect(decodeJwt(accessToken).sub).toBe("admin@hotel.es");
      expect(fakeRedisGet("hotel:jwt:blocklist:jti-de-prueba-logout")).toBe("1");

      // Y el MISMO token deja de autorizar de inmediato: 401, no 200.
      expect((await session(sessionRequest({ authorization: `Bearer ${accessToken}` }))).status).toBe(401);

      // Las cookies de sesión se limpian (antes NUNCA se borraban).
      const cleared = res.cookies.getAll().filter((cookie) => cookie.value === "");
      expect(cleared.map((cookie) => cookie.name).sort()).toEqual([
        "hotel_access_token",
        "hotel_refresh_token",
      ]);
      expect(cleared.every((cookie) => cookie.maxAge === 0)).toBe(true);
    });

    it("entrega también el refresh token al servicio para que no pueda renovarse", async () => {
      const accessToken = await signTestAccessToken({ jti: "jti-con-refresh" });
      // Se dobla el servicio: la revocación del refresh usa PostgreSQL y esta suite no lo necesita.
      authService.logout.mockResolvedValueOnce(undefined);

      const res = await logout(
        jsonRequest(
          "http://localhost:3000/api/auth/logout",
          { refreshToken: "mock_refresh_token_hex" },
          { authorization: `Bearer ${accessToken}` },
        ),
      );

      expect(res.status).toBe(200);
      expect(authService.logout).toHaveBeenCalledWith(accessToken, "mock_refresh_token_hex");
    });

    it("responde 400 si no hay ningún token que revocar", async () => {
      const res = await logout(jsonRequest("http://localhost:3000/api/auth/logout", {}));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/auth/session", () => {
    it("devuelve el operador y su rol con un access token válido", async () => {
      const accessToken = await signTestAccessToken({
        username: "recepcion@hotel.es",
        role: "RECEPTION_ROLE",
      });

      const res = await session(sessionRequest({ authorization: `Bearer ${accessToken}` }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(true);
      expect(data.username).toBe("recepcion@hotel.es");
      expect(data.roles).toEqual(["RECEPTION_ROLE"]);
      expect(data.recoveryRemaining).toBe(8);
    });

    it("responde 401 sin token", async () => {
      const res = await session(sessionRequest());
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.authenticated).toBe(false);
    });

    it("responde 401 con un token manipulado", async () => {
      const res = await session(sessionRequest({ authorization: "Bearer token.falso.firmado" }));
      expect(res.status).toBe(401);
    });
  });
});
