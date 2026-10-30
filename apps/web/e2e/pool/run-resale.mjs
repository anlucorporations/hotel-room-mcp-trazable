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
const STAGE = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] ?? "list";
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

/** Cada cuenta revende la PRIMERA suite que ganó en subasta y compra la reventa de otra cuenta. */
async function runList(browser) {
  for (const account of accounts) {
    const data = evidence(account);
    data.stages.resale ??= [];
    const tokenId = AUCTION_BY_ACCOUNT.get(account.index)[0];
    if (data.stages.resale.some((r) => r.tokenId === tokenId.toString() && r.ok)) { log(account.id, "SKIP reventa"); continue; }
    const { context, page } = await openAccountBrowser(browser, account);
    await gotoAndConnect(page, "/mis-noches");
    await page.waitForTimeout(3000);
    const card = page.getByTestId(`my-night-${tokenId}`);
    await card.waitFor({ state: "visible", timeout: 60_000 });
    await shot(page, account, `mis-noches-${account.id}`);
    await page.getByTestId(`list-price-${tokenId}`).fill("0.30");
    await shot(page, account, `resale-${tokenId}-precio`);
    await page.getByTestId(`list-${tokenId}`).evaluate((el) => el.click());
    let ok = false;
    for (let i = 0; i < 60; i++) {
      const listing = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "listingOf", args: [tokenId] });
      if (listing[1]) { ok = true; break; }
      await page.waitForTimeout(2500);
    }
    const rel = await shot(page, account, `resale-${tokenId}-${ok ? "listada" : "pendiente"}`);
    data.stages.resale = data.stages.resale.filter((r) => r.tokenId !== tokenId.toString()).concat({ tokenId: tokenId.toString(), ok, price: "0.30", screenshot: rel });
    save(account, data);
    log(account.id, "reventa", tokenId.toString(), ok ? "OK" : "FALLO");
    await context.close();
  }
}

/** Compra en reventa la noche que listó la cuenta siguiente (ciclo de 5). */
async function runBuyResale(browser) {
  const order = accounts.map((a) => a.index);
  for (const account of accounts) {
    const data = evidence(account);
    data.stages.buyResale ??= [];
    const sellerIndex = order[(order.indexOf(account.index) + 1) % order.length];
    const tokenId = AUCTION_BY_ACCOUNT.get(sellerIndex)[0];
    const { context, page } = await openAccountBrowser(browser, account);
    await gotoAndConnect(page, "/reventa");
    await page.waitForTimeout(4000);
    const card = page.getByTestId(`night-card-${tokenId}`);
    await card.waitFor({ state: "visible", timeout: 60_000 });
    await shot(page, account, `reventa-${tokenId}-antes`);
    await page.getByTestId(`buy-button-${tokenId}`).click();
    const confirm = page.getByTestId("confirm-sign");
    await confirm.waitFor({ state: "visible", timeout: 60_000 });
    for (let i = 0; i < 60; i++) { if (await confirm.isEnabled().catch(() => false)) break; await page.waitForTimeout(1000); }
    await confirm.click();
    await page.waitForTimeout(2500);
    let owner = null;
    for (let i = 0; i < 60; i++) {
      owner = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "ownerOf", args: [tokenId] });
      if (owner.toLowerCase() === account.address.toLowerCase()) break;
      await page.waitForTimeout(2500);
    }
    const ok = owner.toLowerCase() === account.address.toLowerCase();
    const rel = await shot(page, account, `reventa-${tokenId}-${ok ? "comprada" : "pendiente"}`);
    data.stages.buyResale.push({ tokenId: tokenId.toString(), seller: sellerIndex, ok, screenshot: rel });
    save(account, data);
    log(account.id, "compra reventa", tokenId.toString(), ok ? "OK" : "FALLO");
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  if (STAGE === "list") await runList(browser);
  else if (STAGE === "buy") await runBuyResale(browser);
  else throw new Error(`stage ${STAGE}`);
  await browser.close();
  log("STAGE_OK", STAGE);
}
main().catch((e) => { console.error("RESALE_ERROR", e); process.exit(1); });
