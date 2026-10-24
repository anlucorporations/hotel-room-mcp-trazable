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
  sellableRoomNumbers,
  toNightType,
  MaintenanceRepository,
  NFTsRepository,
  RoomsRepository,
  type NightType,
  type SaleType,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress, deploymentBlock } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";
import { excludeAuctionedNights } from "@/lib/auction-view";
import { fetchAuctionedTokenIds } from "@/lib/auctions";
import { roomCoverUrl } from "@/lib/room-image-url";

const nftsRepo = new NFTsRepository();
const roomsRepo = new RoomsRepository();
const maintenanceRepo = new MaintenanceRepository();

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
  /**
   * **Foto de la habitación** (2026-10-05), servida por `/api/rooms/images/<fichero>`.
   *
   * El catálogo se lee por RPC/base y solo conoce el **número** de habitación, así que la portada se
   * resuelve aparte contra el maestro (`room_images`). `null` = esa habitación no tiene foto todavía
   * y la tarjeta usa su imagen de reserva por tipo (nunca se inventa una foto ajena).
   */
  readonly coverUrl?: string | null;
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
 * Estado on-chain de una noche (§35 · defensa contra «fantasmas» del índice y del redeploy C1→C2).
 *
 * Tres estados útiles, sin colapsar el tercero en los otros dos (mismo patrón que
 * `onchain-ownership`):
 *   - `"sold"`     → el contrato confirmó `soldOnce == true`: NO es comprable como primaria.
 *   - `"missing"`  → el contrato NO conoce el token (`priceOf == 0`): es una fila **heredada** de
 *     otra cadena/contrato (el desfase real tras el redeploy C2 de 2026-10-17: 74 noches C1 en el
 *     índice que no existían en `0xF8b1…`). Comprarla revertiría con `ERC721NonexistentToken`.
 *   - `"free"`     → el contrato tiene el token y no está vendido: libre.
 *   - `"unknown"`  → no se pudo leer (RPC caído/revert): **se conserva** la noche —fallar en
 *     abierto aquí sería peor: ocultaría inventario sano ante un pico de red— y la re-verificación
 *     del paso «Revisar» sigue siendo la garantía final antes de firmar.
 */
export type OnChainSoldState = "sold" | "missing" | "free" | "unknown";

/** Lector inyectable (DIP): los tests no necesitan red. */
export interface SoldOnceReader {
  soldOnce(tokenId: bigint): Promise<boolean>;
}

/**
 * Lector de la **existencia** del token en el contrato canónico. `priceOf` es una lectura barata
 * que devuelve `0` para un `tokenId` que nunca se acuñó en ESTA cadena (el precio se fija en
 * `mint` y no puede ser 0), así que distingue «fila fantasma heredada» de «noche vendida» sin
 * depender de que `ownerOf` revierta.
 */
export interface NightChainReader extends SoldOnceReader {
  priceOf?(tokenId: bigint): Promise<bigint>;
}

/** Lector real: `priceOf` + `soldOnce` del contrato canónico por RPC (lecturas baratas). */
export const viemNightChainReader: NightChainReader = {
  priceOf: (tokenId) =>
    serverPublicClient().readContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "priceOf",
      args: [tokenId],
    }) as Promise<bigint>,
  soldOnce: (tokenId) =>
    serverPublicClient().readContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "soldOnce",
      args: [tokenId],
    }) as Promise<boolean>,
};

/**
 * Compatibilidad: lector de solo `soldOnce` que usaban las suites del guardián §35. Se mantiene
 * exportado porque es el contrato mínimo del filtro; el lector por defecto ya incluye `priceOf`.
 */
export const viemSoldOnceReader: SoldOnceReader = {
  soldOnce: viemNightChainReader.soldOnce,
};

/** Clasifica el resultado: solo `true` explícito retira la noche; todo lo demás se conserva. */
export function classifySoldOnce(read: boolean | null): OnChainSoldState {
  if (read === true) return "sold";
  if (read === false) return "free";
  return "unknown";
}

/**
 * Retira del catálogo las noches que el CONTRATO no considera vendibles, aunque el índice
 * PostgreSQL siga anunciándolas como `AVAILABLE`:
 *   1. `priceOf == 0` → el token no existe en la cadena vigente (fila heredada de C1 u otra red).
 *   2. `soldOnce == true` → ya se vendió (§35: worker desactualizado → noches fantasma → el huésped
 *      recibía «No pudimos verificar el precio on-chain» al reservarlas).
 *
 * Cada lectura se aísla: un revert o timeout puntual degrada a `unknown` y **conserva** la noche
 * (misma resiliencia que `fetchResaleMarket`). Concurrencia acotada con `RPC_CONCURRENCY`.
 */
