import { mkdirSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseAbiItem,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  DASHBOARD_TIME_ZONE,
  TOP_RESOLD_LIMIT,
  anvilChain,
  closeDbPool,
  getDbPool,
  runMigrations,
  summarizeHistory,
  type DashboardAggregates,
  type SaleHistoryEntry,
} from "@hotel/shared";
import type { HealthReport } from "@hotel/shared/health";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { AggregateProcessor } from "../../../../apps/worker/src/aggregate-processor";
import { PgAggregateStore } from "../../../../apps/worker/src/aggregate-store";
import { ViemChainSource } from "../../../../apps/worker/src/chain-source";
import { startWorkerHttpServer } from "../../../../apps/worker/src/http-server";

/**
 * E2E REAL del hito M7 (D-11, D-16) contra Anvil + PostgreSQL, sin servicios externos.
 *
 * Comprueba con la cadena de verdad lo que no se puede comprobar con dobles:
 *
 *   A. **Ventas reales en dos meses distintos** (viajando en el reloj de la CADENA entre tramos):
 *      primarias de simple/doble/suite y una reventa con su `RoyaltyPaid`.
 *   B. **Agregación real en PostgreSQL**: el `AggregateProcessor` (el mismo que cablea el worker)
 *      hace catch-up y los contadores avanzan EXACTAMENTE lo que dicen los recibos on-chain.
 *   C. **El criterio de aceptación de M7**: los agregados que calcula el SQL (serie mensual,
 *      desglose por tipo, ranking) son **idénticos** a los que deriva del histórico la función pura
 *      `summarizeHistory` — dos caminos independientes sobre los mismos datos — y lo mismo por HTTP
 *      (`/aggregates`, que es lo que lee la web) que en proceso.
 *   D. **Filtro de pausa (deuda de M4 asignada a M7)**: con el contrato en pausa, `buy` revierte
 *      con `EnforcedPause` (la razón por la que las vistas leen `paused()`).
 *   E. **Titularidad on-chain (deuda de M5 asignada a M7)**: tras la reventa manda el dueño nuevo y
 *      `ownerOf` de una noche quemada revierte (clasificación «no existe»).
 *
 * Uso: `pnpm test:e2e:m7` (Anvil 81234 con el contrato desplegado y PostgreSQL levantados).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
const evidencePath = resolve(evidenceDir, "m7-dashboard-anvil.json");

process.loadEnvFile(resolve(repoRoot, ".env"));

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno (.env de la raíz).`);
  return value;
}

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = getAddress(env("CONTRACT_ADDRESS"));
const MONTH_TRAVEL_SECONDS = 32 * 86_400;

const ROYALTY_EVENT = parseAbiItem(
  "event RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount)",
);

const admin = privateKeyToAccount(env("MINTER_RELAYER_PRIVATE_KEY") as Hex); // cuenta 1: MINTER+PAUSER+admin
const buyer1 = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
const buyer2 = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
const buyer3 = privateKeyToAccount("0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e");

const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) }) as PublicClient;

/** Cuentas y precios de este E2E (habitaciones reales del maestro: simple/doble/suite). */
const SIMPLE_ROOM = 103n;
const DOBLE_ROOM = 119n;
const SUITE_ROOM = 204n;
const SIMPLE_PRICE = parseEther("0.10");
const DOBLE_PRICE = parseEther("0.20");
const SUITE_PRICE = parseEther("0.30");
const SIMPLE_RESALE = parseEther("0.15");
const DOBLE_RESALE = parseEther("0.25");
const BOUNDARY_ROOM = 105n;
const BOUNDARY_PRICE = parseEther("0.05");

const evidence: Record<string, unknown> = {
  hito: "M7",
  premisa:
    "serie mensual, desglose por tipo y ranking de más revendidas cuadrando con el histórico real; accesibilidad sobre la paleta real (D-11, D-16)",
  fecha: new Date().toISOString(),
  red: { chainId: anvilChain.id, rpc: RPC_URL, contrato: CONTRACT, operadorAdmin: admin.address },
  transacciones: {} as Record<string, string>,
  comprobaciones: [] as string[],
};

