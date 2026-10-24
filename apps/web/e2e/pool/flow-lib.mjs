import { chromium } from "@playwright/test";
import { installNavegadorWallet } from "./navegador-wallet.mjs";
import { ACCOUNTS } from "./pool-spec.mjs";
export { ACCOUNTS };
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const WEB_URL = process.env.WEB_URL ?? "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app";
export const RPC_URL = "https://besu.alumnos.codecrypto.academy";
export const HOTEL_ADDRESS = "0x8b1B398b9c49AFE6394aaE438f6F2E8039120253";
export const AUCTION_ADDRESS = "0x42E5a852Aa5cd4284227796Bc5d2461189A65b8a";
export const CURRENCY = "CC";

export const chain = defineChain({
  id: 81234,
  name: "Codecrypto Besu",
  nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
export const pub = createPublicClient({ chain, transport: http(RPC_URL) });

export const hotelAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function priceOf(uint256 tokenId) view returns (uint256)",
  "function listingOf(uint256 tokenId) view returns (uint256 price, bool active)",
  "function isCheckedIn(uint256 tokenId) view returns (bool)",
  "function soldOnce(uint256 tokenId) view returns (bool)",
]);
export const auctionAbi = parseAbi([
  "function auctionOf(uint256 tokenId) view returns (uint256 tokenId, address seller, uint256 reservePrice, uint64 startTime, uint64 endTime, address highestBidder, uint256 highestBid, bool settled, bool cancelled)",
  "function stateOf(uint256 tokenId) view returns (uint8)",
  "function nextMinBid(uint256 tokenId) view returns (uint256)",
  "function settle(uint256 tokenId)",
  "function bid(uint256 tokenId) payable",
]);

export const tokenIdFor = (room, isoDate) => BigInt(`${room}${isoDate.replaceAll("-", "")}`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function accountByIndex(index) {
  const account = ACCOUNTS.find((a) => a.index === index);
  if (!account) throw new Error(`cuenta ${index} no está en el pool`);
  return account;
}

export function walletFor(account) {
  return createWalletClient({
    account: privateKeyToAccount(account.privateKey),
    chain,
    transport: http(RPC_URL),
  });
}

export async function ownerOf(tokenId) {
  try {
    return await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "ownerOf", args: [tokenId] });
  } catch {
    return null;
  }
}

export async function waitOwner(tokenId, address, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const owner = await ownerOf(tokenId);
    if (owner && owner.toLowerCase() === address.toLowerCase()) return true;
    await sleep(3000);
  }
  return false;
}

export async function auctionState(tokenId) {
  return pub.readContract({ address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "auctionOf", args: [tokenId] });
}

/** Abre un contexto de navegador con la cartera de la cuenta conectada. */
export async function openAccountBrowser(browser, account) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
  await installNavegadorWallet(context, { privateKey: account.privateKey });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  return { context, page };
}

export async function walletConnected(page) {
  const menu = page.getByTestId("wallet-menu-button");
  if ((await menu.count()) === 0) return false;
  const text = (await menu.textContent().catch(() => "")) ?? "";
  return /0x[0-9a-fA-F]{4}/.test(text);
}

export async function gotoAndConnect(page, path = "/") {
  await page.goto(WEB_URL + path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  for (let i = 0; i < 15; i++) {
    if (await walletConnected(page)) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

/** Espera a que un modal de transacción termine (recibo confirmado) o a que cambie el estado. */
export async function screenshot(page, outDir, name, fullPage = false) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(path.join(outDir, name)), { recursive: true });
  await page.screenshot({ path: path.join(outDir, name), fullPage });
  return name;
}
