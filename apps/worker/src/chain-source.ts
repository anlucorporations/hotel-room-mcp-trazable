import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { roomTypeOf } from "@hotel/shared";
import type { ChainEvent, ChainSource, SaleEvent } from "./types";

/**
 * Implementación de {@link ChainSource} sobre viem (T1.4 + FASE 3).
 *
 * Lee la cabecera de la cadena y los eventos del contrato mediante `getContractEvents`, que
 * decodifica los argumentos a partir del ABI tipado (`hotelNightsAbi`). El cliente recibe el
 * `Chain` (anvil/besu) y la URL RPC por construcción (DIP: la elección de red la hace
 * `main.ts`, no este módulo).
 *
 * - `getSaleLogs`: solo eventos `Sale`, para el aviso por email (CU-10).
 * - `getDomainLogs`: `Mint`/`Sale`/`RoyaltyPaid`/`Burn`, para agregados/histórico (CU-09/11).
 */
export interface ViemChainSourceOptions {
  readonly rpcUrl: string;
  readonly chain: Chain;
  readonly contractAddress: `0x${string}`;
}

/** Log on-chain con localización ya garantizada (no pendiente: tiene tx/logIndex/bloque). */
type LocatedLog = {
  readonly transactionHash: `0x${string}`;
  readonly logIndex: number;
  readonly blockNumber: bigint;
};

const isLocated = <T extends {
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  blockNumber: bigint | null;
}>(
  log: T,
): log is T & LocatedLog =>
  log.transactionHash !== null &&
  log.logIndex !== null &&
  log.blockNumber !== null;

export class ViemChainSource implements ChainSource {
  private readonly client: PublicClient;
  private readonly contractAddress: `0x${string}`;

  constructor(options: ViemChainSourceOptions) {
    this.client = createPublicClient({
      chain: options.chain,
      transport: http(options.rpcUrl),
    });
    this.contractAddress = options.contractAddress;
  }

  async getHeadBlock(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async getSaleLogs(fromBlock: bigint, toBlock: bigint): Promise<SaleEvent[]> {
    const logs = await this.client.getContractEvents({
      address: this.contractAddress,
      abi: hotelNightsAbi,
      eventName: "Sale",
      fromBlock,
      toBlock,
      strict: true,
    });

    return logs.filter(isLocated).map((log) => ({
      tokenId: log.args.tokenId,
      seller: log.args.seller,
      buyer: log.args.buyer,
      priceWei: log.args.price,
      saleTypeRaw: log.args.saleType,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
    }));
  }

  async getDomainLogs(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ChainEvent[]> {
    const range = { fromBlock, toBlock, strict: true } as const;
    const base = { address: this.contractAddress, abi: hotelNightsAbi } as const;
    const [mints, sales, royalties, burns] = await Promise.all([
      this.client.getContractEvents({ ...base, eventName: "Mint", ...range }),
      this.client.getContractEvents({ ...base, eventName: "Sale", ...range }),
      this.client.getContractEvents({ ...base, eventName: "RoyaltyPaid", ...range }),
      this.client.getContractEvents({ ...base, eventName: "Burn", ...range }),
    ]);

    const events: ChainEvent[] = [
      ...mints.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "mint",
          tokenId: log.args.tokenId,
          room: Number(log.args.room),
          dateYYYYMMDD: Number(log.args.dateYYYYMMDD),
          // Si el evento omitiera roomType, derivamos del room (defensa en profundidad).
          roomType: log.args.roomType || roomTypeOf(Number(log.args.room)) || "desconocido",
          priceWei: log.args.price,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
      ...sales.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "sale",
          tokenId: log.args.tokenId,
          seller: log.args.seller,
          buyer: log.args.buyer,
          priceWei: log.args.price,
          saleTypeRaw: log.args.saleType,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
      ...royalties.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "royaltyPaid",
          tokenId: log.args.tokenId,
          receiver: log.args.receiver,
          amountWei: log.args.amount,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
      ...burns.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "burn",
          tokenId: log.args.tokenId,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
    ];

    // Orden total determinista: por bloque asc y, en empate, por logIndex asc.
    return events.sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? Number(a.blockNumber - b.blockNumber)
        : a.logIndex - b.logIndex,
    );
  }
}
