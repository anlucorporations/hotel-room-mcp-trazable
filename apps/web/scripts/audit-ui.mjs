#!/usr/bin/env node
/**
 * ui-audit.mjs — Auditoría de UI en navegador real (Playwright/Chromium).
 *
 * Recorre una lista de rutas contra una URL base (local o desplegada), y por cada una:
 *   · captura los errores de consola (`console.error`, excepciones no controladas),
 *   · captura las peticiones fallidas (>=400) y las que abortan,
 *   · comprueba señales de salud del render (h1 presente, pantalla de error de Next,
 *     estado degradado, formulario de acceso),
 *   · toma una captura de pantalla completa.
 *
 * Salida: `<out>/report.json` + `<out>/<slug>.png`. El informe de estado consume ese JSON.
 *
 * Uso:
 *   node scripts/audit/ui-audit.mjs --base http://127.0.0.1:3100 --out /tmp/audit --label antes
 *   node scripts/audit/ui-audit.mjs --base https://... --out /tmp/audit --auth admin \
 *        --user admin@hotel.es --password '...' --totp-secret '...'
 *
 * Variables de entorno equivalentes: AUDIT_BASE, AUDIT_OUT, AUDIT_USER, AUDIT_PASSWORD,
 * AUDIT_TOTP_SECRET. Nunca se escribe ningún secreto en el informe.
 */
/* global document */  // se usa dentro de page.evaluate: se ejecuta en el navegador
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Argumentos y utilidades
// ---------------------------------------------------------------------------
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const [key, inline] = token.slice(2).split("=");
  args.set(key, inline ?? process.argv[++i] ?? "true");
}

const base = (args.get("base") ?? process.env.AUDIT_BASE ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Falta --base <url>");
  process.exit(2);
}
const out = args.get("out") ?? process.env.AUDIT_OUT ?? `/tmp/ui-audit-${Date.now()}`;
const label = args.get("label") ?? "run";
const authRole = args.get("auth") ?? "none";
const user = args.get("user") ?? process.env.AUDIT_USER ?? "";
const password = args.get("password") ?? process.env.AUDIT_PASSWORD ?? "";
const totpSecret = args.get("totp-secret") ?? process.env.AUDIT_TOTP_SECRET ?? "";
const reduceMotion = args.get("reduce-motion") !== "false";

const PUBLIC_ROUTES = [
  "/",
  "/empresa",
  "/instalaciones",
  "/servicios",
  "/habitaciones",
  "/experiencias",
  "/actividades",
  "/planes",
  "/resenas",
  "/contacto",
  "/catalogo",
  "/reservar",
  "/reventa",
  "/historico",
  "/mis-noches",
  "/mis-noches/mis-reventas",
  "/checkin",
  "/ayuda",
  "/ayuda/cliente",
  "/ayuda/comprador",
  "/ayuda/recepcion",
  "/asistente",
  "/privacidad",
  "/terminos",
];

const STAFF_ROUTES = [
  "/admin/dashboard",
  "/admin/mint",
  "/admin/habitacion",
  "/admin/habitacion/publicar",
  "/admin/actividades",
  "/admin/resenas",
  "/admin/contenido",
  "/admin/roles",
  "/admin/royalty",
  "/admin/fondos",
  "/admin/caducadas",
  "/admin/seguridad",
  "/admin/pausa",
  "/admin/sistemas",
  "/admin/sistemas/ajustes",
  "/admin/sistemas/contratos",
  "/admin/sistemas/finanzas",
  "/admin/sistemas/operaciones",
  "/admin/sistemas/usuarios",
  "/admin/housekeeping/lenceria",
  "/admin/mantenimiento/incidencias",
  "/admin/mantenimiento/preventivo",
  "/housekeeping",
  "/mantenimiento",
  "/recepcion",
  "/recepcion/reservas",
];