const ok = (message: string): void => {
  (evidence.comprobaciones as string[]).push(message);
  console.log(`  OK  ${message}`);
};
const expect = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Aserción fallida: ${message}`);
  ok(message);
};
const record = (name: string, hash: Hex): void => {
  (evidence.transacciones as Record<string, string>)[name] = hash;
};

const iso = (yyyymmdd: bigint): string => {
  const raw = yyyymmdd.toString();
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

/** Mes natural `YYYY-MM` de un instante en la zona del hotel (lo que la serie mensual agrupa). */
function hotelMonth(timestampSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).format(new Date(timestampSeconds * 1000));
}

/** Reloj de pared de `timestamp` en una zona, expresado como si fuera UTC (para comparar horas). */
function zoneWallClockAsUtc(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp * 1000));
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return (
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) /
    1000
  );
}

/**
 * Inicio del mes siguiente en la zona del hotel (`YYYY-MM` y su instante UNIX).
 *
 * Se resuelve buscando el instante cuyo reloj de pared en la zona es `00:00` del día 1 (iterando
 * el desfase, porque puede cambiar con el horario de verano).
 */
function nextMonthStartInZone(
  nowSeconds: number,
  timeZone: string,
): { startsAt: number; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(
    new Date(nowSeconds * 1000),
  );
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const naive = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0) / 1000;
  let exact = naive;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const wall = zoneWallClockAsUtc(exact, timeZone);
    if (wall === naive) break;
    exact -= wall - naive;
  }
  return { startsAt: exact, month: `${nextYear}-${String(nextMonth).padStart(2, "0")}` };
}

/**
 * Fecha relativa al **reloj de la cadena**, no al de la máquina: el E2E viaja en el tiempo para
 * repartir las ventas en meses distintos, así que el reloj de la cadena va por delante.
 */
async function chainDate(daysAhead: number): Promise<Date> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const base = new Date(Number(block.timestamp) * 1000);
  base.setUTCDate(base.getUTCDate() + daysAhead);
  return base;
}

const toYyyymmdd = (date: Date): bigint =>
  BigInt(date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate());

async function travel(seconds: number): Promise<void> {
  await publicClient.request({ method: "evm_increaseTime", params: [seconds] } as never);
  await publicClient.request({ method: "evm_mine", params: [] } as never);
}

async function send(signer: PrivateKeyAccount, data: Hex, value = 0n): Promise<Hex> {
  const client = createWalletClient({ account: signer, chain: anvilChain, transport: http(RPC_URL) });
  const hash = await client.sendTransaction({ to: CONTRACT, data, value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`La transacción ${hash} revirtió`);
  return hash;
}

const ownerOfOrNull = async (tokenId: bigint): Promise<Address | null> => {
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
};

/** Fecha libre para esa habitación (el contrato prohíbe dos noches iguales: `DuplicateNight`). */
async function pickFreeNight(room: bigint, daysAhead: number): Promise<bigint> {
  for (let extra = 0; extra < 60; extra += 1) {
    const date = toYyyymmdd(await chainDate(daysAhead + extra));
    if ((await ownerOfOrNull(room * 100_000_000n + date)) === null) return date;
  }
  throw new Error(`No hay fecha libre para la habitación ${room}`);
}

interface SaleRecord {
  readonly label: string;
  readonly tokenId: bigint;
  readonly txHash: Hex;
  readonly priceWei: bigint;
  readonly kind: "primary" | "secondary";
  readonly buyer: Address;
  readonly royaltyWei: bigint;
}

/** Compras que ha ejecutado ESTA corrida (el delta esperado de los contadores). */
const salesThisRun: SaleRecord[] = [];
let mintedThisRun = 0;

/**
 * Asegura una venta primaria real: mintea si hace falta y compra con la cuenta indicada. Devuelve
 * `null` si la noche ya estaba vendida (re-ejecución del E2E), para que las expectativas del delta
 * sigan siendo exactas en lugar de asumir que todo se ha vuelto a ejecutar.
 */
async function ensurePrimarySale(
  label: string,
  room: bigint,
  price: bigint,
  daysAhead: number,
  buyer: PrivateKeyAccount,
): Promise<{ tokenId: bigint; date: bigint; bought: boolean }> {
  const date = await pickFreeNight(room, daysAhead);
  const tokenId = room * 100_000_000n + date;

  let owner = await ownerOfOrNull(tokenId);
  if (owner === null) {
    const mintHash = await send(
      admin,
      encodeFunctionData({
        abi: hotelNightsAbi,
        functionName: "mint",
        args: [room, date, price, `ipfs://m7-e2e/${label}`],
      }),
    );
    record(`mint-${label}`, mintHash);
    mintedThisRun += 1;
    owner = await ownerOfOrNull(tokenId);
  }

  if (owner !== null && owner.toLowerCase() === buyer.address.toLowerCase()) {
    ok(`Noche ${label} ya vendida a ${buyer.address.slice(0, 8)}… (re-ejecución: no se repite la compra)`);
    return { tokenId, date, bought: false };
  }

  const buyHash = await send(
    buyer,
    encodeFunctionData({ abi: hotelNightsAbi, functionName: "buy", args: [tokenId] }),
    price,
  );
  record(`buy-${label}`, buyHash);
  salesThisRun.push({
    label,
    tokenId,
    txHash: buyHash,
    priceWei: price,
    kind: "primary",
    buyer: buyer.address,
    royaltyWei: 0n,
  });
  return { tokenId, date, bought: true };
}

