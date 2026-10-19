#!/usr/bin/env node
/**
 * audit-dialogs.mjs — Revisión en navegador de las **fichas flotantes** de las suites de personal
 * (pendiente declarado en `estado_proyecto.md` §12: «Revisión visual en navegador de las fichas
 * convertidas»).
 *
 * Por cada ficha declarada en `DIALOGS`:
 *   1. navega a su ruta y localiza el disparador (`data-testid`),
 *   2. lo pulsa y espera a `[role="dialog"]`,
 *   3. comprueba la estructura común (`ModalShell`): título (`h2`), cuerpo y **pie** con botones,
 *   4. comprueba el bloqueo del scroll de fondo y el cierre con `Escape`,
 *   5. toma una captura de pantalla del diálogo.
 *
 * Salida: `<out>/dialogs.json` + `<out>/dialog-<slug>.png`.
 *
 * Uso: node scripts/audit-dialogs.mjs --base <url> --out <dir> --label antes
 *      (credenciales por entorno: AUDIT_USER, AUDIT_PASSWORD, AUDIT_TOTP_SECRET)
 */
/* global document, getComputedStyle */  // se usan dentro de page.evaluate: se ejecutan en el navegador
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
const out = args.get("out") ?? `/tmp/dialogs-${Date.now()}`;
const label = args.get("label") ?? "run";
const user = args.get("user") ?? process.env.AUDIT_USER ?? "";
const password = args.get("password") ?? process.env.AUDIT_PASSWORD ?? "";
const totpSecret = args.get("totp-secret") ?? process.env.AUDIT_TOTP_SECRET ?? "";

/** Fichas por suite: [suite, ruta, disparador, descripción]. */
const DIALOGS = [
  ["recepción", "/recepcion", "res-open-create", "Alta de reserva"],
  ["recepción", "/recepcion", "checkin-open-qr", "Check-in por QR/JWS"],
  ["recepción", "/recepcion", "checkin-open-recovery", "Check-in por código de recuperación"],
  ["recepción", "/recepcion", "checkout-open-charge", "Alta de cargo"],
  ["recepción", "/recepcion", "checkout-open-confirm", "Confirmación de salida"],
  ["recepción", "/recepcion", "activities-open-book", "Inscripción en actividad"],
  ["ama de llaves", "/housekeeping", "housekeeping-open-shift", "Crear turno"],
  ["ama de llaves", "/housekeeping", "housekeeping-open-assign", "Reparto automático"],
  ["mantenimiento", "/mantenimiento", "report-open", "Reporte de avería"],
  ["admin", "/admin/seguridad", "open-change-password", "Cambio de contraseña"],
  ["admin", "/admin/caducadas", "expired-open-burn", "Quema de caducadas"],
  ["admin", "/admin/sistemas/ajustes", "settings-open", "Ajustes de plataforma"],
  ["admin", "/admin/sistemas/usuarios", "system-user-open", "Alta/rotación de credenciales"],
  ["admin", "/admin/mantenimiento/preventivo", "preventive-open-plan", "Nuevo plan preventivo"],
  ["admin", "/admin/actividades", "activities-admin-open-activity", "Nueva actividad"],
  ["admin", "/admin/actividades", "activities-admin-open-schedule", "Nuevo horario"],
  ["admin", "/admin/contenido", "content-open-image", "Subir imagen"],
  ["admin", "/admin/contenido", "content-open-offer", "Nuevo plan informativo"],
  ["admin", "/admin/roles", "roles-open", "Conceder/revocar rol"],
  ["admin", "/admin/roles", "roles-open-owner", "Iniciar transferencia de ownership"],
  ["admin", "/admin/mint", "mint-open", "Publicar noche"],
  ["admin", "/admin/habitacion/publicar", "board-linen-form", "Reposición de lencería"],
  ["admin", "/admin/habitacion/publicar", "board-publish-confirm", "Confirmación de publicación"],
  ["admin", "/admin/housekeeping/lenceria", "supply-open-restock-", "Reposición de artículo"],
  ["admin", "/admin/resenas", "review-open-", "Moderación de reseña"],
  ["admin", "/admin/habitacion", "room-new-open", "Alta de habitación"],
  ["admin", "/admin/habitacion", "room-edit-open", "Edición de habitación"],
  ["admin", "/admin/habitacion", "room-publish-open", "Publicación de habitación"],
];

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret, at = Date.now()) {
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

const slug = (value) => value.replace(/^\//, "").replace(/\//g, "-") || "home";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "es-ES",
});
const page = await context.newPage();
await mkdir(out, { recursive: true });

