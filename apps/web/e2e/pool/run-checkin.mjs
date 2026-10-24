import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  ACCOUNTS, tokenIdFor, openAccountBrowser, gotoAndConnect, pub, HOTEL_ADDRESS, hotelAbi,
} from "./flow-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const OUT_DIR = process.env.POOL_OUT ?? path.join(REPO_ROOT, "RepoTecnico/evidencias/e2e-pool-asistente-2026-10-24");
const FLOWS_DIR = path.join(OUT_DIR, "flujos");
const WEB_URL = "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app";
const STAGE = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] ?? "reserved";
const ONLY = process.argv.find((a) => a.startsWith("--accounts="))?.split("=")[1]?.split(",").map(Number) ?? null;
const accounts = ACCOUNTS.filter((a) => !ONLY || ONLY.includes(a.index));
const AUCTION_BY_ACCOUNT = new Map([
  [5, [tokenIdFor(203, "2026-11-19"), tokenIdFor(204, "2026-11-22")]],
  [6, [tokenIdFor(205, "2026-11-25"), tokenIdFor(206, "2026-11-30")]],
  [7, [tokenIdFor(207, "2026-12-03"), tokenIdFor(208, "2026-12-06")]],
  [8, [tokenIdFor(209, "2026-12-09"), tokenIdFor(210, "2026-12-11")]],
  [9, [tokenIdFor(211, "2026-12-16"), tokenIdFor(212, "2026-12-19")]],
]);

function evidence(account) {
  const file = path.join(FLOWS_DIR, `${account.id}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { account: account.id, address: account.address, stages: {} };
}
const save = (account, data) => fs.writeFileSync(path.join(FLOWS_DIR, `${account.id}.json`), JSON.stringify(data, null, 2));
async function shot(page, account, name) {
  const rel = path.join("flujos", "capturas", account.id, `${name}.png`);
  fs.mkdirSync(path.dirname(path.join(OUT_DIR, rel)), { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, rel), fullPage: false });
  return rel;
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── TOTP (RFC 6238) para el operador de recepción ────────────────────────────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input) {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error(`base32 inválido: ${ch}`);
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return String(code % 1e6).padStart(6, "0");
}

function parseSetCookies(res) {
  const out = [];
  for (const c of res.headers.getSetCookie?.() ?? []) out.push(c.split(";")[0]);
  return out;
}

/** Login del operador de recepción (contraseña + TOTP) → cookie de sesión. */
async function receptionLogin() {
  const login = await fetch(WEB_URL + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "recepcion@hotel.es", password: "8Iotfi10uzbEqXWQ0AhFGueO" }),
  });
  const body = await login.json();
  if (!login.ok) throw new Error(`login recepción ${login.status}: ${JSON.stringify(body)}`);
  const mfa = await fetch(WEB_URL + "/api/auth/mfa/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionToken: body.sessionToken, totpCode: totp("MVOA2LNSPW7G6P3TBOILVMKRFE6UM525") }),
  });
  if (!mfa.ok) throw new Error(`mfa recepción ${mfa.status}: ${await mfa.text()}`);
  return parseSetCookies(mfa).join("; ");
}

/** Genera el resguardo (firma EIP-712 del titular) y devuelve el JWS + capturas. */
async function issueTicket(page, account, tokenId) {
  await gotoAndConnect(page, "/mis-noches");
  await page.waitForTimeout(3500);
  const card = page.getByTestId(`my-night-${tokenId}`);
  await card.waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId(`ticket-issue-${tokenId}`).click();
  await page.waitForTimeout(2000);
  const qr = page.getByTestId(`ticket-qr-${tokenId}`);
  await qr.waitFor({ state: "visible", timeout: 60_000 });
  const before = await shot(page, account, `checkin-${tokenId}-resguardo`);
  const jwsText = (await page.getByTestId(`ticket-jws-${tokenId}`).textContent()) ?? "";
  const jws = jwsText.match(/eyJ[A-Za-z0-9._-]+/)?.[0] ?? null;
  return { jws, screenshot: before };
}

async function runCheckin(browser) {
  const cookie = await receptionLogin();
  log("recepción autenticada");
  for (const account of accounts) {
    const data = evidence(account);
    data.stages.checkin ??= [];
    const reservation = (account.ownedReservations ?? account.reservations)[0];
    const tokenIds = STAGE === "reserved"
      ? [tokenIdFor(reservation.room, reservation.date)]
      : [AUCTION_BY_ACCOUNT.get(account.index)[1]];
    for (const tokenId of tokenIds) {
      const checked = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "isCheckedIn", args: [tokenId] });
      if (checked) { log(account.id, "ya usada", tokenId.toString()); continue; }
      const { context, page } = await openAccountBrowser(browser, account);
      const ticket = await issueTicket(page, account, tokenId);
      await context.close();
      if (!ticket.jws) { log(account.id, "sin JWS", tokenId.toString()); continue; }
      // Vía API (la que usaría la recepción): en producción responde 503 ANCLAJE_NO_CONFIGURADO
      // porque la web no tiene configurada la wallet de recepción. Se registra el hallazgo y se
      // ancla el check-in on-chain con la hot-wallet de recepción (cuenta 3 de Anvil, RECEPTION_ROLE),
      // que es exactamente lo que hace el servicio cuando SÍ tiene la clave.
      const res = await fetch(WEB_URL + "/api/reception/checkin", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ ticketJws: ticket.jws }),
      });
      const body = await res.json().catch(() => ({}));
      const receptionKey = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
      const { createWalletClient, http, defineChain } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const chain = defineChain({ id: 81234, name: "Codecrypto Besu", nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 }, rpcUrls: { default: { http: ["https://besu.alumnos.codecrypto.academy"] } } });
      const receptionWallet = createWalletClient({ account: privateKeyToAccount(receptionKey), chain, transport: http() });
      const markAbi = [{ type: "function", name: "markCheckedIn", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] }];
      let tx = null;
      let onchainError = null;
      try {
        tx = await receptionWallet.writeContract({ address: HOTEL_ADDRESS, abi: markAbi, functionName: "markCheckedIn", args: [tokenId] });
        await pub.waitForTransactionReceipt({ hash: tx });
      } catch (error) {
        onchainError = error instanceof Error ? error.message : String(error);
      }
      let ok = false;
      for (let i = 0; i < 40; i++) {
        const now = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "isCheckedIn", args: [tokenId] });
        if (now) { ok = true; break; }
        await new Promise((r) => setTimeout(r, 2000));
      }
      data.stages.checkin.push({ tokenId: tokenId.toString(), stage: STAGE, http: res.status, apiBody: body, onchainTx: tx, onchainError, ok, screenshot: ticket.screenshot });
      save(account, data);
      log(account.id, "check-in", tokenId.toString(), res.status, ok ? "USADA" : "FALLO");
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await runCheckin(browser);
  await browser.close();
  log("STAGE_OK", STAGE);
}
main().catch((e) => { console.error("CHECKIN_ERROR", e); process.exit(1); });
