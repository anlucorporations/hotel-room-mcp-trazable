/**
 * DEMO FASE 3: genera actividad on-chain para poblar el dashboard y el histórico:
 * 3 ventas primarias (cuentas #3/#5/#6) y 1 reventa con royalty (#6 lista, #7 compra).
 * Lee las noches minteadas de los eventos `Mint` (robusto). Requiere Anvil + contrato + seed.
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbiItem,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN = Number(process.env.CHAIN_ID ?? CHAIN_ID);
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;

const KEYS = {
  buyer3: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  buyer5: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  reseller6: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  buyer7: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
} as const;

const chain = defineChain({
  id: CHAIN,
  name: `Anvil (${CHAIN})`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = (pk: `0x${string}`) =>
  createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC) });

const MINT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const SALE = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);

async function write(pk: `0x${string}`, fn: string, args: readonly unknown[], value?: bigint) {
  const hash = await wallet(pk).writeContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: fn,
    args,
    ...(value !== undefined ? { value } : {}),
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function main(): Promise<void> {
  const mints = await pub.getLogs({ address: CONTRACT, event: MINT, fromBlock: 0n });
  const sales = await pub.getLogs({ address: CONTRACT, event: SALE, fromBlock: 0n });
  const sold = new Set(sales.map((l) => (l.args.tokenId ?? 0n).toString()));
  const available = mints
    .map((l) => ({ tokenId: l.args.tokenId as bigint, price: l.args.price as bigint }))
    .filter((n) => !sold.has(n.tokenId.toString()));

  if (available.length < 4) throw new Error("se necesitan ≥4 noches disponibles (corre el seed antes)");

  // 3 ventas primarias.
  await write(KEYS.buyer3, "buy", [available[0]!.tokenId], available[0]!.price);
  await write(KEYS.buyer5, "buy", [available[1]!.tokenId], available[1]!.price);
  await write(KEYS.reseller6, "buy", [available[2]!.tokenId], available[2]!.price);
  console.log("3 ventas primarias hechas");

  // Reventa: #6 lista la 3.ª y #7 la compra (genera Sale SECONDARY + RoyaltyPaid).
  const resaleToken = available[2]!.tokenId;
  const resalePrice = available[2]!.price * 2n;
  await write(KEYS.reseller6, "list", [resaleToken, resalePrice]);
  await write(KEYS.buyer7, "buyResale", [resaleToken], resalePrice);
  console.log("1 reventa con royalty hecha");

  console.log("\n✅ Actividad generada: 3 primarias + 1 reventa. El worker la agregará.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
