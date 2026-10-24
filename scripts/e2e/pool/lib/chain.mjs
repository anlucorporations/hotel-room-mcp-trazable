import { createPublicClient, http, defineChain } from "viem";
import { RPC_URL, CHAIN_ID } from "./secrets.mjs";

export const besu = defineChain({
  id: CHAIN_ID,
  name: "Codecrypto Besu (pool E2E)",
  nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const HOTEL_NIGHTS = "0x8b1B398b9c49AFE6394aaE438f6F2E8039120253";
export const AUCTION = "0x42E5a852Aa5cd4284227796Bc5d2461189A65b8a";

export const client = createPublicClient({ chain: besu, transport: http(RPC_URL) });

export const hotelAbi = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "priceOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "roomTypeOf", stateMutability: "view", inputs: [{ name: "room", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "isCheckedIn", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "soldOnce", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "listingOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "price", type: "uint256" }, { name: "active", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "event", name: "Mint", inputs: [
    { name: "tokenId", type: "uint256", indexed: true },
    { name: "room", type: "uint256", indexed: true },
    { name: "dateYYYYMMDD", type: "uint256", indexed: false },
    { name: "roomType", type: "string", indexed: false },
    { name: "price", type: "uint256", indexed: false },
  ] },
];

export function tokenIdFor(roomNumber, isoDate) {
  return BigInt(`${roomNumber}${isoDate.replaceAll("-", "")}`);
}

export async function tokenExists(tokenId) {
  try {
    await client.readContract({ address: HOTEL_NIGHTS, abi: hotelAbi, functionName: "ownerOf", args: [tokenId] });
    return true;
  } catch {
    return false;
  }
}

export async function chainBalance(address) {
  return client.getBalance({ address });
}