// ---------------------------------------------------------------------------
// TOTP (RFC 6238, SHA-1) — sin dependencias externas
// ---------------------------------------------------------------------------
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function totp(secret, at = Date.now()) {
  const clean = secret.replace(/[^A-Za-z2-7]/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const value = BASE32.indexOf(char);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(at / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", Buffer.from(bytes)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

// ---------------------------------------------------------------------------
// Recorrido
// ---------------------------------------------------------------------------
const IGNORABLE = [
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)$/,
  /favicon/i,
];

function slug(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
}

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reduceMotion ? "reduce" : "no-preference",
    locale: "es-ES",
  });
  const page = await context.newPage();

  const routes = ["/api/health", ...PUBLIC_ROUTES, ...(authRole === "none" ? [] : STAFF_ROUTES)];
  const results = [];

  if (authRole !== "none") {
    const login = await signIn(page, base);
    results.push({ kind: "login", ...login });
    if (!login.ok) {
      await browser.close();
      await writeFile(join(out, "report.json"), JSON.stringify({ base, label, results }, null, 2));
      console.error("Login fallido:", login.error);
      process.exit(1);
    }
  }

  for (const route of routes) {
    if (route === "/api/health") {
      const response = await page.request.get(`${base}${route}`);
      results.push({
        kind: "api",
        route,
        status: response.status(),
        body: (await response.text()).slice(0, 400),
      });
      continue;
    }

    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    const onConsole = (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const text = message.text();
      if (message.type() === "warning" && !/error|failed|violat/i.test(text)) return;
      if (IGNORABLE.some((re) => re.test(text))) return;
      consoleErrors.push(`[${message.type()}] ${text.slice(0, 500)}`);
    };
    const onPageError = (error) => pageErrors.push(String(error.message).slice(0, 500));
    const onFailed = (request) => {
      const failure = request.failure()?.errorText ?? "";
      if (/net::ERR_ABORTED/.test(failure)) return;
      failed.push(`${request.method()} ${request.url()} → ${failure}`);
    };
    const onResponse = (response) => {
      if (response.status() < 400) return;
      const url = response.url();
      if (/favicon/.test(url)) return;
      failed.push(`${response.status()} ${url}`);
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onFailed);
    page.on("response", onResponse);

    const started = Date.now();
    let status = 0;
    let navError = null;
    try {
      const response = await page.goto(`${base}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      status = response?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(700);
    } catch (error) {
      navError = String(error.message).slice(0, 300);
    }

    const h1 = await page.locator("h1").first().textContent().catch(() => null);
    const signals = await page
      .evaluate(() => {
        const text = document.body?.innerText ?? "";
        const testids = [...document.querySelectorAll("[data-testid]")]
          .map((el) => el.getAttribute("data-testid"))
          .slice(0, 200);
        return {
          bodyChars: text.length,
          hasNextError: /Application error|Internal Server Error|Unhandled Runtime Error/i.test(text),
          hasDegraded: testids.includes("degraded-state"),
          hasEmpty: testids.includes("empty-state"),
          hasAuthGate: Boolean(document.querySelector('[data-testid="admin-username"]')),
          dialogs: [...document.querySelectorAll('[role="dialog"]')].length,
          testids: testids.slice(0, 40),
        };
      })
      .catch(() => ({ bodyChars: -1 }));

    const file = `${String(results.length).padStart(2, "0")}-${slug(route)}.png`;
    await page.screenshot({ path: join(out, file), fullPage: true }).catch(() => {});

    results.push({
      kind: "page",
      route,
      status,
      ms: Date.now() - started,
      h1: (h1 ?? "").trim().slice(0, 120),
      screenshot: file,
      consoleErrors,
      pageErrors,
      failed: failed.slice(0, 25),
      navError,
      signals,
    });

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onFailed);
    page.off("response", onResponse);
  }

  await browser.close();
  await writeFile(
    join(out, "report.json"),
    JSON.stringify({ base, label, at: new Date().toISOString(), results }, null, 2),
  );

  const pages = results.filter((r) => r.kind === "page");
  const bad = pages.filter(
    (p) => p.status >= 400 || p.navError || p.pageErrors.length > 0 || p.consoleErrors.length > 0,
  );
  console.log(
    `${label}: ${pages.length} rutas · ${bad.length} con señal de error · informe en ${join(out, "report.json")}`,
  );
  for (const item of bad) {
    console.log(`  ✗ ${item.route} (${item.status}) ${item.pageErrors[0] ?? item.consoleErrors[0] ?? ""}`);
  }
}

async function signIn(page, base) {
  if (!user || !password || !totpSecret) {
    return { ok: false, error: "Faltan credenciales (--user/--password/--totp-secret)" };
  }
  try {
    await page.goto(`${base}/admin/dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector('[data-testid="admin-username"]', { timeout: 20_000 });
    await page.fill('[data-testid="admin-username"]', user);
    await page.fill('[data-testid="admin-password"]', password);
    await page.click('[data-testid="admin-sign-in"]');
    await page.waitForSelector('[data-testid="admin-totp-code"]', { timeout: 20_000 });
    await page.fill('[data-testid="admin-totp-code"]', totp(totpSecret));
    await page.click('[data-testid="admin-mfa-verify"]');
    await page.waitForSelector('[data-testid="admin-username"]', {
      state: "detached",
      timeout: 25_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const role = await page
      .request.get(`${base}/api/auth/session`)
      .then((r) => (r.ok() ? r.json() : null))
      .catch(() => null);
    return { ok: true, status: 200, role: role?.role ?? role?.session?.role ?? null, h1: await page.locator("h1").first().textContent().catch(() => null) };
  } catch (error) {
    return { ok: false, error: String(error.message).slice(0, 300) };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
