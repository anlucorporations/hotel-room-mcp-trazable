import { vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Mock configurable de `@/lib/guard` para las pruebas de rutas.
 *
 * Las pruebas de endpoint comprueban la lógica de negocio y el código de estado propio; la
 * verificación real del JWT y de la blocklist se cubre en `src/lib/guard.test.ts`. Aquí se
 * sustituye el guard por un cooperador controlable para poder provocar 401 y 403 sin depender de
 * Redis ni de firmar tokens en cada fichero.
 *
 * Uso:
 * ```ts
 * import { guardMock, setGuardState, guardSession } from "../../test/guard-mock";
 * vi.mock("@/lib/guard", () => guardMock);
 * ```
 */
type GuardState = "ok" | "unauthorized" | "forbidden";

const state: { value: GuardState; requiredRole: string | readonly string[] | undefined } = {
  value: "ok",
  requiredRole: undefined,
};

/** Sesión que devuelve el guard cuando el estado es `ok`. */
export const guardSession = {
  username: "admin@hotel.es",
  role: "DEFAULT_ADMIN_ROLE" as const,
  jti: "test-jti",
};

/** Cambia el resultado del guard para la siguiente llamada. */
export function setGuardState(value: GuardState): void {
  state.value = value;
}

/** Rol (o roles alternativos) exigido por la última llamada a `requireRole`. */
export function lastRequiredRole(): string | readonly string[] | undefined {
  return state.requiredRole;
}

/** Restaura el estado por defecto (sesión de administrador válida). */
export function resetGuardState(): void {
  state.value = "ok";
  state.requiredRole = undefined;
}

function failureResponse() {
  if (state.value === "unauthorized") {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Falta el token de acceso" }, { status: 401 });
  }
  return NextResponse.json({ error: "FORBIDDEN", message: "Rol insuficiente" }, { status: 403 });
}

export const guardMock = {
  ACCESS_TOKEN_COOKIE: "hotel_access_token",
  REFRESH_TOKEN_COOKIE: "hotel_refresh_token",
  authorize: vi.fn(async (_request: Request, requiredRole?: string | readonly string[]) => {
    state.requiredRole = requiredRole;
    if (state.value !== "ok") return { ok: false, reason: state.value, message: "denegado" };
    return { ok: true, session: guardSession };
  }),
  requireRole: vi.fn(async (_request: Request, requiredRole?: string | readonly string[]) => {
    state.requiredRole = requiredRole;
    if (state.value !== "ok") return { ok: false, response: failureResponse() };
    return { ok: true, session: guardSession };
  }),
  readAccessToken: vi.fn(() => "test-access-token"),
  readRefreshToken: vi.fn(() => "test-refresh-token"),
  readRequestCookie: vi.fn(() => undefined),
  accessTokenCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/", maxAge: 900 })),
  refreshTokenCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/", maxAge: 604800 })),
};
