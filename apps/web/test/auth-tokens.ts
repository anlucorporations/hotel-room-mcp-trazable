import { SignJWT } from "jose";

/**
 * Utilidades de prueba para las rutas protegidas (D-04).
 *
 * Firma access tokens HS256 verificables con el `JWT_SECRET` de prueba que declara
 * `test/setup-env.ts`. Los tests NO replican literales de secreto de producción: los secretos
 * viven en un único sitio (`test/setup-env.ts`) y aquí solo se usan para construir tokens.
 */
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export interface TestTokenOptions {
  username?: string;
  role?: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE";
  jti?: string;
  expiresInSeconds?: number;
}

/** Firma un access token de prueba con el mismo formato que emite AuthService. */
export async function signTestAccessToken(options: TestTokenOptions = {}): Promise<string> {
  return new SignJWT({
    sub: options.username ?? "admin@hotel.es",
    role: options.role ?? "DEFAULT_ADMIN_ROLE",
    jti: options.jti ?? `test-jti-${Math.random().toString(36).slice(2)}`,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${options.expiresInSeconds ?? 900}s`)
    .sign(SECRET);
}

/** Encabezado `Authorization: Bearer` listo para `NextRequest`. */
export async function authHeader(options: TestTokenOptions = {}): Promise<{ authorization: string }> {
  return { authorization: `Bearer ${await signTestAccessToken(options)}` };
}

/** Encabezado `Cookie` con el access token (vía que usa el panel en el navegador). */
export async function authCookie(options: TestTokenOptions = {}): Promise<{ cookie: string }> {
  return { cookie: `hotel_access_token=${await signTestAccessToken(options)}` };
}
