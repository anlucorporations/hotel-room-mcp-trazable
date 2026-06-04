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
  decodeTokenId,
  roomTypeOf,
  type NightType,
  type SaleType,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress, deploymentBlock } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";

/**
 * Lectura del catálogo por RPC sin indexador (ADR-09):
 *   - DISPONIBLE (primaria): noches minteadas sin venta, en la ventana, no expiradas.
 *   - LISTADA_SECUNDARIO (reventa): noches con listado activo (de los eventos `Listed`,
 *     confirmadas con `listingOf`), en la ventana, no expiradas.
 * `getLogs` se pagina en chunks ≤ `GETLOGS_MAX_RANGE` desde el `deploymentBlock`.
 */
export interface NightView {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
  readonly priceWei: string;
  readonly saleType: SaleType;
}

const MINT_EVENT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const SALE_EVENT = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);
const LISTED_EVENT = parseAbiItem(
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
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
    ranges.map(({ from, to }) => client.getLogs({ address, event, fromBlock: from, toBlock: to })),
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

const inWindow = (date: number, today: number, end: number): boolean =>
  date >= today && date <= end;

/** Noches comprables (DISPONIBLE + LISTADA_SECUNDARIO) en la ventana, ordenadas por fecha. */
export async function fetchCatalog(): Promise<NightView[]> {
  const client = serverPublicClient();
  const address = contractAddress;
  const head = await client.getBlockNumber();

  const [mints, sales, listed] = await Promise.all([
    paginatedLogs(client, address, MINT_EVENT, deploymentBlock, head),
    paginatedLogs(client, address, SALE_EVENT, deploymentBlock, head),
    paginatedLogs(client, address, LISTED_EVENT, deploymentBlock, head),
  ]);

  const { today, end } = windowBounds();
  const sold = new Set(sales.map((log) => (log.args.tokenId ?? 0n).toString()));
  const byToken = new Map<string, NightView>();

  // DISPONIBLE (primaria): minteadas sin venta, en ventana.
  for (const log of mints) {
    const { tokenId, room, dateYYYYMMDD, price } = log.args;
    if (tokenId === undefined || room === undefined || dateYYYYMMDD === undefined || price === undefined) {
      continue;
    }
    const id = tokenId.toString();
    const date = Number(dateYYYYMMDD);
    if (sold.has(id) || !inWindow(date, today, end)) continue;
    const type = roomTypeOf(Number(room));
    if (!type) continue;
    byToken.set(id, { tokenId: id, room: Number(room), dateYYYYMMDD: date, type, priceWei: price.toString(), saleType: "PRIMARY" });
  }

  // LISTADA_SECUNDARIO: candidatas de `Listed`, confirmadas con `listingOf` (estado actual).
  // Cada lectura se aísla: un revert puntual no debe tumbar todo el catálogo (resiliencia).
  const candidates = [...new Set(listed.map((log) => (log.args.tokenId ?? 0n).toString()))];
  const listings = await Promise.all(
    candidates.map(async (id) => {
      try {
        return await client.readContract({
          address,
          abi: hotelNightsAbi,
          functionName: "listingOf",
          args: [BigInt(id)],
        });
      } catch {
        return null;
      }
    }),
  );
  candidates.forEach((id, i) => {
    const listing = listings[i];
    if (!listing?.active) return;
    const { room, dateYYYYMMDD: date } = decodeTokenId(BigInt(id));
    if (!inWindow(date, today, end)) return;
    const type = roomTypeOf(room);
    if (!type) return;
    byToken.set(id, { tokenId: id, room, dateYYYYMMDD: date, type, priceWei: listing.price.toString(), saleType: "SECONDARY" });
  });

  return [...byToken.values()].sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}