export async function filterSoldOnChain(
  nights: readonly NightView[],
  reader: NightChainReader = viemNightChainReader,
): Promise<NightView[]> {
  const states = await mapWithConcurrency(nights, RPC_CONCURRENCY, async (night) => {
    const tokenId = BigInt(night.tokenId);
    if (reader.priceOf) {
      try {
        if ((await reader.priceOf(tokenId)) === 0n) return "missing";
      } catch {
        // Sin precio no se puede afirmar que no exista: se sigue con `soldOnce` y, si tampoco se
        // puede leer, la noche se conserva (fail-open).
      }
    }
    let read: boolean | null = null;
    try {
      read = await reader.soldOnce(tokenId);
    } catch {
      read = null;
    }
    return classifySoldOnce(read);
  });
  return nights.filter((_, index) => states[index] !== "sold" && states[index] !== "missing");
}

/**
 * Números de habitación **administrados y vendibles** en el canal público.
 *
 * Devuelve `null` si el maestro (`rooms`) no se pudo leer: en ese caso el catálogo no inventa una
 * lista vacía (sería un catálogo caído) ni ofrece a ciegas; el camino de RPC decide con la cadena.
 */
export async function loadSellableRoomNumbers(): Promise<Set<number> | null> {
  try {
    const [rooms, blocked] = await Promise.all([
      roomsRepo.listRooms(),
      maintenanceRepo.listBlockedRoomIds(),
    ]);
    return sellableRoomNumbers(rooms, new Set(blocked));
  } catch (error) {
    console.warn("[nights] no se pudo leer el maestro de habitaciones:", error);
    return null;
  }
}

/**
 * Intersección pura «noches del índice ∩ habitaciones vendibles». `null` = sin dato del maestro, no
 * se filtra (decisión del llamante, documentada arriba). Expuesta para pruebas sin BD/RPC.
 */
export function restrictToSellableRooms(
  nights: readonly NightView[],
  sellableNumbers: ReadonlySet<number> | null,
): NightView[] {
  if (sellableNumbers === null) return [...nights];
  return nights.filter((night) => sellableNumbers.has(night.room));
}

/**
 * Resultado del catálogo: la lista ofertable y **cuántas noches se ocultaron** porque las fuentes
 * off-chain las confirman vendidas (F9/§35). El contador existe para que la pantalla pueda ser
 * honesta: sin él, un índice desfasado se ve igual que un hotel lleno y el huésped no tiene forma
 * de saber que está viendo menos inventario del que hay.
 */
export interface CatalogResult {
  readonly nights: NightView[];
  /** Noches retiradas del catálogo porque la cadena no las considera vendibles (0 = limpio). */
  readonly hiddenSoldCount: number;
  /** Noches retiradas porque su habitación no está administrada/publicada en `rooms`. */
  readonly hiddenUnlistedCount: number;
}

/** Noche confirmada como vendida por el registro de eventos (F9). */
export interface GhostNight {
  readonly tokenId: string;
}

/**
 * Retira del catálogo las noches que el **registro de ventas** confirma primariamente vendidas,
 * aunque el índice siga ofreciéndolas. Corrección estructural del §35.
 *
 * La clasificación («índice dice libre / eventos dicen vendida») vive en
 * `@hotel/shared/domain` —`classifyNightIntegrity`/`shouldHideNight`— y se ejerce en la **consulta**
 * (`NFTsRepository.listGhostPrimarySales`: venta primaria, índice `AVAILABLE` y `NOT EXISTS` de
 * reventa activa). Aquí solo queda la proyección mecánica sobre la lista ya resuelta: retirar por
 * `tokenId`. Un `Set` para no escanear la lista por noche, sin red.
 *
 * Por qué la decisión está en SQL y no en este bucle: la exclusión de reventas activas necesita el
 * join con `listings`, que aquí no tenemos; duplicar la regla en memoria produciría dos verdades.
 */
export function excludeGhosts(
  nights: readonly NightView[],
  ghosts: readonly GhostNight[],
): NightView[] {
  if (ghosts.length === 0) return [...nights];
  // `Set` en lugar de escanear la lista por noche: el catálogo va a 100 noches y las fantasmas son
  // el caso raro, pero no queremos un O(n·m) en el camino de render.
  const ghostTokens = new Set(ghosts.map((ghost) => ghost.tokenId));
  return nights.filter((night) => !ghostTokens.has(night.tokenId));
}

/**
 * Catálogo PRIMARIO (RF-01, D-07): noches `DISPONIBLE` del hotel dentro de la ventana.
 *
 * Ya NO incorpora los listados de reventa: esos viven en `fetchResaleMarket()` y en su propia
 * vista. Una noche vendida en primaria deja de ofrecerse aquí aunque después se revenda.
 */
/**
 * Aplica el mapa de portadas a las noches. **Puro** y exportado para poder probarlo sin base de
 * datos: la decisión es «si la habitación tiene portada, esa; si no, ninguna» (la tarjeta decide
 * después su imagen de reserva).
 */
export function withCoverUrls(
  nights: readonly NightView[],
  covers: ReadonlyMap<number, { readonly fileName: string }>,
): NightView[] {
  return nights.map((night) => {
    const cover = covers.get(night.room);
    return { ...night, coverUrl: cover ? roomCoverUrl(cover.fileName) : null };
  });
}

