/**
 * DEMO: escenifica una noche en reventa. La cuenta #4 de Anvil compra una noche (primaria)
 * y la lista en el mercado secundario, para que el catálogo muestre una tarjeta «Reventa»
 * lista para probar `buyResale`. Requiere Anvil + contrato + noche minteada (room 203).
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, encodeTokenId } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN = Number(process.env.CHAIN_ID ?? CHAIN_ID);
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
// Anvil cuenta #4 (revendedor de la demo).
const RESELLER_PK = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as const;

const chain = defineChain({
  id: CHAIN,
  name: `Anvil (${CHAIN})`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const reseller = createWalletClient({
  account: privateKeyToAccount(RESELLER_PK),
  chain,
  transport: http(RPC),
});
const pub = createPublicClient({ chain, transport: http(RPC) });

// La suite 203 con imagen incrustada (mint-image-demo) se mintea para hoy+20.
function dateInDays(offset: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function main(): Promise<void> {
  const tokenId = encodeTokenId(203, dateInDays(20));
  const primary = parseEther("0.3");
  const resale = parseEther("0.4");

  const buyHash = await reseller.writeContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "buy",
    args: [tokenId],
    value: primary,
  });
  await pub.waitForTransactionReceipt({ hash: buyHash });

  const listHash = await reseller.writeContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "list",
    args: [tokenId, resale],
  });
  await pub.waitForTransactionReceipt({ hash: listHash });
  console.log(`✅ Noche ${tokenId} (suite 203) comprada por #4 y listada en reventa a 0.4 ETH.`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
