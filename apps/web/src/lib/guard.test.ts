import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { AuthService } from "@hotel/shared";
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  authorize,
  readAccessToken,
  readRefreshToken,
  readRequestCookie,
  refreshTokenCookieOptions,
  requireRole,
} from "./guard";
import {
  failFakeRedisAsUnreachable,
  fakeRedisGet,
  fakeRedisTtl,
  resetFakeRedis,
} from "../../test/fake-redis";

// `@/lib/guard` declara `server-only`: la prueba lo sustituye por un módulo vacío porque se
// ejecuta en un proceso de Node de Vitest, no en el bundler de Next (que es quien aplica la
// restricción de importación desde componentes de cliente).
vi.mock("server-only", () => ({}));

/**
 * Esta suite NO mockea `@hotel/shared`: ejercita la `AuthService` y el guard reales.
 *
 * El paquete se consume ya empaquetado, así que sustituir sus exports (`isJWTBlocked`,
 * `blockJWT`) no afectaría a las llamadas internas del servicio y la prueba terminaría hablando
 * con el Redis real. En su lugar `vitest.config.ts` aliasa `ioredis` al doble en memoria de
 * `test/fake-redis.ts`: la lógica de blocklist que se ejecuta es la de producción y, a la vez, la
 * suite es hermética (ninguna conexión, ningún estado heredado entre ejecuciones).
 */
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const service = new AuthService();

