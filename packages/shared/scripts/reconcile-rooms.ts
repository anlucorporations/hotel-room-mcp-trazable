import { createPublicClient, http, parseAbiItem, type AbiEvent } from "viem";
import { GETLOGS_MAX_RANGE } from "../src/constants";
import { closeDbPool, getDbPool } from "../src/index";
import {
  auditRoomsVsChain,
  planMasterSeed,
  splitIndexAgainsChain,
  type ChainRoomRow,
  type DbRoomRow,
} from "../src/domain/room-reconciliation";
import { buildRoomSeed } from "../src/domain/room-registry";

/**
 * **Reconciliación de habitaciones e índice** tras el redeploy C2 (2026-10-18).
 *
 * Problema real que resuelve (documentado en `RepoTecnico/despliegue_gcp.md` §86.7):
 *   - La base `rooms` estaba **vacía** (0 habitaciones administradas) mientras el panel pintaba las
 *     50 del maestro del código.
 *   - El índice `nfts` conservaba **98 noches heredadas de C1** (74 `AVAILABLE`), de las que 68
 *     caían en la ventana del catálogo y se ofrecían al huésped… sin existir en el contrato C2.
 *   - La cadena C2 solo tiene registrada la habitación 201 y una noche (`20120261115`, en subasta).
 *
 * Qué hace (idempotente):
 *   1. Lee el registro on-chain (`RoomRegistered`/`RoomTypeUpdated`) y las noches minteadas (`Mint`).
 *   2. Siembra en `rooms` el **maestro canónico** que falte, en `DRAFT` (D-14): crea el inventario
 *      administrable sin publicar nada.
 *   3. Purga del índice las filas cuyo `tokenId` **no existe** en el contrato vigente (y sus
 *      `sale_events`/`listings` por FK, y `worker_sale_history` explícitamente).
 *   4. Audita `rooms` ↔ registro on-chain (existencia y tipo) y lo informa; no fuerza cambios de
 *      tipo (el maestro manda y un tipo mal on-chain exige ventana de contrato).
 *
 * Uso (dentro de la VPC, p. ej. job de Cloud Run):
 *   node --import tsx packages/shared/scripts/reconcile-rooms.ts            # modo seco
 *   node --import tsx packages/shared/scripts/reconcile-rooms.ts --apply    # ejecuta
 *   ... --apply --no-seed                                                   # sin sembrar el maestro
 *
 * Entorno: `DATABASE_URL`, `RPC_URL`, `CONTRACT_ADDRESS`, `DEPLOYMENT_BLOCK`.
 */

const apply = process.argv.includes("--apply");
const seedMaster = !process.argv.includes("--no-seed");

const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const DEPLOYMENT_BLOCK = process.env.DEPLOYMENT_BLOCK;

if (!RPC_URL) throw new Error("falta RPC_URL en el entorno");
if (!CONTRACT_ADDRESS) throw new Error("falta CONTRACT_ADDRESS en el entorno");
if (!DEPLOYMENT_BLOCK) throw new Error("falta DEPLOYMENT_BLOCK en el entorno");

const address = CONTRACT_ADDRESS as `0x${string}`;
const fromBlock = BigInt(DEPLOYMENT_BLOCK);
const client = createPublicClient({ transport: http(RPC_URL) });
const pool = getDbPool();

const ROOM_REGISTERED = parseAbiItem("event RoomRegistered(uint256 indexed room, string roomType)");
const ROOM_TYPE_UPDATED = parseAbiItem("event RoomTypeUpdated(uint256 indexed room, string roomType)");
const MINT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);

/** getLogs paginado (Besu limita el rango a 5.000 bloques; misma constante que la app). */
async function paginatedLogs(event: AbiEvent): Promise<Array<{ args: Record<string, unknown> }>> {
  const head = await client.getBlockNumber();
  const range = BigInt(GETLOGS_MAX_RANGE);
  const logs: Array<{ args: Record<string, unknown> }> = [];
  for (let from = fromBlock; from <= head; from += range) {
    const to = from + range - 1n > head ? head : from + range - 1n;
    const chunk = await client.getLogs({ address, event, fromBlock: from, toBlock: to });
    logs.push(...(chunk as unknown as Array<{ args: Record<string, unknown> }>));
  }
  return logs;
}

interface ChainSnapshot {
  readonly head: bigint;
  readonly registeredRooms: Map<number, string>;
  readonly mintedTokenIds: Set<string>;
  readonly mintedByRoom: Map<number, number>;
}

