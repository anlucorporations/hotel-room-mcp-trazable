import { generateSync } from "otplib";

/**
 * Comprobacion de que el acceso al back-office (o a recepcion) funciona de verdad contra el servidor
 * desplegado: login (contraseña) -> reto MFA -> verificacion TOTP -> `/api/admin/metrics` con el token.
 *
 * Uso:
 *   node --env-file=../../.env --import tsx scripts/check-admin-login.ts <usuario> <contraseña> <semillaTOTP> [url]
 *
 * La contraseña y la semilla se pasan por argumento para no dejarlas escritas en ficheros.
 */
const [username, password, seed, base = "http://127.0.0.1:3000"] = process.argv.slice(2);
if (!username || !password || !seed) {
  console.error("faltan argumentos: <usuario> <contraseña> <semillaTOTP> [url]");
  process.exit(1);
}

const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

const login = await post("/api/auth/login", { username, password });
console.log(`login (${username}) ->`, login.status, JSON.stringify(login.body).slice(0, 120));
if (login.status !== 200) process.exit(1);

// El endpoint devuelve `sessionToken` (reto MFA) y exige ese nombre en el cuerpo de la verificación.
const challenge = (login.body.sessionToken ?? login.body.challengeToken) as string | undefined;
if (!challenge) {
  console.error("la respuesta no trae reto MFA");
  process.exit(1);
}

const code = generateSync({ secret: seed });
console.log("codigo TOTP generado:", code);

const mfa = await post("/api/auth/mfa/verify", { sessionToken: challenge, totpCode: code });
const token = mfa.body.accessToken as string | undefined;
console.log("mfa/verify ->", mfa.status, token ? "accessToken recibido" : JSON.stringify(mfa.body).slice(0, 120));
if (mfa.status !== 200 || !token) process.exit(1);

const metrics = await fetch(`${base}/api/admin/metrics`, {
  headers: { authorization: `Bearer ${token}` },
});
console.log("GET /api/admin/metrics ->", metrics.status);
console.log("rol:", JSON.stringify(mfa.body.role ?? mfa.body.roles ?? "(no declarado)"));

// Y sin token, la misma ruta debe rechazar (defensa en profundidad).
const unauth = await fetch(`${base}/api/admin/metrics`);
console.log("GET /api/admin/metrics SIN token ->", unauth.status);
