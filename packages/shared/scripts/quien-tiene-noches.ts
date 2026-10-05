/** Sondeo (solo lectura): qué direcciones poseen noches hoy en el Anvil desplegado. */
import { createPublicClient, http, parseAbiItem, getAddress } from "viem";

const RPC = process.env.RPC_URL ?? "https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app";
const ADDRESS = (process.env.CONTRACT_ADDRESS ?? "0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f") as `0x${string}`;
const client = createPublicClient({ transport: http(RPC) });
const SALE = parseAbiItem("event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)");

const head = await client.getBlockNumber();
const logs = await client.getLogs({ address: ADDRESS, event: SALE, fromBlock: 314n, toBlock: head });
console.log("eventos Sale:", logs.length);
const owners = new Map<string, string[]>();
for (const log of logs) {
  const tokenId = log.args.tokenId;
  const buyer = log.args.buyer;
  if (tokenId === undefined || !buyer) continue;
  const owner = await client.readContract({ address: ADDRESS, abi: [parseAbiItem("function ownerOf(uint256) view returns (address)")], functionName: "ownerOf", args: [tokenId] }).catch(() => null);
  if (owner && owner.toLowerCase() === buyer.toLowerCase()) {
    const key = getAddress(buyer);
    owners.set(key, [...(owners.get(key) ?? []), tokenId.toString()]);
  }
}
for (const [owner, tokens] of [...owners].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
  console.log(`${owner} → ${tokens.length} noche(s): ${tokens.slice(0, 4).join(", ")}`);
}
if (owners.size === 0) console.log("(ninguna dirección conserva noches compradas)");
