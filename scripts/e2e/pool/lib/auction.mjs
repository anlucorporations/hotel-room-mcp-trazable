import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://besu.alumnos.codecrypto.academy";
export const AUCTION_ADDRESS = "0x42E5a852Aa5cd4284227796Bc5d2461189A65b8a";
const HOTEL_ADMIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export const chain = defineChain({
  id: 81234,
  name: "Codecrypto Besu",
  nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
export const pub = createPublicClient({ chain, transport: http(RPC) });
export const auctionAbi = parseAbi([
  "function createAuction(uint256 tokenId, uint256 reservePrice, uint64 startTime, uint64 endTime)",
  "function cancel(uint256 tokenId)",
  "function settle(uint256 tokenId)",
  "function bid(uint256 tokenId) payable",
  "function auctionOf(uint256 tokenId) view returns (uint256 tokenId, address seller, uint256 reservePrice, uint64 startTime, uint64 endTime, address highestBidder, uint256 highestBid, bool settled, bool cancelled)",
  "function stateOf(uint256 tokenId) view returns (uint8)",
  "function nextMinBid(uint256 tokenId) view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function AUCTION_ADMIN_ROLE() view returns (bytes32)",
  "function pendingWithdrawals(address account) view returns (uint256)",
  "function withdraw()",
]);

export function adminWallet() {
  return createWalletClient({ account: privateKeyToAccount(HOTEL_ADMIN_KEY), chain, transport: http(RPC) });
}
