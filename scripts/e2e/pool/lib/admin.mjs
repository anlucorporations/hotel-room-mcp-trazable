import { WEB_URL } from "./secrets.mjs";
import { currentTotp } from "./totp.mjs";

function cookieFrom(res, name) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const [k, ...v] = pair.split("=");
    if (k.trim() === name) return v.join("=").trim();
  }
  return undefined;
}

function parseSetCookies(res) {
  const out = [];
  for (const c of res.headers.getSetCookie?.() ?? []) out.push(c.split(";")[0]);
  return out;
}

/** Login de operador (contraseña + TOTP) y devuelve la cookie de sesión. */
export async function adminLogin({ username = "admin@hotel.es", password = "CJiUrt0u35eJa_mlMeZrgSpv", secret } = {}) {
  const login = await fetch(WEB_URL + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok) throw new Error(`login ${login.status}: ${JSON.stringify(loginBody)}`);
  const sessionToken = loginBody.sessionToken;
  if (!sessionToken) throw new Error(`login sin sessionToken: ${JSON.stringify(loginBody)}`);
  const mfa = await fetch(WEB_URL + "/api/auth/mfa/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionToken, totpCode: currentTotp(secret) }),
  });
  const mfaBody = await mfa.json().catch(() => ({}));
  if (!mfa.ok) throw new Error(`mfa ${mfa.status}: ${JSON.stringify(mfaBody)}`);
  const cookies = parseSetCookies(mfa);
  if (cookies.length === 0) throw new Error("mfa sin cookies de sesión");
  return {
    cookieHeader: cookies.join("; "),
    cookies,
    sessionToken,
    body: mfaBody,
  };
}

export async function api(session, path, options = {}) {
  const res = await fetch(WEB_URL + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      cookie: session.cookieHeader,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ok: res.ok, json, text };
}
