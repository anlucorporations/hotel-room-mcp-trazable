/**
 * Inventario NAVEGABLE para la demo (`@inyectaDatos` · modo mercado).
 *
 * El guion `inject-data.ts` deja la topología de cuentas y unas pocas ventas, pero **compra todo lo
 * que mintea**, asi que el catalogo publico y `/reventa` quedan vacios. Este guion hace lo contrario:
 * prepara surtido para que las dos vistas tengan contenido real que pasear.
 *
 * Que deja, en la cadena y por tanto en la web:
 *   - **Catalogo (venta primaria)**: noches minteadas y NO vendidas, con fechas repartidas dentro de
 *     la ventana de 90 dias del catalogo (`CATALOG_WINDOW_DAYS`), de los tres tipos del maestro.
 *   - **Reventa**: noches compradas por los usuarios de reservas (cuentas 2 y 3) y **listadas** por
 *     ellos, con precios por encima del suelo (0,01 ETH), incluidas varias **suites** para que el
 *     ranking y el royalty del 10 % tengan datos.
 *
 * Es **re-ejecutable**: busca fechas libres hacia delante, asi que cada pasada amplia el surtido en
 * lugar de chocar con lo ya minteado.
 *
 * Uso:
 *   pnpm --filter @hotel/contracts seed:market             # inyecta el surtido
 *   pnpm --filter @hotel/contracts seed:market -- --dry-run  # solo informa
 *
 * Requiere: Anvil en marcha y el contrato desplegado e inyectado (`pnpm deploy:anvil` + `pnpm inject:data`).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvilChain, roomTypeOf, type NightType } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ANVIL_ACCOUNTS } from "./dev-accounts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // Sin `.env`: se usan las variables del entorno.
}

const DRY_RUN = process.argv.includes("--dry-run");
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_RAW = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_RAW) {
  console.error("ERROR: falta CONTRACT_ADDRESS en el .env. Despliega antes: pnpm deploy:anvil");
  process.exit(1);
}
const CONTRACT = getAddress(CONTRACT_RAW);

const owner = privateKeyToAccount(ANVIL_ACCOUNTS.owner);
const userA = privateKeyToAccount(ANVIL_ACCOUNTS.userA);
const userB = privateKeyToAccount(ANVIL_ACCOUNTS.userB);
const USERS = { A: userA, B: userB } as const;

const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) });
const walletFor = (account: typeof owner) =>
  createWalletClient({ account, chain: anvilChain, transport: http(RPC_URL) });

/** Habitaciones del surtido, con su tipo segun el maestro y precio de venta primaria. */
const INVENTORY: readonly { room: number; priceEth: string }[] = [
  { room: 102, priceEth: "0.05" },
  { room: 105, priceEth: "0.055" },
  { room: 110, priceEth: "0.06" },
  { room: 114, priceEth: "0.065" },
  { room: 117, priceEth: "0.09" },
  { room: 121, priceEth: "0.095" },
  { room: 126, priceEth: "0.1" },
  { room: 129, priceEth: "0.11" },
  { room: 203, priceEth: "0.25" },
  { room: 208, priceEth: "0.27" },
  { room: 214, priceEth: "0.3" },
  { room: 219, priceEth: "0.32" },
];

/**
 * Fechas (dias vista desde el reloj de la CADENA) que se intentan para cada habitacion.
 *
 * Se reparten por **toda la ventana de 90 dias del catalogo** y alternan par/impar: los indices
 * pares quedan como inventario del hotel (catalogo primario) y los impares se compran y, algunos, se
 * listan en reventa. Asi las dos vistas tienen fechas distintas y se pueden recorrer por fecha.
 */
const DAY_OFFSETS = [10, 20, 30, 40, 50, 60, 70, 85];

/**
 * Plan de compras: indice de fecha -> quien compra. Los indices NO comprados se quedan como
 * inventario del hotel (catalogo primario). De las cuatro fechas compradas por habitacion, dos (una
 * de cada usuario) se listan en reventa.
 */
const BUY_PLAN: Record<number, keyof typeof USERS> = { 1: "A", 3: "B", 5: "A", 7: "B" };
const LIST_INDICES = new Set([3, 5]);

async function ownerOf(tokenId: bigint): Promise<Address | null> {
  try {
    return (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    })) as Address;
  } catch {
    return null;
  }
}