/** Reventa real: `list` por el dueño y `buyResale` por otro huésped (con su `RoyaltyPaid`). */
async function ensureResale(
  label: string,
  tokenId: bigint,
  price: bigint,
  seller: PrivateKeyAccount,
  buyer: PrivateKeyAccount,
): Promise<boolean> {
  const listing = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "listingOf",
    args: [tokenId],
  })) as { active: boolean };
  const owner = await ownerOfOrNull(tokenId);

  if (owner !== null && owner.toLowerCase() === buyer.address.toLowerCase()) {
    ok(`Noche ${label} ya revendida a ${buyer.address.slice(0, 8)}… (re-ejecución: no se repite)`);
    return false;
  }

  if (!listing.active) {
    const listHash = await send(
      seller,
      encodeFunctionData({ abi: hotelNightsAbi, functionName: "list", args: [tokenId, price] }),
    );
    record(`list-${label}`, listHash);
  }

  const resaleHash = await send(
    buyer,
    encodeFunctionData({ abi: hotelNightsAbi, functionName: "buyResale", args: [tokenId] }),
    price,
  );
  record(`buyResale-${label}`, resaleHash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: resaleHash });
  const royaltyWei = receipt.logs.reduce((sum, log) => {
    const decoded = decodeEventLogSafe([ROYALTY_EVENT], log);
    return decoded?.eventName === "RoyaltyPaid" ? sum + (decoded.args.amount as bigint) : sum;
  }, 0n);

  salesThisRun.push({
    label,
    tokenId,
    txHash: resaleHash,
    priceWei: price,
    kind: "secondary",
    buyer: buyer.address,
    royaltyWei,
  });
  return true;
}

