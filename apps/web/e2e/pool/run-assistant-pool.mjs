import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { installNavegadorWallet } from "./navegador-wallet.mjs";
import { ACCOUNTS, questionsFor } from "./pool-spec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const OUT_DIR = process.env.POOL_OUT ?? path.join(REPO_ROOT, "RepoTecnico/evidencias/e2e-pool-asistente-2026-10-24");
const WEB_URL = process.env.WEB_URL ?? "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app";
const PACING_MS = Number(process.env.POOL_PACING_MS ?? 7000);
const MAX_WAIT_MS = 120_000;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const onlyIndexes = args.get("accounts")
  ? String(args.get("accounts")).split(",").map(Number)
  : null;
const kinds = (args.get("kinds") ?? "support,wrong").split(",");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDirs(account) {
  const dir = path.join(OUT_DIR, "capturas", account.id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveTranscript(account, transcript) {
  const dir = path.join(OUT_DIR, "transcripciones");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${account.id}.json`), JSON.stringify(transcript, null, 2));
}

/** Abre el panel del asistente si está cerrado. */
async function ensurePanel(page) {
  const panel = page.getByTestId("assistant-panel");
  if ((await panel.count()) > 0 && (await panel.isVisible().catch(() => false))) return panel;
  const launcher = page.getByTestId("assistant-launcher");
  if ((await launcher.count()) > 0) {
    await launcher.click();
  } else {
    await page.getByTestId("assistant-header-trigger").click();
  }
  await panel.waitFor({ state: "visible", timeout: 15_000 });
  return panel;
}

/** Hace una pregunta y devuelve la respuesta JSON del backend + el texto mostrado. */
async function ask(page, question) {
  await ensurePanel(page);
  const input = page.getByTestId("assistant-input");
  await input.fill(question);
  const before = await page.getByTestId("msg-assistant").count();
  const responsePromise = page
    .waitForResponse((res) => res.url().includes("/api/assistant"), { timeout: MAX_WAIT_MS })
    .catch(() => null);
  await page.getByTestId("assistant-send").click();
  const response = await responsePromise;

  let body = null;
  let status = null;
  if (response) {
    status = response.status();
    try { body = await response.json(); } catch { body = null; }
    if (status === 429) {
      const retry = Number(response.headers()["retry-after"] ?? 60);
      return { status, body, rateLimited: true, retryAfter: retry };
    }
  }

  // Espera a que el indicador de carga desaparezca y aparezca el mensaje del asistente.
  const deadline = Date.now() + MAX_WAIT_MS;
  let replyText = "";
  while (Date.now() < deadline) {
    const loading = await page.getByTestId("assistant-loading").count();
    const msgs = await page.getByTestId("msg-assistant").count();
    if (!loading && (msgs > before || body)) {
      replyText = (await page.getByTestId("msg-assistant").last().textContent().catch(() => "")) ?? "";
      break;
    }
    await sleep(1000);
  }

  // La consulta puede navegar la página (pageAction). Espera y reabre el panel conservando el hilo.
  await sleep(1200);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(2500);
  const panel2 = await ensurePanel(page);
  await sleep(400);
  return { status, body, replyText, rateLimited: false, url: page.url(), panel: panel2 };
}

async function walletConnected(page) {
  const menu = page.getByTestId("wallet-menu-button");
  if ((await menu.count()) === 0) return false;
  const text = (await menu.textContent().catch(() => "")) ?? "";
  return /0x[0-9a-fA-F]{4}/.test(text);
}

async function connectWalletIfNeeded(page) {
  // wagmi reconecta solo si el proveedor EIP-6963 ya expone cuentas; damos margen al arranque.
  for (let i = 0; i < 12; i++) {
    if (await walletConnected(page)) return true;
    await page.waitForTimeout(1000);
  }
  const menu = page.getByTestId("wallet-menu-button");
  if ((await menu.count()) === 0) return false;
  await menu.click();
  await page.waitForTimeout(600);
  const connect = page.getByRole("button", { name: "Conectar wallet" });
  if (await connect.count()) {
    await connect.first().click();
    await page.waitForTimeout(1000);
  }
  const option = page.locator('[data-testid^="wallet-option-"]').filter({ hasText: "Navegador" }).first();
  if (await option.count()) await option.click();
  for (let i = 0; i < 10; i++) {
    if (await walletConnected(page)) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function runAccount(browser, account) {
  ensureDirs(account);
  const transcriptFile = path.join(OUT_DIR, "transcripciones", `${account.id}.json`);
  const transcript = fs.existsSync(transcriptFile)
    ? JSON.parse(fs.readFileSync(transcriptFile, "utf8"))
    : { account: { id: account.id, index: account.index, address: account.address }, startedAt: new Date().toISOString(), entries: [] };

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  await installNavegadorWallet(context, { privateKey: account.privateKey });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(WEB_URL + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  const connected = await connectWalletIfNeeded(page);
  console.log(`[${account.id}] wallet conectada: ${connected}`);

  const sets = questionsFor(account);
  const all = [...(kinds.includes("support") ? sets.support : []), ...(kinds.includes("wrong") ? sets.wrong : [])];
  let wrongStarted = false;

  for (const entry of all) {
    if (entry.flow === "consulta errada / ambigua" && !wrongStarted) {
      wrongStarted = true;
      // Hilo nuevo para las consultas erradas: aísla la prueba de robustez del contexto anterior.
      await ensurePanel(page);
      const reset = page.getByTestId("assistant-new-chat");
      if ((await reset.count()) > 0 && (await reset.isEnabled().catch(() => false))) {
        await reset.click();
        await sleep(600);
      }
    }

    const existing = transcript.entries.find((e) => e.id === entry.id);
    if (existing && existing.status === 200) {
      console.log(`[${account.id}] SKIP ${entry.id}`);
      continue;
    }

    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await ask(page, entry.question);
      if (!result.rateLimited) break;
      console.log(`[${account.id}] 429 en ${entry.id}, espero ${result.retryAfter}s`);
      await sleep((result.retryAfter + 2) * 1000);
    }

    const screenshot = path.join("capturas", account.id, `${entry.id}.png`);
    await page.screenshot({ path: path.join(OUT_DIR, screenshot), fullPage: false });
    const record = {
      id: entry.id,
      kind: entry.flow === "consulta errada / ambigua" ? "errada" : "apoyo",
      flow: entry.flow,
      question: entry.question,
      expected: entry.expected,
      status: result.status,
      reply: result.body?.reply ?? result.replyText ?? null,
      uiText: result.replyText ?? null,
      domainToolCalls: result.body?.domainToolCalls ?? null,
      highlights: result.body?.highlights ?? [],
      pageAction: result.body?.pageAction ?? null,
      preparedPurchase: result.body?.preparedPurchase ?? null,
      urlAfter: result.url ?? null,
      screenshot,
      capturedAt: new Date().toISOString(),
    };
    transcript.entries = transcript.entries.filter((e) => e.id !== entry.id);
    transcript.entries.push(record);
    saveTranscript(account, transcript);
    console.log(`[${account.id}] ${entry.id} → ${result.status} · ${(record.reply ?? "").slice(0, 110)}`);
    await sleep(PACING_MS);
  }

  transcript.finishedAt = new Date().toISOString();
  saveTranscript(account, transcript);
  await context.close();
  return transcript;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const accounts = ACCOUNTS.filter((a) => !onlyIndexes || onlyIndexes.includes(a.index));
  for (const account of accounts) {
    await runAccount(browser, account);
  }
  await browser.close();
  console.log("POOL_OK", path.join(OUT_DIR, "transcripciones"));
}

main().catch((error) => {
  console.error("POOL_ERROR", error);
  process.exit(1);
});
