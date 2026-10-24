import { pub, auctionAbi, AUCTION_ADDRESS, adminWallet } from "./lib/auction.mjs";
import { tokenIdFor } from "./lib/chain.mjs";

/** Las 10 subastas del pool: 2 por cuenta, cada una con la suite indicada. */
export const AUCTION_ASSIGNMENTS = [
  { tokenId: tokenIdFor(203, "2026-11-19"), account: 5 },
  { tokenId: tokenIdFor(204, "2026-11-22"), account: 5 },
  { tokenId: tokenIdFor(205, "2026-11-25"), account: 6 },
  { tokenId: tokenIdFor(206, "2026-11-30"), account: 6 },
  { tokenId: tokenIdFor(207, "2026-12-03"), account: 7 },
  { tokenId: tokenIdFor(208, "2026-12-06"), account: 7 },
  { tokenId: tokenIdFor(209, "2026-12-09"), account: 8 },
  { tokenId: tokenIdFor(210, "2026-12-11"), account: 8 },
  { tokenId: tokenIdFor(211, "2026-12-16"), account: 9 },
  { tokenId: tokenIdFor(212, "2026-12-19"), account: 9 },
];

const RESERVE_WEI = 250_000_000_000_000_000n; // 0.25 CC (precio de la suite)
const DURATION = 3600n;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const wallet = adminWallet();
  const block = await pub.getBlock({ blockTag: "latest" });
  const startTime = block.timestamp + 120n;
  const endTime = startTime + DURATION;
  console.log("inicio", new Date(Number(startTime) * 1000).toISOString(), "fin", new Date(Number(endTime) * 1000).toISOString());
  const created = [];
  for (const item of AUCTION_ASSIGNMENTS) {
    const state = await pub.readContract({ address: AUCTION_ADDRESS, abi: auctionAbi, functionName: "stateOf", args: [item.tokenId] });
    if (state !== 0) {
      console.log("EXISTE", item.tokenId.toString(), "estado", state);
      created.push({ ...item, tokenId: item.tokenId.toString(), startTime: Number(startTime), endTime: Number(endTime), reused: true });
      continue;
    }
    const hash = await wallet.writeContract({
      address: AUCTION_ADDRESS,
      abi: auctionAbi,
      functionName: "createAuction",
      args: [item.tokenId, RESERVE_WEI, startTime, endTime],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    console.log("CREADA", item.tokenId.toString(), "cuenta", item.account, "tx", hash, "bloque", receipt.blockNumber);
    created.push({ ...item, tokenId: item.tokenId.toString(), startTime: Number(startTime), endTime: Number(endTime), tx: hash });
    await sleep(1200);
  }
  console.log("AUCTIONS_JSON", JSON.stringify({ startTime: Number(startTime), endTime: Number(endTime), created }));
}

main().catch((error) => { console.error("ERROR", error); process.exit(1); });
