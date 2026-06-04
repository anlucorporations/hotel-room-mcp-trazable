import {
  parseAbiItem,
  type AbiEvent,
  type Address,
  type GetLogsReturnType,
  type PublicClient,
} from "viem";
import {
  CATALOG_WINDOW_DAYS,
  GETLOGS_MAX_RANGE,
  roomTypeOf,
  type NightType,
} from "@hotel/shared";
import { contractAddress } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";

/**
 * Lectura del catálogo por RPC sin indexador (ADR-09): se derivan las noches disponibles de
 * los eventos `Mint` menos las vendidas (`Sale`), dentro de la ventana `CATALOG_WINDOW_DAYS`.
 * `getLogs` se pagina en chunks ≤ `GETLOGS_MAX_RANGE` desde el `deploymentBlock`.
 */
export interface NightView {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
  readonly priceWei: string;
}

const MINT_EVENT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const SALE_EVENT = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);

async function paginatedLogs<TEvent extends AbiEvent>(
  client: PublicClient,
  address: Address,
  event: TEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<GetLogsReturnType<TEvent>> {
  const range = BigInt(GETLOGS_MAX_RANGE);
  const ranges: Array<{ from: bigint; to: bigint }> = [];
  for (let from = fromBlock; from <= toBlock; from += range) {
    ranges.push({ from, to: from + range - 1n > toBlock ? toBlock : from + range - 1n });
  }
  const chunks = await Promise.all(
    ranges.map(({ from, to }) =>
      client.getLogs({ address, event, fromBlock: from, toBlock: to }),
    ),
  );
  return chunks.flat() as GetLogsReturnType<TEvent>;
}

function yyyymmdd(date: Date): number {
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function windowBounds(): { today: number; end: number } {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + CATALOG_WINDOW_DAYS);
  return { today: yyyymmdd(now), end: yyyymmdd(end) };
}

/** Noches disponibles (DISPONIBLE) dentro de la ventana, ordenadas por fecha ascendente. */
export async function fetchAvailableNights(): Promise<NightView[]> {
  const client = serverPublicClient();
  const address = contractAddress as Address;
  const deploymentBlock = BigInt(process.env.DEPLOYMENT_BLOCK ?? "0");
  const head = await client.getBlockNumber();

  const [mints, sales] = await Promise.all([
    paginatedLogs(client, address, MINT_EVENT, deploymentBlock, head),
    paginatedLogs(client, address, SALE_EVENT, deploymentBlock, head),
  ]);

  const sold = new Set(sales.map((log) => (log.args.tokenId ?? 0n).toString()));
  const { today, end } = windowBounds();

  const byToken = new Map<string, NightView>();
  for (const log of mints) {
    const tokenId = log.args.tokenId;
    const room = log.args.room;
    const date = log.args.dateYYYYMMDD;
    const price = log.args.price;
    if (tokenId === undefined || room === undefined || date === undefined || price === undefined) {
      continue;
    }
    const tokenIdStr = tokenId.toString();
    const dateNum = Number(date);
    if (sold.has(tokenIdStr)) continue; // ya vendida
    if (dateNum < today || dateNum > end) continue; // expirada o fuera de ventana
    const type = roomTypeOf(Number(room));
    if (!type) continue;
    byToken.set(tokenIdStr, {
      tokenId: tokenIdStr,
      room: Number(room),
      dateYYYYMMDD: dateNum,
      type,
      priceWei: price.toString(),
    });
  }

  return [...byToken.values()].sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}