/**
 * Resuelve la foto de la habitación de cada noche con **una sola consulta** al maestro.
 *
 * Falla en blando: si la lectura de portadas falla, las noches salen sin `coverUrl` y el catálogo
 * sigue funcionando con su imagen de reserva. Un fallo de fotos no puede tumbar la venta.
 */
export async function attachRoomCovers(nights: readonly NightView[]): Promise<NightView[]> {
  if (nights.length === 0) return [];
  try {
    const covers = await roomsRepo.listCoverImagesByRoomNumbers(nights.map((night) => night.room));
    return withCoverUrls(nights, covers);
  } catch (error) {
    console.warn("[nights] no se pudieron resolver las fotos de las habitaciones:", error);
    return withCoverUrls(nights, new Map());
  }
}

export async function fetchCatalog(): Promise<CatalogResult> {
  const { today, end } = windowBounds();

  // 1. Intento primario vía base de datos off-chain
  try {
    const catalog = await nftsRepo.queryCatalog({ status: "AVAILABLE", limit: 100 });
    if (catalog && catalog.items && catalog.items.length > 0) {
      const fromDb = catalog.items
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

      // «Lo administrado» es el maestro `rooms`, no el índice on-chain: una noche solo se oferta
      // si su habitación está publicada, vigente y sin avería (misma regla que /api/public/rooms).
      // Sin esto, el catálogo vendía 68 noches de la habitación 101 mientras el maestro llevaba
      // vacío desde el redeploy C2 (2026-10-18).
      const sellableNumbers = await loadSellableRoomNumbers();
      const administered = restrictToSellableRooms(fromDb, sellableNumbers);
      const hiddenUnlistedCount = Math.max(0, fromDb.length - administered.length);
      if (hiddenUnlistedCount > 0) {
        console.warn(
          `[fetchCatalog] ${hiddenUnlistedCount} noche(s) del índice no pertenecen a una habitación ` +
            `publicada del maestro: no se ofertan`,
        );
      }

      // F9 · capa estructural: el registro de ventas (eventos on-chain ya consolidados) es la
      // autoridad sobre si una noche primaria sigue siendo inventario del hotel. Si el índice dice
      // `AVAILABLE`, existe venta primaria y NO hay reventa activa, esa noche se retira **sin
      // preguntar a la red**. Cierra el §35 en su origen (worker desfasado → noches fantasma →
      // «No pudimos verificar el precio on-chain») y quita lecturas RPC del camino caliente.
      const ghosts = await nftsRepo.listGhostPrimarySales(Number(deploymentBlock));
      if (ghosts.length > 0) {
        // No es silencio: el desfase entre índice y eventos tiene que verse para poder accionar
        // (reconciliar/redesplegar el worker), que es justo lo que faltó la primera vez.
        console.warn(
          `[fetchCatalog] índice desfasado: ${ghosts.length} noche(s) vendida(s) aún AVAILABLE · ` +
            `tokens ${ghosts.map((ghost) => ghost.tokenId).join(", ")}`,
        );
      }
      const withoutGhosts = excludeGhosts(administered, ghosts);

      // §35 · segunda capa, on-chain: aunque ambas fuentes de BD cuadren, la verdad es del contrato.
      // `priceOf == 0` retira las filas heredadas de otra cadena/contrato; `soldOnce` retira las
      // vendidas. Se conserva lo que no se pudo leer (un pico de red no debe ocultar inventario).
      const nights = await filterSoldOnChain(withoutGhosts);
      // C2 (RF-13): una noche con subasta viva no está en venta directa (si se comprara por `buy`,
      // la liquidación ya no podría entregarla al ganador).
      const visible = excludeAuctionedNights(
        await attachRoomCovers(nights),
        await fetchAuctionedTokenIds(),
      );
      return {
        nights: visible,
        hiddenSoldCount: Math.max(0, withoutGhosts.length - nights.length),
        hiddenUnlistedCount,
      };
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

  // En el camino on-chain no hay nada que «ocultar»: `sold` sale de los propios logs, así que no
  // existe desfase entre dos fuentes y avisar de sincronización sería mentira.
  const fallbackNights = [...byToken.values()].sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
  // Misma intersección con el maestro administrado que en el camino de BD: si el maestro dice que
  // no hay habitaciones publicadas, la cadena tampoco puede ofrecerlas en el catálogo público.
  const sellableNumbers = await loadSellableRoomNumbers();
  const administered = restrictToSellableRooms(fallbackNights, sellableNumbers);
  // C2 (RF-13): mismo filtro que en el camino de BD: fuera las noches con subasta viva.
  const visible = excludeAuctionedNights(
    await attachRoomCovers(administered),
    await fetchAuctionedTokenIds(),
  );
  return {
    nights: visible,
    hiddenSoldCount: 0,
    hiddenUnlistedCount: Math.max(0, fallbackNights.length - administered.length),
  };
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

  return attachRoomCovers([...byToken.values()].sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD));
}
