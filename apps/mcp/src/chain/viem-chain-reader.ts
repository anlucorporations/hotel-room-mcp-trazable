import {
  createPublicClient,
  http,
  parseAbiItem,
  type AbiEvent,
  type Address,
  type Chain,
  type GetLogsReturnType,
  type PublicClient,
} from "viem";
import { GETLOGS_MAX_RANGE } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import type { ChainReader, MintRecord, NightSignals } from "./chain-reader";

export interface ViemChainReaderOptions {
  readonly rpcUrl: string;
  readonly chain: Chain;
  readonly contractAddress: Address;
  readonly deploymentBlock: bigint;
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

/** Funciones de lectura del contrato que necesita el adaptador (con un único arg `tokenId`). */
type ReadFn = "soldOnce" | "isExpired" | "listingOf" | "priceOf" | "ownerOf";

const uniqueTokenIds = (ids: readonly (bigint | undefined)[]): bigint[] => [
  ...new Set(ids.filter((id): id is bigint => id !== undefined)),
];

/**
 * Adaptador viem del puerto {@link ChainReader} (solo lectura). Pagina `getLogs` en chunks
 * ≤ `GETLOGS_MAX_RANGE` desde el bloque de despliegue (ADR-09, sin indexador) y deriva las
 * señales de cada noche con los getters del contrato. No firma ni custodia claves.
 */
export class ViemChainReader implements ChainReader {
  private readonly client: PublicClient;
  private readonly address: Address;
  private readonly deploymentBlock: bigint;

  constructor(options: ViemChainReaderOptions) {
    this.client = createPublicClient({ chain: options.chain, transport: http(options.rpcUrl) });
    this.address = options.contractAddress;
    this.deploymentBlock = options.deploymentBlock;
  }

  getHeadBlock(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  private async blockRanges(): Promise<Array<{ from: bigint; to: bigint }>> {
    const head = await this.client.getBlockNumber();
    const range = BigInt(GETLOGS_MAX_RANGE);
    const ranges: Array<{ from: bigint; to: bigint }> = [];
    for (let from = this.deploymentBlock; from <= head; from += range) {
      ranges.push({ from, to: from + range - 1n > head ? head : from + range - 1n });
    }
    return ranges;
  }

  private async getEventLogs<TEvent extends AbiEvent>(
    event: TEvent,
  ): Promise<GetLogsReturnType<TEvent>> {
    const ranges = await this.blockRanges();
    const chunks = await Promise.all(
      ranges.map(({ from, to }) =>
        this.client.getLogs({ address: this.address, event, fromBlock: from, toBlock: to }),
      ),
    );
    return chunks.flat() as GetLogsReturnType<TEvent>;
  }

  async getMintRecords(): Promise<MintRecord[]> {
    const logs = await this.getEventLogs(MINT_EVENT);
    return logs.flatMap((log) => {
      const { tokenId, room, dateYYYYMMDD, price } = log.args;
      if (tokenId === undefined || room === undefined || dateYYYYMMDD === undefined || price === undefined) {
        return [];
      }
      return [{ tokenId, room: Number(room), dateYYYYMMDD: Number(dateYYYYMMDD), priceWei: price }];
    });
  }

  async getSoldTokenIds(): Promise<Set<string>> {
    const logs = await this.getEventLogs(SALE_EVENT);
    return new Set(uniqueTokenIds(logs.map((log) => log.args.tokenId)).map((id) => id.toString()));
  }

  async getListedTokenIds(): Promise<bigint[]> {
    const logs = await this.getEventLogs(LISTED_EVENT);
    return uniqueTokenIds(logs.map((log) => log.args.tokenId));
  }

  async getPurchasedTokenIds(wallet: Address): Promise<bigint[]> {
    const ranges = await this.blockRanges();
    const chunks = await Promise.all(
      ranges.map(({ from, to }) =>
        this.client.getLogs({
          address: this.address,
          event: SALE_EVENT,
          args: { buyer: wallet },
          fromBlock: from,
          toBlock: to,
        }),
      ),
    );
    return uniqueTokenIds(chunks.flat().map((log) => log.args.tokenId));
  }

  async getNightSignals(tokenId: bigint): Promise<NightSignals> {
    // Un único `Promise.all` con las 5 lecturas en paralelo (antes: `ownerOf` secuencial + 4 reads,
    // dos viajes RPC encadenados → UX#27/N+1). La existencia se infiere de `ownerOf`: revierte si el
    // token no existe (no minteado o quemado), así que se captura el revert → `exists:false`.
    // `soldOnce`/`isExpired`/`listingOf`/`priceOf` no revierten para tokens inexistentes (devuelven
    // los defaults del mapping), por eso `ownerOf` es el único oráculo fiable de existencia.
    const [exists, soldOnce, expired, listing, primaryPriceWei] = await Promise.all([
      this.tokenExists(tokenId),
      this.read("soldOnce", tokenId) as Promise<boolean>,
      this.read("isExpired", tokenId) as Promise<boolean>,
      this.read("listingOf", tokenId) as Promise<{ price: bigint; active: boolean }>,
      this.read("priceOf", tokenId) as Promise<bigint>,
    ]);
    if (!exists) {
      return { exists: false, soldOnce: false, expired: false, listed: false, primaryPriceWei: 0n, listingPriceWei: 0n };
    }
    return {
      exists: true,
      soldOnce,
      expired,
      listed: listing.active,
      primaryPriceWei,
      listingPriceWei: listing.active ? listing.price : 0n,
    };
  }

  async isOwnedBy(tokenId: bigint, wallet: Address): Promise<boolean> {
    try {
      const owner = (await this.read("ownerOf", tokenId)) as Address;
      return owner.toLowerCase() === wallet.toLowerCase();
    } catch {
      return false;
    }
  }

  private async tokenExists(tokenId: bigint): Promise<boolean> {
    try {
      await this.read("ownerOf", tokenId);
      return true;
    } catch {
      return false; // ownerOf revierte si el token no existe (no minteado o quemado).
    }
  }

  private read(functionName: ReadFn, tokenId: bigint): Promise<unknown> {
    return this.client.readContract({
      address: this.address,
      abi: hotelNightsAbi,
      functionName,
      args: [tokenId],
    });
  }
}
