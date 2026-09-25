"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  parseAbiItem,
  type Address,
  type GetLogsReturnType,
  type PublicClient,
} from "viem";
import { GETLOGS_MAX_RANGE, decodeTokenId, roomTypeOf, type NightType } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress, deploymentBlock } from "@/config/chain";

/** Una noche que el usuario posee actualmente, con su estado de reventa (CU-06/07, docs/SRS.md §9). */
export interface OwnedNight {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
  /** Listado activo de reventa, o `null` si no está en venta. */
  readonly listingPriceWei: string | null;
}

export interface MyNightsData {
  readonly nights: readonly OwnedNight[];
  /** Saldo pendiente de cobro (wei) de reventas vendidas. */
  readonly pendingWei: string;
}

const SALE_EVENT = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);

type SaleLogs = GetLogsReturnType<typeof SALE_EVENT>;

/**
 * Pagina los eventos `Sale` de un comprador en chunks ≤ `GETLOGS_MAX_RANGE` desde el bloque
 * de despliegue. Filtra on-chain por `buyer` (topic indexado) para minimizar el payload.
 */
async function paginatedSaleLogs(
  client: PublicClient,
  args: { address: Address; fromBlock: bigint; toBlock: bigint; buyer: Address },
): Promise<SaleLogs> {
  const range = BigInt(GETLOGS_MAX_RANGE);
  const ranges: Array<{ from: bigint; to: bigint }> = [];
  for (let from = args.fromBlock; from <= args.toBlock; from += range) {
    const to = from + range - 1n > args.toBlock ? args.toBlock : from + range - 1n;
    ranges.push({ from, to });
  }
  const chunks = await Promise.all(
    ranges.map(({ from, to }) =>
      client.getLogs({
        address: args.address,
        event: SALE_EVENT,
        args: { buyer: args.buyer },
        fromBlock: from,
        toBlock: to,
      }),
    ),
  );
  return chunks.flat();
}

/** ¿`address` es la propietaria actual de `tokenId`? Tolera el revert si el token se quemó. */
async function ownsToken(
  client: PublicClient,
  address: Address,
  tokenId: bigint,
): Promise<boolean> {
  try {
    const owner = await client.readContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
    return owner.toLowerCase() === address.toLowerCase();
  } catch {
    // ownerOf revierte si el token no existe (quemado): ya no es del usuario.
    return false;
  }
}

async function loadMyNights(
  client: PublicClient,
  address: Address,
): Promise<MyNightsData> {
  const head = await client.getBlockNumber();

  // 1) Candidatas: tokens que el usuario compró alguna vez (eventos `Sale` como comprador).
  const sales = await paginatedSaleLogs(client, {
    address: contractAddress,
    fromBlock: deploymentBlock,
    toBlock: head,
    buyer: address,
  });
  const candidates = [
    ...new Set(
      sales
        .map((log) => log.args.tokenId)
        .filter((id): id is bigint => id !== undefined)
        .map((id) => id.toString()),
    ),
  ];

  // 2) Propiedad actual: confirma con `ownerOf` (el usuario pudo revender/transferir).
  const ownership = await Promise.all(
    candidates.map((id) => ownsToken(client, address, BigInt(id))),
  );
  const owned = candidates.filter((_, i) => ownership[i]);

  // 3) Estado de reventa de cada noche poseída (`listingOf`).
  const listings = await Promise.all(
    owned.map((id) =>
      client.readContract({
        address: contractAddress,
        abi: hotelNightsAbi,
        functionName: "listingOf",
        args: [BigInt(id)],
      }),
    ),
  );

  const nights: OwnedNight[] = owned
    .map((id, i) => {
      const { room, dateYYYYMMDD } = decodeTokenId(BigInt(id));
      const type = roomTypeOf(room);
      if (!type) return null;
      const listing = listings[i];
      const isListed = listing?.active === true;
      return {
        tokenId: id,
        room,
        dateYYYYMMDD,
        type,
        listingPriceWei: isListed ? listing.price.toString() : null,
      } satisfies OwnedNight;
    })
    .filter((night): night is OwnedNight => night !== null)
    .sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);

  // 4) Saldo pendiente de cobro (reventas ya vendidas, pull-payment).
  const pending = await client.readContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "pendingWithdrawals",
    args: [address],
  });

  return { nights, pendingWei: pending.toString() };
}

/**
 * Descubre y refresca las noches del usuario conectado (CU-06/07, ERC-721 sin Enumerable):
 * eventos `Sale` filtrados por comprador → `ownerOf` para confirmar propiedad → `listingOf`
 * + `pendingWithdrawals`. La caché vive en TanStack Query (ADR-09); `refetch` tras cada tx.
 */
export function useMyNights(
  address: Address | undefined,
): UseQueryResult<MyNightsData, Error> {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["my-nights", address, contractAddress],
    enabled: Boolean(address) && Boolean(client),
    queryFn: async (): Promise<MyNightsData> => {
      if (!client || !address) {
        throw new Error("Cliente o dirección no disponibles.");
      }
      return loadMyNights(client, address);
    },
  });
}