function dateFromChain(chainNowSeconds: bigint, offsetDays: number): number {
  const date = new Date((Number(chainNowSeconds) + offsetDays * 86_400) * 1000);
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

async function send(
  account: typeof owner,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<Hex> {
  const wallet = walletFor(account);
  const hash = await wallet.writeContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: functionName as "mint",
    args: args as never,
    value,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} revirtio (${hash})`);
  return hash;
}

async function main(): Promise<void> {
  console.log("Inventario navegable (@inyectaDatos · modo mercado)");
  console.log(`Modo: ${DRY_RUN ? "SIMULACION (no firma)" : "REAL"}`);

  const chainId = await publicClient.getChainId();
  if (chainId !== anvilChain.id) throw new Error(`chainId ${chainId} inesperado`);
  const code = await publicClient.getCode({ address: CONTRACT });
  if (!code || code === "0x") throw new Error(`no hay contrato en ${CONTRACT}`);

  const block = await publicClient.getBlock({ blockTag: "latest" });
  const minListingPrice = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "minListingPrice",
  })) as bigint;
  console.log(`Contrato ${CONTRACT} · bloque ${block.number} · suelo de listado ${formatEther(minListingPrice)} ETH`);
  console.log("");

  const minted: { tokenId: bigint; room: number; type: NightType; buyer?: keyof typeof USERS; listed: boolean }[] = [];

  for (const room of INVENTORY) {
    const type = roomTypeOf(room.room);
    if (!type) {
      console.log(`  habitacion ${room.room} fuera del maestro: se omite`);
      continue;
    }
    for (const [index, offset] of DAY_OFFSETS.entries()) {
      const date = dateFromChain(block.timestamp, offset);
      const tokenId = BigInt(room.room) * 100_000_000n + BigInt(date);
      if ((await ownerOf(tokenId)) !== null) continue; // ya existe: se respeta

      const buyer = BUY_PLAN[index];
      const listed = buyer !== undefined && LIST_INDICES.has(index);
      minted.push({ tokenId, room: room.room, type, buyer, listed });

      if (DRY_RUN) continue;
      await send(owner, "mint", [
        BigInt(room.room),
        BigInt(date),
        parseEther(room.priceEth),
        `ipfs://night-${room.room}-${date}`,
      ]);
      console.log(`  minteada   ${tokenId} · hab. ${room.room} (${type}) · ${room.priceEth} ETH · ${date}`);
    }
  }

  if (minted.length === 0) {
    console.log("No hay fechas libres nuevas: el surtido ya estaba completo.");
    return;
  }

  const toBuy = minted.filter((night) => night.buyer !== undefined);
  const primary = minted.length - toBuy.length;
  console.log("");
  console.log(`  resumen de la pasada: ${minted.length} noches · ${primary} quedan en venta primaria · ${toBuy.length} se compran`);
  console.log(`  de las compradas, ${minted.filter((n) => n.listed).length} se listan en reventa`);

  if (DRY_RUN) {
    console.log("\nSimulacion terminada (nada modificado).");
    return;
  }

  // Compra primaria: cada usuario paga su noche con su propia cartera.
  for (const night of toBuy) {
    const price = await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "priceOf",
      args: [night.tokenId],
    }).catch(() => 0n);
    const value = (price as bigint) > 0n ? (price as bigint) : parseEther("0.1");
    await send(USERS[night.buyer!], "buy", [night.tokenId], value);
    console.log(`  comprada   ${night.tokenId} por el usuario ${night.buyer} (${formatEther(value)} ETH)`);
  }

  // Reventa: el usuario lista su noche; el precio respeta el suelo y deja margen al royalty.
  for (const night of minted.filter((n) => n.listed)) {
    const resalePrice = night.type === "suite" ? parseEther("0.4") : parseEther("0.12");
    if (resalePrice < minListingPrice) throw new Error("el precio de reventa queda por debajo del suelo");
    await send(USERS[night.buyer!], "list", [night.tokenId, resalePrice]);
    console.log(`  listada    ${night.tokenId} por el usuario ${night.buyer} a ${formatEther(resalePrice)} ETH`);
  }

  console.log("");
  console.log("Inventario inyectado. El worker lo indexa en unos segundos; comprueba:");
  console.log("  http://127.0.0.1:3000/            (catalogo: venta primaria)");
  console.log("  http://127.0.0.1:3000/reventa     (listados vigentes)");
  console.log("  http://127.0.0.1:8787/aggregates  (contadores y desglose por tipo)");
}

void main().catch((error: unknown) => {
  console.error(`\nFALLO: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
