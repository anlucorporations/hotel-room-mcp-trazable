import fs from "node:fs";
import { parseAbi } from "viem";
import { pub, AUCTION_ADDRESS } from "./flow-lib.mjs";
const abi = parseAbi(["event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount, uint64 newEndTime)"]);
const TOKENS = new Set(["20320261119","20420261122","20520261125","20620261130","20720261203","20820261206","20920261209","21020261211","21120261216","21220261219"]);
const head = await pub.getBlockNumber();
const out = [];
for (let start = 5848838n; start <= head; start += 3000n) {
  const end = start + 2999n > head ? head : start + 2999n;
  const logs = await pub.getLogs({ address: AUCTION_ADDRESS, event: abi[0], fromBlock: start, toBlock: end });
  for (const log of logs) if (TOKENS.has(log.args.tokenId.toString())) out.push({ kind: "bid", tokenId: log.args.tokenId.toString(), bidder: log.args.bidder, amountWei: log.args.amount.toString(), tx: log.transactionHash, block: Number(log.blockNumber) });
}
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
data.events = data.events.filter((e) => e.kind !== "bid").concat(out).sort((a, b) => a.block - b.block);
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("bids", out.length, out.map((b) => b.tokenId + ":" + b.bidder.slice(0, 6)).join(" "));