// --- login (owner) ---
const loginErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") loginErrors.push(m.text().slice(0, 300));
});
await page.goto(`${base}/admin/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector('[data-testid="admin-username"]', { timeout: 30_000 });
await page.fill('[data-testid="admin-username"]', user);
await page.fill('[data-testid="admin-password"]', password);
await page.click('[data-testid="admin-sign-in"]');
await page.waitForSelector('[data-testid="admin-totp-code"]', { timeout: 30_000 });
await page.fill('[data-testid="admin-totp-code"]', totp(totpSecret));
await page.click('[data-testid="admin-mfa-verify"]');
await page.waitForSelector('[data-testid="admin-username"]', { state: "detached", timeout: 30_000 });

const results = [];
for (const [suite, route, trigger, description] of DIALOGS) {
  const entry = { suite, route, trigger, description, opened: false };
  const errors = [];
  const onConsole = (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  };
  page.on("console", onConsole);
  try {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const selector = trigger.endsWith("-")
      ? `[data-testid^="${trigger}"]`
      : `[data-testid="${trigger}"]`;
    const button = page.locator(selector).first();
    if ((await button.count()) === 0) {
      entry.reason = "disparador ausente en la página";
      entry.visibleInPage = false;
    } else if (!(await button.isVisible().catch(() => false))) {
      entry.reason = "disparador oculto";
      entry.visibleInPage = false;
    } else {
      entry.visibleInPage = true;
      entry.disabled = await button.isDisabled().catch(() => false);
      await button.click({ timeout: 10_000 });
      const dialog = page.locator('[role="dialog"]').first();
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
      entry.opened = true;
      entry.dialog = await dialog.evaluate((node) => {
        const headings = [...node.querySelectorAll("h1,h2,h3")].map((h) => h.textContent?.trim());
        const buttons = [...node.querySelectorAll("button")].map((b) => ({
          text: b.textContent?.trim().slice(0, 40),
          disabled: b.disabled,
        }));
        const footer = node.querySelector("footer");
        const style = getComputedStyle(node);
        const body = document.body;
        return {
          title: headings[0] ?? null,
          headings,
          buttonCount: buttons.length,
          buttons: buttons.slice(0, 8),
          hasFooter: Boolean(footer),
          footerButtons: footer ? footer.querySelectorAll("button").length : 0,
          position: style.position,
          bodyOverflow: body.style.overflow || getComputedStyle(body).overflow,
          ariaModal: node.getAttribute("aria-modal"),
          labelledBy: node.getAttribute("aria-labelledby"),
          rect: node.getBoundingClientRect().toJSON(),
        };
      });
      const file = `dialog-${slug(route)}-${trigger}.png`;
      await page.screenshot({ path: join(out, file) });
      entry.screenshot = file;
      // Cierre con Escape (useModalDialog) y devolución del foco.
      await page.keyboard.press("Escape");
      const closed = await dialog
        .waitFor({ state: "hidden", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      entry.escapeCloses = closed;
      if (!closed) {
        await page.screenshot({ path: join(out, `dialog-${slug(route)}-${trigger}-escape-fail.png`) });
        await page.keyboard.press("Escape").catch(() => {});
      }
      // Libera cualquier estado colgado antes de la siguiente ficha.
      await page.keyboard.press("Escape").catch(() => {});
    }
  } catch (error) {
    entry.error = String(error.message).split("\n")[0].slice(0, 300);
    await page.screenshot({ path: join(out, `dialog-${slug(route)}-${trigger}-error.png`) }).catch(() => {});
  }
  entry.consoleErrors = errors;
  page.off("console", onConsole);
  results.push(entry);
  const state = entry.opened
    ? `OK · título="${entry.dialog?.title}" · pie=${entry.dialog?.footerButtons} botones · esc=${entry.escapeCloses}`
    : `SKIP · ${entry.reason ?? entry.error ?? "?"}`;
  console.log(`${entry.opened ? "✓" : "•"} ${suite} · ${description} (${trigger}) → ${state}`);
}

await browser.close();
await writeFile(
  join(out, "dialogs.json"),
  JSON.stringify({ base, label, at: new Date().toISOString(), loginErrors, results }, null, 2),
);
console.log(`\n${label}: ${results.filter((r) => r.opened).length}/${results.length} fichas abiertas · ${join(out, "dialogs.json")}`);
process.exit(0);