function decodeEventLogSafe(
  abi: readonly unknown[],
  log: { data: Hex; topics: readonly Hex[] },
): { eventName: string; args: Record<string, unknown> } | null {
  try {
    return decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics as never }) as never;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`\n=== E2E M7 real sobre Anvil ${anvilChain.id} — contrato ${CONTRACT} ===`);

  const pool = getDbPool();
  await runMigrations(pool);

  expect((await publicClient.getChainId()) === anvilChain.id, "La cadena responde y es la esperada");

  const pauserRole = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "PAUSER_ROLE",
  })) as Hex;
  expect(
    (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "hasRole",
      args: [pauserRole, admin.address],
    })) as boolean,
    "La cuenta de operación tiene PAUSER_ROLE (puede pausar el contrato de verdad)",
  );

  // ── A. Ventas reales repartidas en dos meses del reloj de la cadena ──────────────────────────
  const simpleSale = await ensurePrimarySale("103-simple", SIMPLE_ROOM, SIMPLE_PRICE, 12, buyer1);
  const simpleResold = await ensureResale("103-reventa", simpleSale.tokenId, SIMPLE_RESALE, buyer1, buyer2);

  const beforeTravel = await publicClient.getBlock({ blockTag: "latest" });
  await travel(MONTH_TRAVEL_SECONDS);
  const afterTravel = await publicClient.getBlock({ blockTag: "latest" });
  // Los meses se comparan en la zona del HOTEL (es la que usa la serie mensual), no en UTC.
  const month0 = hotelMonth(Number(beforeTravel.timestamp));
  const month1 = hotelMonth(Number(afterTravel.timestamp));
  expect(month0 !== month1, `El reloj de la cadena cruza de mes: ${month0} → ${month1}`);

  const dobleSale = await ensurePrimarySale("119-doble", DOBLE_ROOM, DOBLE_PRICE, 10, buyer2);
  const suiteSale = await ensurePrimarySale("204-suite", SUITE_ROOM, SUITE_PRICE, 14, buyer3);
  const dobleResold = await ensureResale("119-reventa", dobleSale.tokenId, DOBLE_RESALE, buyer2, buyer3);

  // A.3. Frontera de mes: una venta a las 00:30 del día 1 en Madrid cae, en UTC, el día anterior
  // (22:30/23:30 del último día del mes previo). Es el caso que distingue «mes del hotel» de «mes
  // UTC»: si la serie mensual usara UTC, esta venta aparecería en el mes equivocado.
  const latest = await publicClient.getBlock({ blockTag: "latest" });
  const boundary = nextMonthStartInZone(Number(latest.timestamp), DASHBOARD_TIME_ZONE);
  const boundaryTarget = boundary.startsAt + 30 * 60;
  const boundaryUtcMonth = new Date(boundaryTarget * 1000).toISOString().slice(0, 7);
  expect(
    boundaryUtcMonth !== boundary.month,
    `La frontera elegida separa el mes del hotel (${boundary.month}) del de UTC (${boundaryUtcMonth})`,
  );
  await publicClient.request({
    method: "evm_setNextBlockTimestamp",
    params: [boundaryTarget],
  } as never);
  // Se mina un bloque vacío para que el reloj de la cadena SE MUEVA a la frontera: las fechas de
  // las noches se calculan con el reloj de la cadena, así que si no se moviera primero, el `mint`
  // revertiría con `PastDate` (la noche se calcularía con el reloj viejo y se mintearía con el nuevo).
  await publicClient.request({ method: "evm_mine", params: [] } as never);
  const boundarySale = await ensurePrimarySale(
    "105-frontera",
    BOUNDARY_ROOM,
    BOUNDARY_PRICE,
    14,
    buyer1,
  );
  const boundaryRecord = salesThisRun.find((sale) => sale.label === "105-frontera");
  if (boundaryRecord === undefined) {
    // Re-ejecución: la venta de la frontera ya existía, así que su fila sigue en el histórico y las
    // comprobaciones de abajo se hacen contra ella igualmente.
    ok("La venta de frontera ya existía (re-ejecución): se comprueba la fila persistida");
  }

  const expected = salesThisRun.reduce(
    (acc, sale) => {
      if (sale.kind === "primary") {
        acc.primaryWei += sale.priceWei;
        acc.primaryCount += 1;
      } else {
        acc.secondaryWei += sale.priceWei;
        acc.secondaryCount += 1;
        acc.royaltiesWei += sale.royaltyWei;
      }
      return acc;
    },
    { primaryWei: 0n, secondaryWei: 0n, royaltiesWei: 0n, primaryCount: 0, secondaryCount: 0 },
  );

  const head = await publicClient.getBlockNumber();
  ok(
    `Ventas de esta corrida: ${expected.primaryCount} primaria(s) y ${expected.secondaryCount} reventa(s) ` +
      `en los meses ${month0}/${month1} (bloque ${head})`,
  );

  // ── B. Agregación real en PostgreSQL (mismo núcleo que el worker) ────────────────────────────
  const store = new PgAggregateStore(pool);
  const chainSource = new ViemChainSource({ rpcUrl: RPC_URL, chain: anvilChain, contractAddress: CONTRACT });
  const deploymentBlock = Number(process.env.DEPLOYMENT_BLOCK ?? 0);
  const processor = new AggregateProcessor({ chainSource, store, deploymentBlock });

  const countersBefore = await store.getCounters();
  if (countersBefore.lastBlock > Number(head)) {
    // Cadena reiniciada por detrás del checkpoint (lección de M6): se rebobina el puntero y la
    // idempotencia por `txHash:logIndex` impide contar dos veces lo ya contabilizado.
    console.log(
      `  ··  checkpoint (${countersBefore.lastBlock}) por delante de la cabeza (${head}): se rebobina a ${deploymentBlock}`,
    );
    await store.setLastBlock(deploymentBlock);
  }
  await processor.catchUp(head);

  // Relleno de fechas del histórico anterior a M7 (H6): recupera la fecha de su bloque.
  const backfill = await processor.backfillTimestamps();
  if (backfill.backfilled > 0) {
    ok(`Fechas recuperadas para el histórico anterior a M7: ${backfill.backfilled} venta(s)`);
  }

  // La comprobación de esta corrida es POR FILAS, no por delta de contadores: con el worker vivo
  // (poll de 4 s) los contadores pueden avanzar antes de que el guion los lea, y un delta «0»
  // haría fallar el E2E aunque la contabilidad fuera correcta (lo detectó la verificación de M7).
  const runTxHashes = salesThisRun.map((sale) => sale.txHash);
  const { rows: persistedSales } = await pool.query<{
    tx_hash: string;
    token_id: string;
    price_wei: string;
    sale_type_raw: number;
    buyer: string;
    block_timestamp: string | null;
  }>(
    `SELECT tx_hash, token_id, price_wei, sale_type_raw, buyer, block_timestamp
     FROM worker_sale_history
     WHERE tx_hash = ANY($1::text[])`,
    [runTxHashes],
  );
  const byTx = new Map(persistedSales.map((row) => [row.tx_hash, row]));
  const mismatches = salesThisRun.filter((sale) => {
    const row = byTx.get(sale.txHash);
    return (
      row === undefined ||
      row.price_wei !== sale.priceWei.toString() ||
      row.token_id !== sale.tokenId.toString() ||
      Number(row.sale_type_raw) !== (sale.kind === "primary" ? 0 : 1) ||
      row.buyer.toLowerCase() !== sale.buyer.toLowerCase()
    );
  });
  expect(
    mismatches.length === 0,
    `Las ${salesThisRun.length} ventas de esta corrida están en el histórico con su precio, tipo y comprador exactos`,
  );

  const countersAfter = await store.getCounters();
  expect(
    countersAfter.primaryVolumeWei >= expected.primaryWei &&
      countersAfter.secondaryVolumeWei >= expected.secondaryWei &&
      countersAfter.royaltiesWei >= expected.royaltiesWei,
    `Los contadores incluyen el volumen de esta corrida (primaria ${formatEther(expected.primaryWei)} POL, ` +
      `reventa ${formatEther(expected.secondaryWei)} POL, royalties ${formatEther(expected.royaltiesWei)} POL)`,
  );

  // ── C. El criterio de aceptación: SQL y derivación del histórico coinciden ───────────────────
  // Con el worker vivo puede entrar una venta entre las dos lecturas: se reintenta (hasta 3 veces)
  // en lugar de declarar un fallo que solo sería una carrera.
  let aggregates = await processor.getAggregates();
  let history = await processor.getHistory();
  let derived = summarizeHistory(history, DASHBOARD_TIME_ZONE, TOP_RESOLD_LIMIT);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seriesOk =
      JSON.stringify(aggregates.monthlySeries) === JSON.stringify(derived.monthlySeries) &&
      JSON.stringify(aggregates.roomTypeBreakdown) === JSON.stringify(derived.roomTypeBreakdown) &&
      JSON.stringify(aggregates.topResold) === JSON.stringify(derived.topResold);
    if (seriesOk) break;
    console.log("  ··  lectura no coincidente (¿escritura concurrente del worker?): se repite");
    aggregates = await processor.getAggregates();
    history = await processor.getHistory();
    derived = summarizeHistory(history, DASHBOARD_TIME_ZONE, TOP_RESOLD_LIMIT);
  }

  expect(
    JSON.stringify(aggregates.monthlySeries) === JSON.stringify(derived.monthlySeries),
    `La serie mensual del SQL es idéntica a la derivada del histórico (${aggregates.monthlySeries.length} meses)`,
  );
  expect(
    JSON.stringify(aggregates.roomTypeBreakdown) === JSON.stringify(derived.roomTypeBreakdown),
    `El desglose por tipo del SQL es idéntico al derivado del histórico (${aggregates.roomTypeBreakdown.length} tipos)`,
  );
  expect(
    JSON.stringify(aggregates.topResold) === JSON.stringify(derived.topResold),
    `El ranking de más revendidas del SQL es idéntico al derivado del histórico (${aggregates.topResold.length} noches)`,
  );
  expect(
    aggregates.undatedSalesCount === 0,
    "Tras el relleno, NINGUNA venta del histórico queda fuera de la serie mensual (0 sin fecha)",
  );

  const monthlyMonths = aggregates.monthlySeries.map((point) => point.month);
  expect(
    monthlyMonths.includes(month0) && monthlyMonths.includes(month1),
    `La serie mensual contiene los dos meses reales del E2E (${monthlyMonths.join(", ")})`,
  );

  // La venta de la frontera: en UTC pertenece al mes anterior; en la serie debe estar en el mes del
  // HOTEL. Se comprueba contra la fila persistida (no contra el payload, que es lo que se prueba),
  // y de forma independiente de si esta corrida ha tenido que comprar o ya estaba comprada.
  const boundaryRow = await pool.query<{ hotel_month: string; utc_month: string; price_wei: string }>(
    `SELECT to_char(block_timestamp AT TIME ZONE $1, 'YYYY-MM') AS hotel_month,
            to_char(block_timestamp AT TIME ZONE 'UTC', 'YYYY-MM') AS utc_month,
            price_wei
     FROM worker_sale_history
     WHERE token_id = $2
     ORDER BY block_timestamp DESC
     LIMIT 1`,
    [DASHBOARD_TIME_ZONE, boundarySale.tokenId.toString()],
  );
  const boundaryPersisted = boundaryRow.rows[0];
  expect(
    boundaryPersisted !== undefined && boundaryPersisted.utc_month !== boundaryPersisted.hotel_month,
    `La fila de frontera está a caballo de dos meses: hotel ${boundaryPersisted?.hotel_month} vs UTC ${boundaryPersisted?.utc_month}`,
  );
  const boundaryBucket = aggregates.monthlySeries.find(
    (point) => point.month === boundaryPersisted!.hotel_month,
  );
  expect(
    boundaryBucket !== undefined &&
      BigInt(boundaryBucket.primaryVolumeWei) >= BigInt(boundaryPersisted!.price_wei),
    `La serie mensual cuenta esa venta en el mes del HOTEL (${boundaryPersisted?.hotel_month}), no en el de UTC (${boundaryPersisted?.utc_month})`,
  );

  const simpleType = aggregates.roomTypeBreakdown.find((entry) => entry.roomType === "simple");
  const dobleType = aggregates.roomTypeBreakdown.find((entry) => entry.roomType === "doble");
  const suiteType = aggregates.roomTypeBreakdown.find((entry) => entry.roomType === "suite");
  expect(
    Boolean(simpleType) && Boolean(dobleType) && Boolean(suiteType),
    "El desglose por tipo cubre simple, doble y suite (los tres tipos del maestro)",
  );
  // La atribución por tipo no es decorativa: la reventa de una noche simple tiene que caer en
  // «simple» y la primaria de la suite en «suite» (agrupar por habitación en vez de por tipo se
  // vería aquí).
  if (suiteSale.bought) {
    expect(
      BigInt(suiteType!.primaryVolumeWei) >= SUITE_PRICE,
      "La venta primaria de la suite se atribuye al tipo suite",
    );
  }
  if (simpleResold) {
    expect(
      BigInt(simpleType!.secondaryVolumeWei) >= SIMPLE_RESALE,
      "La reventa de una noche simple se atribuye al tipo simple",
    );
  }
  if (dobleResold) {
    expect(
      BigInt(dobleType!.secondaryVolumeWei) >= DOBLE_RESALE,
      "La reventa de una noche doble se atribuye al tipo doble",
    );
  }

  const topResoldFirst = aggregates.topResold[0];
  expect(
    topResoldFirst !== undefined && topResoldFirst.resaleCount >= 1,
    `El ranking encabeza con la noche ${topResoldFirst?.tokenId} (${topResoldFirst?.resaleCount} reventa(s))`,
  );
  if (simpleResold || dobleResold) {
    const resoldTokens = new Set(
      salesThisRun.filter((sale) => sale.kind === "secondary").map((sale) => sale.tokenId.toString()),
    );
    expect(
      aggregates.topResold.some((night) => resoldTokens.has(night.tokenId)),
      "El ranking incluye las noches revendidas en esta corrida",
    );
  }

  const { rows: undatedRows } = await pool.query<{ undated: number }>(
    "SELECT COUNT(*)::INT AS undated FROM worker_sale_history WHERE block_timestamp IS NULL",
  );
  expect(
    aggregates.undatedSalesCount === Number(undatedRows[0]?.undated ?? 0),
    `Las ventas sin marca temporal se declaran (${aggregates.undatedSalesCount}) y coinciden con el SQL`,
  );

  const datedSales = history.filter((entry) => entry.blockTimestamp !== null).length;
  expect(
    datedSales + aggregates.undatedSalesCount === history.length,
    `Toda venta del histórico está datada o declarada sin fecha (${history.length} en total)`,
  );

  // La misma cifra por HTTP: es lo que lee la web (y lo que el CSV exporta).
  const server = await startWorkerHttpServer({
    host: "127.0.0.1",
    port: 0,
    provider: async (): Promise<HealthReport> => ({ status: "ok", component: "worker", details: {} }),
    data: {
      getAggregates: () => processor.getAggregates(),
      getHistory: () => processor.getHistory(),
    },
  });
  const httpAggregates = await fetchJson<DashboardAggregates>(server, "/aggregates");
  const httpHistory = await fetchJson<SaleHistoryEntry[]>(server, "/history");
  expect(
    JSON.stringify(httpAggregates) === JSON.stringify(aggregates),
    "El payload HTTP /aggregates es el mismo objeto que el del proceso (sin pérdida en JSON)",
  );
  expect(
    httpHistory.length === history.length,
    `El histórico HTTP trae las mismas ${httpHistory.length} ventas que el proceso`,
  );
  await closeServer(server);

  // ── D. Filtro de pausa (deuda de M4 → M7) ────────────────────────────────────────────────────
  const availableDate = await pickFreeNight(SIMPLE_ROOM + 1n, 20);
  const availableToken = (SIMPLE_ROOM + 1n) * 100_000_000n + availableDate;
  await send(
    admin,
    encodeFunctionData({
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [SIMPLE_ROOM + 1n, availableDate, SIMPLE_PRICE, "ipfs://m7-e2e/pausa"],
    }),
  );

  await send(admin, encodeFunctionData({ abi: hotelNightsAbi, functionName: "pause" }));
  expect(
    (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "paused",
    })) === true,
    "El contrato queda EN PAUSA (las vistas leen este mismo `paused()`)",
  );

  const pausedBuy = await publicClient
    .simulateContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "buy",
      args: [availableToken],
      value: SIMPLE_PRICE,
      account: buyer1,
    })
    .then(() => null)
    .catch((error: unknown) => error);
  expect(
    pausedBuy !== null && describeError(pausedBuy).includes("EnforcedPause"),
    "Con el contrato en pausa, `buy` revierte con EnforcedPause (lo que la vista ya no ofrece)",
  );

  await send(admin, encodeFunctionData({ abi: hotelNightsAbi, functionName: "unpause" }));
  expect(
    (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "paused",
    })) === false,
    "El contrato vuelve a estar operativo (`paused()` = false)",
  );
  const unpausedBuy = await publicClient
    .simulateContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "buy",
      args: [availableToken],
      value: SIMPLE_PRICE,
      account: buyer1,
    })
    .then(() => true)
    .catch(() => false);
  expect(unpausedBuy, "Sin pausa, la misma compra simula correctamente (la diferencia es la pausa)");

  // ── E. Titularidad on-chain (deuda de M5 → M7) ───────────────────────────────────────────────
  const newOwner = await ownerOfOrNull(dobleSale.tokenId);
  expect(
    newOwner !== null && newOwner.toLowerCase() === buyer3.address.toLowerCase(),
    `Tras la reventa, el dueño on-chain de la noche ${dobleSale.tokenId} es el comprador (${buyer3.address.slice(0, 8)}…)`,
  );

  const burnToken = await findBurnedToken(publicClient);
  expect(burnToken !== null, `Se ha localizado una noche quemada en la cadena (${burnToken?.toString()})`);
  expect(
    (await ownerOfOrNull(burnToken!)) === null,
    "`ownerOf` de una noche quemada revierte: la clasificación «no existe» (404) es real",
  );
  expect(
    (await ownerOfOrNull(999n * 100_000_000n + 20_260_101n)) === null,
    "`ownerOf` de un token nunca emitido también revierte (misma vía de fallo)",
  );

  // ── Evidencia ────────────────────────────────────────────────────────────────────────────────
  evidence.resultado = "COMPLETO";
  evidence.meses = {
    mesAnterior: month0,
    mesSiguiente: month1,
    fronteraHotel: boundary.month,
    fronteraUtc: boundaryUtcMonth,
    fronteraComprada: boundaryRecord !== undefined,
  };
  evidence.ventasDeEstaCorrida = salesThisRun.map((sale) => ({
    etiqueta: sale.label,
    tipo: sale.kind,
    tokenId: sale.tokenId.toString(),
    precioWei: sale.priceWei.toString(),
    royaltyWei: sale.royaltyWei.toString(),
    comprador: sale.buyer,
    txHash: sale.txHash,
  }));
  evidence.filasDeEstaCorrida = {
    ventas: salesThisRun.length,
    minteadas: mintedThisRun,
    verificadasEnElHistorico: salesThisRun.length - mismatches.length,
  };
  evidence.rellenoDeFechas = backfill;
  evidence.contadoresTrasLaCorrida = {
    primariaWei: countersAfter.primaryVolumeWei.toString(),
    reventaWei: countersAfter.secondaryVolumeWei.toString(),
    royaltiesWei: countersAfter.royaltiesWei.toString(),
    vendidas: countersAfter.soldCount,
    minteadas: countersAfter.mintedCount,
  };
  evidence.agregados = {
    lastBlock: aggregates.lastBlock,
    timeZone: aggregates.timeZone,
    ventasSinFecha: aggregates.undatedSalesCount,
    serieMensual: aggregates.monthlySeries,
    desglosePorTipo: aggregates.roomTypeBreakdown,
    rankingRevendidas: aggregates.topResold.slice(0, 5),
    totalVentasHistorico: history.length,
  };
  evidence.verificacionComplementaria = {
    accesibilidad: {
      suite: "apps/web/src/lib/a11y/a11y.test.ts",
      queVerifica:
        "contraste AA de las combinaciones declaradas y de los pares texto/fondo realmente usados, calculado sobre la paleta REAL (igualdad comprobada contra packages/config/tailwind/preset.cjs)",
    },
    guardianes: [
      "apps/web/src/lib/paused-guardian.test.ts (ninguna vista de compra ofrece lo que revertiría por pausa)",
      "apps/web/src/lib/reception-guardian.test.ts (los tres endpoints del pase usan el dueño on-chain)",
      "apps/web/src/lib/boundaries.test.ts (los módulos de cliente no arrastran el barril de servidor)",
    ],
  };
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(`\n=== M7 E2E COMPLETO — ${(evidence.comprobaciones as string[]).length} comprobaciones ===`);
  console.log(`Evidencia: ${evidencePath}`);
  for (const [name, hash] of Object.entries(evidence.transacciones as Record<string, string>)) {
    console.log(`  ${name.padEnd(18)} ${hash}`);
  }
}

