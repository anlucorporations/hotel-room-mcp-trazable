/**
 * Integración del slice de FASE 2 sobre Anvil: mint → compra primaria → listar reventa →
 * buyResale (royalty pull) → claim. Valida el wiring viem/TS del mercado secundario.
 * Requiere Anvil + contrato desplegado (ver e2e-slice-resale.sh).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvilChain } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";

const RPC = "http://127.0.0.1:8545";
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const TREASURY = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
// Anvil: #1 MINTER, #3 vendedor (compra primaria), #4 comprador secundario.
const MINTER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const SELLER_PK = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as const;
const BUYER_PK = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as const;

const pub = createPublicClient({ chain: anvilChain, transport: http(RPC) });
const wallet = (pk: `0x${string}`) =>
  createWalletClient({ account: privateKeyToAccount(pk), chain: anvilChain, transport: http(RPC) });
const minter = wallet(MINTER_PK);
const seller = wallet(SELLER_PK);
const buyer = wallet(BUYER_PK);

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
}

function futureDate(days: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function send(hash: `0x${string}`): Promise<void> {
  await pub.waitForTransactionReceipt({ hash });
}

const read = <T extends string>(functionName: T, args: readonly unknown[]) =>
  pub.readContract({ address: CONTRACT, abi: hotelNightsAbi, functionName, args } as never);

async function main(): Promise<void> {
  const room = 207;
  const date = futureDate(15);
  const tokenId = BigInt(room) * 100_000_000n + BigInt(date);
  const primaryPrice = parseEther("0.05");
  const resalePrice = parseEther("0.1");

  await send(
    await minter.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [BigInt(room), BigInt(date), primaryPrice, "data:application/json,{}"],
    }),
  );
  console.log(`Minteada noche ${tokenId}`);

  // Compra primaria por el vendedor.
  await send(
    await seller.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "buy",
      args: [tokenId],
      value: primaryPrice,
    }),
  );
  assert(
    ((await read("ownerOf", [tokenId])) as Address).toLowerCase() ===
      seller.account.address.toLowerCase(),
    "el vendedor posee la noche tras la compra primaria",
  );

  // Listar para reventa.
  await send(
    await seller.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "list",
      args: [tokenId, resalePrice],
    }),
  );
  const listing = (await read("listingOf", [tokenId])) as { price: bigint; active: boolean };
  assert(listing.active && listing.price === resalePrice, "la noche queda listada en reventa");

  // Comprar reventa.
  await send(
    await buyer.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "buyResale",
      args: [tokenId],
      value: resalePrice,
    }),
  );
  assert(
    ((await read("ownerOf", [tokenId])) as Address).toLowerCase() ===
      buyer.account.address.toLowerCase(),
    "el comprador secundario posee la noche tras la reventa",
  );

  // Royalty (10%) por pull: vendedor 0.09, tesorería 0.01.
  const sellerPending = (await read("pendingWithdrawals", [seller.account.address])) as bigint;
  const treasuryPending = (await read("pendingWithdrawals", [TREASURY])) as bigint;
  assert(sellerPending === parseEther("0.09"), "el vendedor tiene 0.09 ETH pendientes (90%)");
  assert(treasuryPending === parseEther("0.01"), "la tesorería tiene 0.01 ETH de royalty (10%)");
  assert(sellerPending + treasuryPending === resalePrice, "royalty + proceeds == precio (sin wei atrapados)");

  // Claim del vendedor.
  const before = await pub.getBalance({ address: seller.account.address });
  await send(await seller.writeContract({ address: CONTRACT, abi: hotelNightsAbi, functionName: "claim", args: [] }));
  const after = await pub.getBalance({ address: seller.account.address });
  assert(after > before, "el vendedor cobra (claim) su saldo");
  assert(
    ((await read("pendingWithdrawals", [seller.account.address])) as bigint) === 0n,
    "el saldo pendiente del vendedor queda en 0 tras claim",
  );

  console.log("\n✅ Slice de reventa OK: mint → compra → listar → buyResale (royalty pull) → claim.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
