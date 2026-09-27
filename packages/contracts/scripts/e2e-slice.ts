/**
 * Prueba de integración del slice vertical de FASE 1 sobre Anvil (mint → lectura del catálogo
 * por eventos → compra primaria). Valida el wiring viem/TS que los tests de Solidity no cubren.
 *
 * Requiere Anvil en marcha y el contrato desplegado (ver `e2e-slice.sh`).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvilChain, encodeTokenId, roomTypeOf } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ensureRoomsRegistered } from "./room-registry";

const RPC = "http://127.0.0.1:8545";
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
// Anvil: cuenta #0 (admin, registra habitaciones F8), #1 (MINTER) y #3 (comprador).
const ADMIN_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const MINTER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const BUYER_PK = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as const;

const MINT_EVENT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const SALE_EVENT = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);

const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC) });
const admin = createWalletClient({
  account: privateKeyToAccount(ADMIN_PK),
  chain: anvilChain,
  transport: http(RPC),
});
const minter = createWalletClient({
  account: privateKeyToAccount(MINTER_PK),
  chain: anvilChain,
  transport: http(RPC),
});
const buyer = createWalletClient({
  account: privateKeyToAccount(BUYER_PK),
  chain: anvilChain,
  transport: http(RPC),
});

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

function futureDate(offsetDays: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function availableTokenIds(): Promise<Set<string>> {
  const [mints, sales] = await Promise.all([
    publicClient.getLogs({ address: CONTRACT, event: MINT_EVENT, fromBlock: 0n }),
    publicClient.getLogs({ address: CONTRACT, event: SALE_EVENT, fromBlock: 0n }),
  ]);
  const sold = new Set(sales.map((l) => (l.args.tokenId ?? 0n).toString()));
  const available = new Set<string>();
  for (const log of mints) {
    const id = (log.args.tokenId ?? 0n).toString();
    if (!sold.has(id)) available.add(id);
  }
  return available;
}

async function main(): Promise<void> {
  // F8 · D-10/D-13: el registro de habitaciones arranca vacío y `mint` lo exige.
  await ensureRoomsRegistered({ publicClient, admin, contract: CONTRACT, onLog: (m) => console.log(m) });

  const nights = [
    { room: 102, date: futureDate(10), price: parseEther("0.05") },
    { room: 118, date: futureDate(11), price: parseEther("0.1") },
    { room: 205, date: futureDate(12), price: parseEther("0.3") },
  ];

  for (const night of nights) {
    const type = roomTypeOf(night.room);
    const uri = `data:application/json,${encodeURIComponent(JSON.stringify({ room: night.room, type }))}`;
    const hash = await minter.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [BigInt(night.room), BigInt(night.date), night.price, uri],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
  console.log(`Minteadas ${nights.length} noches`);

  const afterMint = await availableTokenIds();
  assert(afterMint.size === 3, "el catálogo lista 3 noches disponibles tras el minteo");

  const target = nights[0];
  if (!target) throw new Error("sin noche objetivo");
  const tokenId = encodeTokenId(target.room, target.date);
  assert(afterMint.has(tokenId.toString()), "la noche objetivo está disponible");

  const buyHash = await buyer.writeContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "buy",
    args: [tokenId],
    value: target.price,
  });
  await publicClient.waitForTransactionReceipt({ hash: buyHash });
  console.log(`Comprada la noche ${tokenId}`);

  const owner = await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  assert(
    owner.toLowerCase() === privateKeyToAccount(BUYER_PK).address.toLowerCase(),
    "el comprador es el propietario tras la compra",
  );

  const afterBuy = await availableTokenIds();
  assert(afterBuy.size === 2, "el catálogo lista 2 noches tras la compra (la vendida sale)");
  assert(!afterBuy.has(tokenId.toString()), "la noche vendida ya no aparece en el catálogo");

  console.log("\n✅ Slice vertical OK: mint → catálogo → compra primaria.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
