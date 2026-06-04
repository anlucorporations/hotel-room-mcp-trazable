import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import type { ChainSource, SaleEvent } from "./types";

/**
 * Implementación de {@link ChainSource} sobre viem (T1.4).
 *
 * Lee la cabecera de la cadena y los eventos `Sale` del contrato mediante `getContractEvents`,
 * que decodifica los argumentos a partir del ABI tipado (`hotelNightsAbi`). El cliente recibe
 * el `Chain` (anvil/besu) y la URL RPC por construcción (DIP: la elección de red la hace
 * `main.ts`, no este módulo).
 */
export interface ViemChainSourceOptions {
  readonly rpcUrl: string;
  readonly chain: Chain;
  readonly contractAddress: `0x${string}`;
}

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

    return logs
      .filter(
        (log): log is typeof log & {
          transactionHash: `0x${string}`;
          logIndex: number;
          blockNumber: bigint;
        } =>
          log.transactionHash !== null &&
          log.logIndex !== null &&
          log.blockNumber !== null,
      )
      .map((log) => ({
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
}
