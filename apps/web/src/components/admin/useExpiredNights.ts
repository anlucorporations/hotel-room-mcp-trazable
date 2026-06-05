"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  parseAbiItem,
  type AbiEvent,
  type Address,
  type GetLogsReturnType,
  type PublicClient,
} from "viem";
import { GETLOGS_MAX_RANGE } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress, deploymentBlock } from "@/config/chain";

/** Una noche del hotel candidata a `burn`: minteada, no vendida y expirada (CU-13). */
export interface ExpiredNight {
  readonly tokenId: string;
  readonly dateYYYYMMDD: number;
}

const MINT_EVENT = parseAbiItem(
  "event Mint(uint256 indexed tokenId, uint256 indexed room, uint256 dateYYYYMMDD, string roomType, uint256 price)",
);
const SALE_EVENT = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);

async function getLogsPaginated<TEvent extends AbiEvent>(
  client: PublicClient,
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
      client.getLogs({ address: contractAddress as Address, event, fromBlock: from, toBlock: to }),
    ),
  );
  return chunks.flat() as GetLogsReturnType<TEvent>;
}

/** ¿`tokenId` está expirado on-chain? Tolera revert (token quemado/inexistente) → no candidato. */
async function isExpired(client: PublicClient, tokenId: bigint): Promise<boolean> {
  try {
    return await client.readContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "isExpired",
      args: [tokenId],
    });
  } catch {
    return false;
  }
}

async function scanExpired(client: PublicClient): Promise<ExpiredNight[]> {
  const head = await client.getBlockNumber();
  const [mints, sales] = await Promise.all([
    getLogsPaginated(client, MINT_EVENT, deploymentBlock, head),
    getLogsPaginated(client, SALE_EVENT, deploymentBlock, head),
  ]);

  // Excluimos las noches vendidas alguna vez: son de clientes y NO se queman (CU-13 13d).
  const sold = new Set(sales.map((log) => (log.args.tokenId ?? 0n).toString()));

  const minted = new Map<string, number>();
  for (const log of mints) {
    const { tokenId, dateYYYYMMDD } = log.args;
    if (tokenId === undefined || dateYYYYMMDD === undefined) continue;
    const id = tokenId.toString();
    if (sold.has(id)) continue;
    minted.set(id, Number(dateYYYYMMDD));
  }

  const candidates = [...minted.keys()];
  const expiredFlags = await Promise.all(candidates.map((id) => isExpired(client, BigInt(id))));

  return candidates
    .filter((_, i) => expiredFlags[i])
    .map((id) => ({ tokenId: id, dateYYYYMMDD: minted.get(id) ?? 0 }))
    .sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}

/**
 * Escanea las noches del hotel caducadas candidatas a `burn` (CU-13), reutilizando la lectura
 * por eventos (como `lib/nights.ts`/`useMyNights`): `Mint` − `Sale` (vendidas excluidas) y
 * confirmación `isExpired`. El escaneo es por RPC y puede ser costoso en cadenas con muchos
 * eventos; por eso es bajo demanda (TanStack Query, `enabled` controlado) y el panel ofrece
 * además entrada manual de tokenIds como alternativa.
 */
export function useExpiredNights(enabled: boolean): UseQueryResult<ExpiredNight[], Error> {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["admin-expired", contractAddress],
    enabled: enabled && Boolean(client),
    queryFn: async (): Promise<ExpiredNight[]> => {
      if (!client) throw new Error("Cliente no disponible.");
      return scanExpired(client);
    },
  });
}
