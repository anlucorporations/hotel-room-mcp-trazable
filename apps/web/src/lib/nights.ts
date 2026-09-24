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
  toNightType,
  NFTsRepository,
  type NightType,
  type SaleType,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress, deploymentBlock } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";

const nftsRepo = new NFTsRepository();

/**
 * Lectura de la tienda, en **dos fuentes separadas** (D-07):
 *
 *   - `fetchCatalog()`     → catálogo PRIMARIO: inventario `DISPONIBLE` del hotel (RF-01).
 *   - `fetchResaleMarket()`→ mercado SECUNDARIO: solo listados de reventa vigentes.
 *
 * Hasta M4 la misma función mezclaba ambas y el catálogo mostraba reventas con una etiqueta;
 * D-07 lo prohíbe: cada flujo vive en su vista y construye su propio calldata (`buy` vs
 * `buyResale`). Comparten el escaneo paginado de logs y la ventana de fechas (DRY).
 *
 * Fuente primaria: base de datos PostgreSQL indexada vía `NFTsRepository`; si no está
 * disponible, degradación elegante a lectura RPC sin indexador (ADR-09). El mercado secundario
 * se lee siempre on-chain: `listingOf` es el estado autoritativo y no admite caché intermedia.
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

/**
 * Concurrencia máxima de peticiones RPC en vuelo (MAJOR#5). Acota el escaneo de `getLogs`
 * y las lecturas `listingOf` para no saturar el RPC ni disparar un degradado espurio.
 * 6 es un punto medio prudente para proveedores públicos sin batching agresivo.
 */
const RPC_CONCURRENCY = 6;

/**
 * Limitador de concurrencia minimalista (estilo p-limit) sin dependencias externas.
 * Aplica `task` a cada elemento conservando el orden del resultado, con como máximo
 * `limit` tareas resolviéndose en paralelo. Si una tarea rechaza, propaga el error.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!, index);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

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
  // Concurrencia acotada: evita lanzar todos los chunks a la vez contra el RPC (MAJOR#5).
  const chunks = await mapWithConcurrency(ranges, RPC_CONCURRENCY, ({ from, to }) =>
    client.getLogs({ address, event, fromBlock: from, toBlock: to }),
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

/**
 * ¿El contrato canónico está en pausa? (`Pausable`, M7).
 *
 * `buy`, `buyResale`, `mint`, `markCheckedIn` y `burnExpired` llevan `whenNotPaused`: con el
 * contrato en pausa revierten con `EnforcedPause`. Hasta M7 ninguna vista lo miraba, así que `/` y
 * `/reventa` seguían ofreciendo compras que la cadena iba a rechazar (deuda anotada por la
 * verificación adversarial de M4 y asignada a este hito).
 *
 * Falla en ABIERTO hacia el llamante (lanza): quien decide es la vista, que puede distinguir «el
 * contrato está en pausa» de «no se pudo comprobar» y decir la verdad en cada caso.
 */
export async function fetchContractPaused(): Promise<boolean> {
  const client = serverPublicClient();
  const paused = await client.readContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  return paused === true;
}

/**
 * Catálogo PRIMARIO (RF-01, D-07): noches `DISPONIBLE` del hotel dentro de la ventana.
 *
 * Ya NO incorpora los listados de reventa: esos viven en `fetchResaleMarket()` y en su propia
 * vista. Una noche vendida en primaria deja de ofrecerse aquí aunque después se revenda.
 */