/** Localiza una noche realmente quemada leyendo los eventos `Burn` de la cadena. */
async function findBurnedToken(client: PublicClient): Promise<bigint | null> {
  const head = await client.getBlockNumber();
  const chunk = 5_000n;
  const burnt: bigint[] = [];
  for (let from = 0n; from <= head; from += chunk) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    const logs = await client.getContractEvents({
      address: CONTRACT,
      abi: hotelNightsAbi,
      eventName: "Burn",
      fromBlock: from,
      toBlock: to,
      strict: true,
    });
    for (const log of logs) burnt.push(log.args.tokenId as bigint);
  }
  return burnt.length > 0 ? burnt[burnt.length - 1]! : null;
}

async function fetchJson<T>(server: Server, path: string): Promise<T> {
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  if (!response.ok) throw new Error(`El worker HTTP respondió ${response.status} en ${path}`);
  return (await response.json()) as T;
}

const closeServer = (server: Server): Promise<void> =>
  new Promise((done) => server.close(() => done()));

const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

main()
  .then(async () => {
    await closeDbPool().catch(() => undefined);
    setTimeout(() => process.exit(0), 100).unref();
  })
  .catch(async (error: unknown) => {
    console.error(`\nE2E M7 FALLIDO: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    await closeDbPool().catch(() => undefined);
    setTimeout(() => process.exit(1), 100).unref();
  });
