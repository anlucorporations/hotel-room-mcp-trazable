import "server-only";
import { parseAbiItem, type Address, type PublicClient } from "viem";
import { GETLOGS_MAX_RANGE } from "@hotel/shared/domain";
import { nightAuctionAbi } from "@hotel/shared/abi";
import { auctionAddress, auctionDeploymentBlock } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";
import {
  auctionStructToRaw,
  buildAuctionItem,
  sortAuctionItems,
  type AuctionItem,
  type AuctionRaw,
  type AuctionStruct,
} from "@/lib/auction-view";

/**
 * Lectura de la subasta **solo on-chain** (C2 · RF-13, decisión B6: sin tablas nuevas ni indexador).
 *
 * El contrato no enumera sus subastas (es un `mapping`), así que la vista se construye escaneando
 * `AuctionCreated` desde el bloque de despliegue —con el mismo paginado acotado que el catálogo— y
 * leyendo después el estado autoritativo de cada subasta con `auctionOf`. Si la subasta no está
 * desplegada en este entorno, la página lo dice (`configured: false`) en vez de inventar una
 * dirección; si el RPC falla, degrada (`degraded: true`) sin tumbar la navegación (ADR-09).
 */
const AUCTION_CREATED = parseAbiItem(
  "event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 reservePrice, uint64 startTime, uint64 endTime)",
);

/** Concurrencia acotada del escaneo (mismo criterio que el catálogo). */
const RPC_CONCURRENCY = 4;

export interface AuctionsResult {
  /** `false` si no hay `NEXT_PUBLIC_AUCTION_ADDRESS` en este entorno. */
  readonly configured: boolean;
  /** `true` si el RPC no respondió; la página muestra el estado degradado. */
  readonly degraded: boolean;
  readonly items: AuctionItem[];
}

export async function fetchAuctions(nowSeconds?: bigint): Promise<AuctionsResult> {
  const address = auctionAddress;
  if (!address) return { configured: false, degraded: false, items: [] };

  try {
    const client = serverPublicClient();
    const [head, block] = await Promise.all([
      client.getBlockNumber(),
      client.getBlock({ blockTag: "latest" }),
    ]);

    const creations = await scanCreations(client, address, auctionDeploymentBlock, head);
    const tokenIds = latestPerToken(creations);
    const now = nowSeconds ?? block.timestamp;

    const raws = await Promise.all(tokenIds.map((tokenId) => readAuction(client, address, tokenId)));
    const items = raws
      .filter((raw): raw is AuctionRaw => raw !== null)
      .map((raw) => buildAuctionItem(raw, now));

    return { configured: true, degraded: false, items: sortAuctionItems(items) };
  } catch {
    return { configured: true, degraded: true, items: [] };
  }
}

/**
 * `tokenId`s con subasta **viva** (abierta o pendiente de empezar, que el contrato ya reporta como
 * `OPEN`). La consume el catálogo para no ofrecer en venta directa una noche que está en subasta.
 * Si no hay subasta configurada o el RPC falla, devuelve un conjunto vacío: el catálogo no se rompe.
 */
export async function fetchAuctionedTokenIds(): Promise<ReadonlySet<string>> {
  const address = auctionAddress;
  if (!address) return new Set();

  try {
    const client = serverPublicClient();
    const head = await client.getBlockNumber();
    const creations = await scanCreations(client, address, auctionDeploymentBlock, head);
    const tokenIds = latestPerToken(creations);

    const states = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const state = (await client.readContract({
          address,
          abi: nightAuctionAbi,
          functionName: "stateOf",
          args: [tokenId],
        })) as number;
        return { tokenId: tokenId.toString(), state };
      }),
    );
    // `AuctionState.OPEN == 1` (el contrato reporta OPEN también antes de la hora de inicio).
    return new Set(states.filter((entry) => entry.state === 1).map((entry) => entry.tokenId));
  } catch {
    return new Set();
  }
}

/** Paginado de `getLogs` en tramos de `GETLOGS_MAX_RANGE` con concurrencia acotada. */
async function scanCreations(
  client: PublicClient,
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<readonly { tokenId: bigint; blockNumber: bigint }[]> {
  if (toBlock < fromBlock) return [];

  const range = BigInt(GETLOGS_MAX_RANGE);
  const ranges: Array<{ from: bigint; to: bigint }> = [];
  for (let from = fromBlock; from <= toBlock; from += range) {
    ranges.push({ from, to: from + range - 1n > toBlock ? toBlock : from + range - 1n });
  }

  const out: { tokenId: bigint; blockNumber: bigint }[] = [];
  for (let i = 0; i < ranges.length; i += RPC_CONCURRENCY) {
    const batch = ranges.slice(i, i + RPC_CONCURRENCY);
    const chunks = await Promise.all(
      batch.map(({ from, to }) =>
        client.getLogs({ address, event: AUCTION_CREATED, fromBlock: from, toBlock: to }),
      ),
    );
    for (const logs of chunks) {
      for (const log of logs) {
        if (log.args.tokenId === undefined) continue;
        out.push({ tokenId: log.args.tokenId, blockNumber: log.blockNumber ?? 0n });
      }
    }
  }
  return out;
}

/**
 * Una noche puede subastarse varias veces (p. ej. tras cancelar), así que solo interesa la creación
 * **más reciente**: `auctionOf` guarda el estado vigente.
 */
export function latestPerToken(
  creations: readonly { tokenId: bigint; blockNumber: bigint }[],
): bigint[] {
  const byToken = new Map<string, { tokenId: bigint; blockNumber: bigint }>();
  for (const creation of creations) {
    const key = creation.tokenId.toString();
    const current = byToken.get(key);
    if (!current || creation.blockNumber >= current.blockNumber) byToken.set(key, creation);
  }
  return [...byToken.values()].map((entry) => entry.tokenId);
}

/**
 * Estado autoritativo de una subasta + datos de su noche.
 *
 * viem devuelve el `struct` como **objeto con nombre** (no tupla): el mapeo vive en
 * `auctionStructToRaw`, que es puro y está probado. `null` si esa noche no tiene subasta
 * (`tokenId == 0`), lo que descarta un `AuctionCreated` de una subasta ya reabierta.
 */
async function readAuction(
  client: PublicClient,
  address: Address,
  tokenId: bigint,
): Promise<AuctionRaw | null> {
  const struct = (await client.readContract({
    address,
    abi: nightAuctionAbi,
    functionName: "auctionOf",
    args: [tokenId],
  })) as unknown as AuctionStruct;

  return auctionStructToRaw(struct, tokenId);
}
