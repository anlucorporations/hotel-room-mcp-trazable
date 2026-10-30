import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  ACCOUNTS, WEB_URL, tokenIdFor, openAccountBrowser, gotoAndConnect,
  waitOwner, ownerOf, auctionState, pub, auctionAbi, AUCTION_ADDRESS,
  sleep, walletFor,
} from "./flow-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const OUT_DIR = process.env.POOL_OUT ?? path.join(REPO_ROOT, "RepoTecnico/evidencias/e2e-pool-asistente-2026-10-24");
const FLOWS_DIR = path.join(OUT_DIR, "flujos");
fs.mkdirSync(FLOWS_DIR, { recursive: true });

const args = new Map(process.argv.slice(2).map((a) => { const [k, v = "true"] = a.replace(/^--/, "").split("="); return [k, v]; }));
const stage = args.get("stage") ?? "buy";
const only = args.get("accounts") ? String(args.get("accounts")).split(",").map(Number) : null;
const accounts = ACCOUNTS.filter((a) => !only || only.includes(a.index));

/** Subastas asignadas por cuenta (2 por cuenta) según `create-auctions.mjs`. */
const AUCTION_BY_ACCOUNT = new Map([
  [5, [tokenIdFor(203, "2026-11-19"), tokenIdFor(204, "2026-11-22")]],
  [6, [tokenIdFor(205, "2026-11-25"), tokenIdFor(206, "2026-11-30")]],
  [7, [tokenIdFor(207, "2026-12-03"), tokenIdFor(208, "2026-12-06")]],
  [8, [tokenIdFor(209, "2026-12-09"), tokenIdFor(210, "2026-12-11")]],
  [9, [tokenIdFor(211, "2026-12-16"), tokenIdFor(212, "2026-12-19")]],
]);