async function token(overrides: {
  role?: string;
  jti?: string;
  seconds?: number;
  subject?: string;
} = {}): Promise<string> {
  return new SignJWT({
    sub: overrides.subject ?? "admin@hotel.es",
    role: overrides.role ?? "DEFAULT_ADMIN_ROLE",
    jti: overrides.jti ?? `jti-${Math.random().toString(36).slice(2)}`,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${overrides.seconds ?? 900}s`)
    .sign(SECRET);
}

function requestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/metrics", { headers });
}

describe("guard de sesión y rol (D-04)", () => {
  beforeEach(() => {
    resetFakeRedis();
  });

  describe("lectura del token", () => {
    it("prefiere la cabecera Authorization: Bearer", () => {
      expect(readAccessToken(requestWith({ authorization: "Bearer abc.def.ghi" }))).toBe("abc.def.ghi");
    });

    it("cae a la cookie HttpOnly cuando no hay cabecera", () => {
      expect(readAccessToken(requestWith({ cookie: `${ACCESS_TOKEN_COOKIE}=cookie.token.value` }))).toBe(
        "cookie.token.value",
      );
    });

    it("ignora esquemas de autorización distintos de Bearer", () => {
      expect(readAccessToken(requestWith({ authorization: "Basic dXNlcjpwYXNz" }))).toBeUndefined();
    });

    it("lee el refresh token del cuerpo antes que de la cookie", () => {
      const req = requestWith({ cookie: "hotel_refresh_token=from-cookie" });
      expect(readRefreshToken(req, { refreshToken: "from-body" })).toBe("from-body");
      expect(readRefreshToken(req, {})).toBe("from-cookie");
    });

    it("decodifica valores de cookie escapados y descarta los vacíos", () => {
      expect(readRequestCookie(requestWith({ cookie: "x=1; hotel_access_token=a%20b" }), ACCESS_TOKEN_COOKIE)).toBe("a b");
      expect(readRequestCookie(requestWith({ cookie: "hotel_access_token=" }), ACCESS_TOKEN_COOKIE)).toBeUndefined();
    });
  });

  describe("sesión válida", () => {
    it("acepta un token firmado y no revocado", async () => {
      const result = await authorize(requestWith({ authorization: `Bearer ${await token()}` }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.session.username).toBe("admin@hotel.es");
        expect(result.session.role).toBe("DEFAULT_ADMIN_ROLE");
      }
    });

    it("acepta cualquier rol de back-office cuando la ruta no exige uno concreto", async () => {
      const result = await authorize(
        requestWith({ authorization: `Bearer ${await token({ role: "RECEPTION_ROLE" })}` }),
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("401 — sin credencial válida", () => {
    it("rechaza la petición sin token", async () => {
      const result = await authorize(requestWith({}));
      expect(result).toMatchObject({ ok: false, reason: "unauthorized" });
    });

    it("rechaza un token con firma inválida (otro secreto)", async () => {
      const forged = await new SignJWT({ sub: "atacante", role: "DEFAULT_ADMIN_ROLE", jti: "x" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("900s")
        .sign(new TextEncoder().encode("otro-secreto-completamente-distinto-de-32+"));
      const result = await authorize(requestWith({ authorization: `Bearer ${forged}` }));
      expect(result).toMatchObject({ ok: false, reason: "unauthorized" });
    });

    it("rechaza un token caducado", async () => {
      const expired = await new SignJWT({ sub: "admin@hotel.es", role: "DEFAULT_ADMIN_ROLE", jti: "e" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(SECRET);
      const result = await authorize(requestWith({ authorization: `Bearer ${expired}` }));
      expect(result).toMatchObject({ ok: false, reason: "unauthorized" });
    });

    it("rechaza con 401 (no 403) un token revocado en la blocklist", async () => {
      const accessToken = await token({ jti: "jti-revocado" });
      // El camino real de revocación: `AuthService.logout` escribe el jti en Redis.
      await service.logout(accessToken);

      const result = await authorize(requestWith({ authorization: `Bearer ${accessToken}` }));
      expect(result).toMatchObject({ ok: false, reason: "unauthorized" });
    });

    it("devuelve 401 desde requireRole", async () => {
      const result = await requireRole(requestWith({}));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(401);
        expect((await result.response.json()).error).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("403 — sesión válida sin el rol exigido", () => {
    it("rechaza a un operador de recepción en una ruta de administración", async () => {
      const result = await authorize(
        requestWith({ authorization: `Bearer ${await token({ role: "RECEPTION_ROLE" })}` }),
        "DEFAULT_ADMIN_ROLE",
      );
      expect(result).toMatchObject({ ok: false, reason: "forbidden" });
    });

    it("permite al owner (DEFAULT_ADMIN_ROLE) entrar en una ruta de recepción (D-30)", async () => {
      const result = await authorize(
        requestWith({ authorization: `Bearer ${await token({ role: "DEFAULT_ADMIN_ROLE" })}` }),
        "RECEPTION_ROLE",
      );
      expect(result).toMatchObject({ ok: true });
    });

    it("trata un rol ajeno al back-office como 403, no como 401", async () => {
      const result = await authorize(requestWith({ authorization: `Bearer ${await token({ role: "MINTER_ROLE" })}` }));
      expect(result).toMatchObject({ ok: false, reason: "forbidden" });
    });

    it("devuelve 403 desde requireRole", async () => {
      const result = await requireRole(
        requestWith({ authorization: `Bearer ${await token({ role: "RECEPTION_ROLE" })}` }),
        "DEFAULT_ADMIN_ROLE",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
        expect((await result.response.json()).error).toBe("FORBIDDEN");
      }
    });
  });

  describe("500 — fallo en cerrado por configuración", () => {
    it("no autoriza si el secreto JWT no está configurado", async () => {
      const previous = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        const result = await authorize(requestWith({ authorization: `Bearer ${await token()}` }));
        expect(result).toMatchObject({ ok: false, reason: "misconfigured" });
      } finally {
        process.env.JWT_SECRET = previous;
      }
    });

    it("devuelve 500 (nunca 200) desde requireRole ante una mala configuración", async () => {
      const previous = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        const result = await requireRole(
          requestWith({ authorization: "Bearer cualquiera" }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.response.status).toBe(500);
          expect((await result.response.json()).error).toBe("SERVER_MISCONFIGURED");
        }
      } finally {
        process.env.JWT_SECRET = previous;
      }
    });

    it("devuelve 500 (no 401) cuando Redis no responde al consultar la blocklist", async () => {
      // ioredis rechaza el comando con `MaxRetriesPerRequestError`, cuyo mensaje no menciona
      // "redis" ni "connect": es el fallo exacto que antes se clasificaba como credencial inválida.
      failFakeRedisAsUnreachable();

      const result = await requireRole(
        requestWith({ authorization: `Bearer ${await token()}` }),
        "DEFAULT_ADMIN_ROLE",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(500);
        expect((await result.response.json()).error).toBe("SERVER_MISCONFIGURED");
      }
    });
  });

  describe("blocklist de la sesión (logout)", () => {
    it("un token revocado por logout deja de autorizar de inmediato", async () => {
      const accessToken = await token({ jti: "jti-logout" });
      expect((await authorize(requestWith({ authorization: `Bearer ${accessToken}` }))).ok).toBe(true);

      // `AuthService.logout` mete el jti en la blocklist con TTL = vida restante del token.
      await service.logout(accessToken);

      // El jti quedó escrito de verdad (no basta con que el guard diga que no autoriza).
      expect(fakeRedisGet("hotel:jwt:blocklist:jti-logout")).toBe("1");
      const ttl = fakeRedisTtl("hotel:jwt:blocklist:jti-logout");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);

      const after = await authorize(requestWith({ authorization: `Bearer ${accessToken}` }));
      expect(after).toMatchObject({ ok: false, reason: "unauthorized" });

      // Un token DISTINTO sigue siendo válido: la revocación es por jti, no global.
      const other = await token({ jti: "jti-otro" });
      expect((await authorize(requestWith({ authorization: `Bearer ${other}` }))).ok).toBe(true);
    });
  });

  describe("opciones de cookie", () => {
    it("son HttpOnly, SameSite=Lax y con path raíz", () => {
      for (const options of [accessTokenCookieOptions(900), refreshTokenCookieOptions(604800)]) {
        expect(options.httpOnly).toBe(true);
        expect(options.sameSite).toBe("lax");
        expect(options.path).toBe("/");
      }
    });
  });
});