export async function fetchCatalog(): Promise<NightView[]> {
  const { today, end } = windowBounds();

  // 1. Intento primario vía base de datos off-chain
  try {
    const catalog = await nftsRepo.queryCatalog({ status: "AVAILABLE", limit: 100 });
    if (catalog && catalog.items && catalog.items.length > 0) {
      return catalog.items
        .map((nft) => {
          const parts = nft.checkInDate.split("-").map(Number);
          const y = parts[0] ?? 2026;
          const m = parts[1] ?? 7;
          const d = parts[2] ?? 20;
          const dateYYYYMMDD = y * 10_000 + m * 100 + d;
          // El tipo del índice es el del maestro (`SIMPLE`/`DOBLE`/`SUITE`). Antes esto era
          // `=== "suite" ? "suite" : "simple"`, así que una habitación doble se servía como simple:
          // el tipo que el cliente pidió desaparecía al pasar por la base de datos (M9).
          const type: NightType =
            toNightType(nft.roomType) ?? roomTypeOf(Number(nft.roomNumber)) ?? "simple";
          return {
            tokenId: nft.tokenId,
            room: nft.roomNumber,
            dateYYYYMMDD,
            type,
            priceWei: nft.basePriceWei,
            saleType: "PRIMARY" as SaleType,
          };
        })
        // La ventana se aplica TAMBIÉN al camino de BD (hallazgo de la verificación de M4): el
        // índice puede contener noches caducadas o fuera de los 90 días, y `buy` las rechazaría
        // con `NightExpired`. El catálogo no debe ofrecer lo que la cadena va a revertir.
        .filter((night) => inWindow(night.dateYYYYMMDD, today, end))
        .sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
    }
  } catch (dbErr) {
    // Si la BD no está disponible, degradación elegante al RPC on-chain
    console.warn("[fetchCatalog] Fallback a escaneo RPC:", dbErr);
  }

  // 2. Fallback on-chain por RPC
  const client = serverPublicClient();
  const address = contractAddress;
  const head = await client.getBlockNumber();

  const [mints, sales] = await Promise.all([
    paginatedLogs(client, address, MINT_EVENT, deploymentBlock, head),
    paginatedLogs(client, address, SALE_EVENT, deploymentBlock, head),
  ]);

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

  return [...byToken.values()].sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}

/**
 * Mercado SECUNDARIO (D-07): listados de reventa vigentes, con su propio flujo de compra
 * (`buyResale`). La fuente es on-chain y el estado autoritativo es `listingOf`.
 *
 * Se descartan las noches que el contrato rechazaría al comprarlas, para no ofrecer una compra
 * imposible (la UI no debe anunciar lo que la cadena va a revertir):
 *   - `active == false`  → listado cancelado o ya vendido (`NotListed`).
 *   - `isCheckedIn`      → noche consumida en recepción después de listarse (`NightNotResellable`).
 *   - fuera de ventana   → fecha pasada (`NightExpired`).
 */
export async function fetchResaleMarket(): Promise<NightView[]> {
  const client = serverPublicClient();
  const address = contractAddress;
  const head = await client.getBlockNumber();

  const listed = await paginatedLogs(client, address, LISTED_EVENT, deploymentBlock, head);
  const candidates = [...new Set(listed.map((log) => (log.args.tokenId ?? 0n).toString()))];

  // Cada lectura se aísla: un revert puntual no debe tumbar todo el mercado (resiliencia).
  const states = await mapWithConcurrency(candidates, RPC_CONCURRENCY, async (id) => {
    try {
      const listing = await client.readContract({
        address,
        abi: hotelNightsAbi,
        functionName: "listingOf",
        args: [BigInt(id)],
      });
      if (!listing?.active) return null;
      const checkedIn = await client.readContract({
        address,
        abi: hotelNightsAbi,
        functionName: "isCheckedIn",
        args: [BigInt(id)],
      });
      return { listing, checkedIn: checkedIn === true };
    } catch {
      return null;
    }
  });

  const { today, end } = windowBounds();
  const byToken = new Map<string, NightView>();
  candidates.forEach((id, i) => {
    const state = states[i];
    if (!state || state.checkedIn) return;
    const { room, dateYYYYMMDD: date } = decodeTokenId(BigInt(id));
    if (!inWindow(date, today, end)) return;
    const type = roomTypeOf(room);
    if (!type) return;
    byToken.set(id, {
      tokenId: id,
      room,
      dateYYYYMMDD: date,
      type,
      priceWei: state.listing.price.toString(),
      saleType: "SECONDARY",
    });
  });

  /**
   * Si había listados que leer y NINGUNA lectura respondió, el problema no es «no hay reventa»
   * sino que no se pudo consultar la cadena: devolver una lista vacía sería una mentira que
   * oculta noches comprables (hallazgo de la verificación de M4). Se propaga para que la vista
   * muestre su estado degradado, que sí es honesto.
   */
  if (candidates.length > 0 && states.every((state) => state === null)) {
    throw new Error(
      `No se pudo leer ninguno de los ${candidates.length} listados de reventa (¿RPC caído?).`,
    );
  }

  return [...byToken.values()].sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}