function evidenceFor(account) {
  const file = path.join(FLOWS_DIR, `${account.id}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { account: account.id, address: account.address, stages: {} };
}
function saveEvidence(account, evidence) {
  fs.writeFileSync(path.join(FLOWS_DIR, `${account.id}.json`), JSON.stringify(evidence, null, 2));
}
async function shot(page, account, name) {
  const rel = path.join("flujos", "capturas", account.id, `${name}.png`);
  fs.mkdirSync(path.dirname(path.join(OUT_DIR, rel)), { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, rel), fullPage: false });
  return rel;
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Compra una noche desde el catálogo (flujo real: revisar → firmar → recibo). */
async function buyNight(page, account, reservation) {
  const tokenId = tokenIdFor(reservation.room, reservation.date);
  await page.goto(`${WEB_URL}/catalogo?buscar=${reservation.room}&desde=${reservation.date}&hasta=${reservation.date}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2500);
  const card = page.getByTestId(`night-card-${tokenId}`);
  await card.waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId(`buy-button-${tokenId}`).click();
  const confirm = page.getByTestId("confirm-sign");
  await confirm.waitFor({ state: "visible", timeout: 60_000 });
  for (let i = 0; i < 60; i++) {
    if (await confirm.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(1000);
  }
  const before = await shot(page, account, `buy-${tokenId}-revision`);
  await confirm.click();
  await page.waitForTimeout(2500);
  const signing = await shot(page, account, `buy-${tokenId}-firma`);
  const ok = await waitOwner(tokenId, account.address, 180_000);
  const after = await shot(page, account, `buy-${tokenId}-${ok ? "confirmada" : "pendiente"}`);
  return {
    tokenId: tokenId.toString(), room: reservation.room, date: reservation.date, ok,
    owner: (await ownerOf(tokenId)) ?? null,
    screenshots: [before, signing, after],
  };
}

/** Puja en una subasta desde /subastas (importe = reserva de la suite). */
async function bidAuction(page, account, tokenId, amount = "0.25") {
  await page.goto(`${WEB_URL}/subastas`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3000);
  const info = await auctionState(tokenId);
  const room = Number(tokenId.toString().slice(0, -8));
  const card = page.getByTestId("auction-card").filter({ hasText: `Noche ${room}` }).first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  const before = await shot(page, account, `bid-${tokenId}-antes`);
  const input = card.getByTestId("auction-bid-input");
  await input.fill(amount);
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  // El grid tiene imágenes con carga diferida y solapamientos durante el scroll: se dispara el
  // submit con DOM click (el formulario sigue pasando por la validación del componente).
  await card.getByTestId("auction-bid-submit").evaluate((el) => el.click());
  const confirm = page.getByTestId("auction-confirm-action");
  await confirm.waitFor({ state: "visible", timeout: 30_000 });
  await shot(page, account, `bid-${tokenId}-revision`);
  await confirm.click();
  let winner = null;
  for (let i = 0; i < 60; i++) {
    const auction = await auctionState(tokenId);
    winner = auction[5];
    if (winner && winner.toLowerCase() === account.address.toLowerCase()) break;
    await page.waitForTimeout(2500);
  }
  const after = await shot(page, account, `bid-${tokenId}-${winner ? "pujada" : "pendiente"}`);
  return { tokenId: tokenId.toString(), reserve: info[2].toString(), ok: Boolean(winner && winner.toLowerCase() === account.address.toLowerCase()), highestBidder: winner, screenshots: [before, after] };
}

async function runBuy(browser) {
  for (const account of accounts) {
    const evidence = evidenceFor(account);
    evidence.stages.buy ??= [];
    const { context, page } = await openAccountBrowser(browser, account);
    const connected = await gotoAndConnect(page, "/");
    log(account.id, "conectada", connected);
    for (const reservation of account.reservations) {
      if (evidence.stages.buy.some((b) => b.tokenId === tokenIdFor(reservation.room, reservation.date).toString() && b.ok)) {
        log(account.id, "SKIP compra", reservation.room, reservation.date);
        continue;
      }
      const result = await buyNight(page, account, reservation);
      evidence.stages.buy = evidence.stages.buy.filter((b) => b.tokenId !== result.tokenId).concat(result);
      saveEvidence(account, evidence);
      log(account.id, "compra", result.tokenId, result.ok ? "OK" : "FALLO");
    }
    await context.close();
  }
}

async function runBid(browser) {
  for (const account of accounts) {
    const evidence = evidenceFor(account);
    evidence.stages.bid ??= [];
    const { context, page } = await openAccountBrowser(browser, account);
    await gotoAndConnect(page, "/subastas");
    for (const tokenId of AUCTION_BY_ACCOUNT.get(account.index) ?? []) {
      if (evidence.stages.bid.some((b) => b.tokenId === tokenId.toString() && b.ok)) {
        log(account.id, "SKIP puja", tokenId.toString());
        continue;
      }
      // Espera a que la subasta haya empezado.
      for (let i = 0; i < 30; i++) {
        const auction = await auctionState(tokenId);
        const now = Math.floor(Date.now() / 1000);
        if (now >= Number(auction[3])) break;
        log(account.id, "espero inicio subasta", tokenId.toString(), "en", Number(auction[3]) - now, "s");
        await sleep(10_000);
      }
      const result = await bidAuction(page, account, tokenId);
      evidence.stages.bid = evidence.stages.bid.filter((b) => b.tokenId !== result.tokenId).concat(result);
      saveEvidence(account, evidence);
      log(account.id, "puja", result.tokenId, result.ok ? "OK" : "FALLO");
    }
    await context.close();
  }
}

async function runSettle() {
  for (const account of accounts) {
    const evidence = evidenceFor(account);
    evidence.stages.settle ??= [];
    const wallet = walletFor(account);
    for (const tokenId of AUCTION_BY_ACCOUNT.get(account.index) ?? []) {
      const auction = await auctionState(tokenId);
      if (auction[7]) { log(account.id, "ya liquidada", tokenId.toString()); continue; }
      const now = Math.floor(Date.now() / 1000);
      if (now < Number(auction[4])) {
        log(account.id, "subasta no cerrada aún", tokenId.toString(), "faltan", Number(auction[4]) - now, "s");
        continue;
      }
      const hash = await wallet.writeContract({ address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "settle", args: [tokenId] });
      await pub.waitForTransactionReceipt({ hash });
      const owner = await ownerOf(tokenId);
      const ok = owner && owner.toLowerCase() === account.address.toLowerCase();
      evidence.stages.settle.push({ tokenId: tokenId.toString(), tx: hash, ok, owner });
      saveEvidence(account, evidence);
      log(account.id, "liquidación", tokenId.toString(), ok ? "GANADA" : "FALLO");
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  if (stage === "buy") await runBuy(browser);
  else if (stage === "bid") await runBid(browser);
  else if (stage === "settle") await runSettle(browser);
  else throw new Error(`stage desconocido: ${stage}`);
  await browser.close();
  log("STAGE_OK", stage);
}

main().catch((error) => { console.error("FLOW_ERROR", error); process.exit(1); });