async function readChain(): Promise<ChainSnapshot> {
  const head = await client.getBlockNumber();
  const [registered, updated, mints] = await Promise.all([
    paginatedLogs(ROOM_REGISTERED),
    paginatedLogs(ROOM_TYPE_UPDATED),
    paginatedLogs(MINT),
  ]);

  const registeredRooms = new Map<number, string>();
  for (const log of registered) {
    const room = Number(log.args.room as bigint);
    registeredRooms.set(room, String(log.args.roomType));
  }
  // El tipo vigente es el de la última actualización (los eventos llegan en orden de bloque).
  for (const log of updated) {
    const room = Number(log.args.room as bigint);
    if (registeredRooms.has(room)) registeredRooms.set(room, String(log.args.roomType));
  }

  const mintedTokenIds = new Set<string>();
  const mintedByRoom = new Map<number, number>();
  for (const log of mints) {
    mintedTokenIds.add((log.args.tokenId as bigint).toString());
    const room = Number(log.args.room as bigint);
    mintedByRoom.set(room, (mintedByRoom.get(room) ?? 0) + 1);
  }

  return { head, registeredRooms, mintedTokenIds, mintedByRoom };
}

async function main(): Promise<void> {
  const chain = await readChain();

  const roomsRes = await pool.query<{
    room_number: number;
    room_type: string;
    publication_status: string;
    archived_at: Date | null;
  }>("SELECT room_number, room_type, publication_status, archived_at FROM rooms ORDER BY room_number");
  const dbRooms: DbRoomRow[] = roomsRes.rows.map((row) => ({
    roomNumber: row.room_number,
    roomType: row.room_type,
    publicationStatus: row.publication_status,
    archivedAt: row.archived_at,
  }));

  const indexRes = await pool.query<{ token_id: string; room_number: number; status: string }>(
    "SELECT token_id, room_number, status FROM nfts ORDER BY token_id",
  );
  const split = splitIndexAgainsChain(
    indexRes.rows.map((row) => row.token_id),
    chain.mintedTokenIds,
  );

  const seed = buildRoomSeed();
  const pendingSeed = seedMaster
    ? planMasterSeed(new Set(dbRooms.map((room) => room.roomNumber)), seed)
    : [];
  const issues = auditRoomsVsChain({
    dbRooms,
    chainRooms: [...chain.registeredRooms.entries()].map(([room, roomType]) => ({
      room,
      roomType,
    })) satisfies ChainRoomRow[],
  });

  const counters = await pool.query<{
    contract_address: string | null;
    minted_count: number;
    last_block: string | null;
  }>("SELECT contract_address, minted_count, last_block FROM worker_aggregate_counters WHERE id = 0");

  const report = {
    rpc: RPC_URL,
    contract: CONTRACT_ADDRESS,
    head: chain.head.toString(),
    chain: {
      registeredRooms: [...chain.registeredRooms.entries()].sort((a, b) => a[0] - b[0]),
      mintedTokenIds: [...chain.mintedTokenIds].sort(),
      mintedByRoom: [...chain.mintedByRoom.entries()].sort((a, b) => a[0] - b[0]),
    },
    db: {
      rooms: dbRooms.length,
      nfts: indexRes.rows.length,
      nftsByStatus: Object.fromEntries(
        [...new Set(indexRes.rows.map((row) => row.status))].map((status) => [
          status,
          indexRes.rows.filter((row) => row.status === status).length,
        ]),
      ),
    },
    pendingSeedRooms: pendingSeed.map((room) => room.roomNumber),
    index: { keep: split.keep, stale: split.stale },
    roomIssues: issues,
    worker: counters.rows[0] ?? null,
  };

  console.log("REPORT " + JSON.stringify(report));

  if (!apply) {
    console.log("MODO SECO: no se ha escrito nada. Añade --apply para ejecutar la reconciliación.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (pendingSeed.length > 0) {
      const values: unknown[] = [];
      const tuples = pendingSeed.map((room, index) => {
        const base = index * 9;
        values.push(
          room.roomNumber,
          room.floor,
          room.roomType,
          room.capacity,
          room.beds,
          room.baseRateWei,
          room.descriptionEs,
          room.descriptionEn,
          room.descriptionRu,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::NUMERIC, $${base + 7}, $${base + 8}, $${base + 9})`;
      });
      await client.query(
        `INSERT INTO rooms (room_number, floor, room_type, capacity, beds, base_rate_wei,
                            description_es, description_en, description_ru)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (room_number) DO NOTHING`,
        values,
      );
    }

    if (split.stale.length > 0) {
      // `listings` y `sale_events` tienen FK ON DELETE CASCADE sobre nfts.
      await client.query("DELETE FROM nfts WHERE token_id = ANY($1::text[])", [split.stale]);
      await client.query("DELETE FROM worker_sale_history WHERE token_id = ANY($1::text[])", [
        split.stale,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const after = await pool.query<{ rooms: number; nfts: number; listings: number }>(
    `SELECT (SELECT COUNT(*)::INT FROM rooms) AS rooms,
            (SELECT COUNT(*)::INT FROM nfts) AS nfts,
            (SELECT COUNT(*)::INT FROM listings) AS listings`,
  );
  console.log("APPLIED " + JSON.stringify(after.rows[0]));
  console.log("reconciliación completada: maestro sembrado y índice alineado con la cadena vigente");
}

try {
  await main();
} finally {
  await closeDbPool();
}
