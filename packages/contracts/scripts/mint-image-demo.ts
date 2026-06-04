/**
 * DEMO local: mintea 3 noches cuya metadata lleva la imagen INCRUSTADA (data:image/svg+xml),
 * para que MetaMask muestre la imagen del NFT sin depender de un gateway IPFS. Solo demo:
 * en producción la metadata referencia `ipfs://<CID>` (ADR-12) y se pinean las imágenes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, defineChain, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, type NightType } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN = Number(process.env.CHAIN_ID ?? CHAIN_ID);
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const MINTER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const IMAGES_DIR = resolve(process.cwd(), "..", "..", "apps", "web", "public", "images");

const chain = defineChain({
  id: CHAIN,
  name: `Anvil (${CHAIN})`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const minter = createWalletClient({ account: privateKeyToAccount(MINTER_PK), chain, transport: http(RPC) });

const NIGHTS: Array<{ room: number; type: NightType; price: string }> = [
  { room: 103, type: "simple", price: "0.05" },
  { room: 116, type: "doble", price: "0.1" },
  { room: 203, type: "suite", price: "0.3" },
];

function imageDataUri(type: NightType): string {
  const svg = readFileSync(resolve(IMAGES_DIR, `${type}.svg`));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

async function main(): Promise<void> {
  const date = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 20);
    return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  })();

  for (const night of NIGHTS) {
    const metadata = {
      name: `Hotel Marina del Sol — Hab. ${night.room} · ${night.type}`,
      description: `Noche de la habitación ${night.room} (${night.type}).`,
      image: imageDataUri(night.type),
      attributes: [
        { trait_type: "Habitación", value: night.room },
        { trait_type: "Tipo", value: night.type },
      ],
    };
    const tokenURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
    const hash = await minter.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [BigInt(night.room), BigInt(date), parseEther(night.price), tokenURI],
    });
    console.log(`mint hab ${night.room} (${night.type}) con imagen incrustada → ${hash.slice(0, 10)}…`);
  }
  console.log("\n✅ 3 noches con imagen incrustada. Cómprala y MetaMask mostrará la imagen.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
