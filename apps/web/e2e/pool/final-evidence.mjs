import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { parseAbi } from "viem";
import {
  ACCOUNTS, WEB_URL, openAccountBrowser, gotoAndConnect, pub,
  HOTEL_ADDRESS, AUCTION_ADDRESS, sleep,
} from "./flow-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const OUT_DIR = process.env.POOL_OUT ?? path.join(REPO_ROOT, "RepoTecnico/evidencias/e2e-pool-asistente-2026-10-24");
const FLOWS_DIR = path.join(OUT_DIR, "flujos");
fs.mkdirSync(FLOWS_DIR, { recursive: true });

const hotelAbi = parseAbi([
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event Unlisted(uint256 indexed tokenId, address indexed seller)",
  "event CheckedIn(uint256 indexed tokenId, address indexed reception, uint256 timestamp)",
]);
const auctionAbi = parseAbi([
  "event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 reservePrice, uint64 startTime, uint64 endTime)",
  "event Bid(uint256 indexed tokenId, address indexed bidder, uint256 amount)",
  "event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 amount)",
]);

const TOKENS = [
  "11620261110","11720261112","20120261114","20220261116","11620261124","11720261127","20120261129","20220261201",
  "11620261208","11720261210","20120261212","20220261214","11620261220","11720261222","20120261223",
  "20320261119","20420261122","20520261125","20620261130","20720261203","20820261206","20920261209","21020261211","21120261216","21220261219",
  "10420261117","11820261120","21320261123","10520261126","11920261128","21420261202","10620261204","12020261207","21520261213",
  "10720261215","12120261217","21620261221","10820261223","12220261224","21720261222",
];
const TOKEN_SET = new Set(TOKENS);

async function scanEvents() {
  const head = await pub.getBlockNumber();
  const from = 5848830n;
  const step = 3000n;
  const out = [];
  for (let start = from; start <= head; start += step) {
    const end = start + step - 1n > head ? head : start + step - 1n;
    const [mints, sales, listed, checked] = await Promise.all([
      pub.getLogs({ address: HOTEL_ADDRESS, event: hotelAbi[0], fromBlock: start, toBlock: end }),
      pub.getLogs({ address: HOTEL_ADDRESS, event: hotelAbi[1], fromBlock: start, toBlock: end }),
      pub.getLogs({ address: HOTEL_ADDRESS, event: hotelAbi[2], fromBlock: start, toBlock: end }),
      pub.getLogs({ address: HOTEL_ADDRESS, event: hotelAbi[4], fromBlock: start, toBlock: end }),
    ]);
    for (const log of mints) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "mint", tokenId: log.args.tokenId.toString(), room: Number(log.args.room), date: log.args.dateYYYYMMDD.toString(), priceWei: log.args.price.toString(), tx: log.transactionHash, block: Number(log.blockNumber) });
    for (const log of sales) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "sale", tokenId: log.args.tokenId.toString(), seller: log.args.seller, buyer: log.args.buyer, priceWei: log.args.price.toString(), saleType: Number(log.args.saleType), tx: log.transactionHash, block: Number(log.blockNumber) });
    for (const log of listed) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "listed", tokenId: log.args.tokenId.toString(), seller: log.args.seller, priceWei: log.args.price.toString(), tx: log.transactionHash, block: Number(log.blockNumber) });
    for (const log of checked) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "checkedIn", tokenId: log.args.tokenId.toString(), reception: log.args.reception, tx: log.transactionHash, block: Number(log.blockNumber) });
  }
  const auctionHead = await pub.getBlockNumber();
  for (let start = 5848838n; start <= auctionHead; start += step) {
    const end = start + step - 1n > auctionHead ? auctionHead : start + step - 1n;
    const [created, bids, settled] = await Promise.all([
      pub.getLogs({ address: AUCTION_ADDRESS, event: auctionAbi[0], fromBlock: start, toBlock: end }),
      pub.getLogs({ address: AUCTION_ADDRESS, event: auctionAbi[1], fromBlock: start, toBlock: end }),
      pub.getLogs({ address: AUCTION_ADDRESS, event: auctionAbi[2], fromBlock: start, toBlock: end }),
    ]);
    for (const log of created) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "auctionCreated", tokenId: log.args.tokenId.toString(), reserveWei: log.args.reservePrice.toString(), tx: log.transactionHash, block: Number(log.blockNumber) });
    for (const log of bids) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "bid", tokenId: log.args.tokenId.toString(), bidder: log.args.bidder, amountWei: log.args.amount.toString(), tx: log.transactionHash, block: Number(log.blockNumber) });
    for (const log of settled) if (TOKEN_SET.has(log.args.tokenId.toString())) out.push({ kind: "auctionSettled", tokenId: log.args.tokenId.toString(), winner: log.args.winner, amountWei: log.args.amount.toString(), tx: log.transactionHash, block: Number(log.blockNumber) });
  }
  out.sort((a, b) => a.block - b.block);
  fs.writeFileSync(path.join(FLOWS_DIR, "eventos-pool.json"), JSON.stringify({ capturedAt: new Date().toISOString(), contract: HOTEL_ADDRESS, auction: AUCTION_ADDRESS, events: out }, null, 2));
  console.log("eventos", out.length);
  return out;
}

async function captureWallets(browser) {
  for (const account of ACCOUNTS) {
    const { context, page } = await openAccountBrowser(browser, account);
    await gotoAndConnect(page, "/mis-noches");
    await page.waitForTimeout(4500);
    const cards = await page.locator('[data-testid^="my-night-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("my-night-", "")));
    const rel = path.join("flujos", "capturas", account.id, `mis-noches-final-${account.id}.png`);
    fs.mkdirSync(path.dirname(path.join(OUT_DIR, rel)), { recursive: true });
    await page.screenshot({ path: path.join(OUT_DIR, rel), fullPage: true });
    fs.writeFileSync(path.join(FLOWS_DIR, `billetera-${account.id}.json`), JSON.stringify({ account: account.id, address: account.address, tokensVisibles: cards, capturedAt: new Date().toISOString(), screenshot: rel }, null, 2));
    console.log(account.id, "NFTs visibles en la billetera:", cards.length, cards.join(","));
    await context.close();
  }
}

async function main() {
  const events = await scanEvents();
  const browser = await chromium.launch({ headless: true });
  await captureWallets(browser);
  await browser.close();
  console.log("EVIDENCE_OK");
}
main().catch((e) => { console.error("EVIDENCE_ERROR", e); process.exit(1); });
