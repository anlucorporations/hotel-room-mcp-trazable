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
  /**
   * **Foto real de su habitación** (2026-10-05), o `null` si esa habitación no tiene ninguna
   * registrada. La cadena solo trae el número, así que se resuelve aparte contra el maestro
   * (`GET /api/public/rooms/covers`). Sin foto, la tarjeta usa su imagen de tipo: nunca se enseña la
   * foto de otra habitación.
   */
  readonly coverUrl?: string | null;
}

/** Una reventa ya cerrada (el usuario fue el vendedor). Base de «Mis reventas» y de sus avisos. */
export interface ResaleSale {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
  readonly priceWei: string;
  readonly buyer: string;
  /** Bloque de la venta: sirve para detectar novedades sin depender de la hora del cliente. */
  readonly blockNumber: bigint;
}

export interface MyNightsData {
  readonly nights: readonly OwnedNight[];
  /** Saldo pendiente de cobro (wei) de reventas vendidas. */
  readonly pendingWei: string;
  /** Reventas ya vendidas por el usuario, más recientes primero. */
  readonly resales: readonly ResaleSale[];
}

const SALE_EVENT = parseAbiItem(
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)",
);

/** `SaleType.SECONDARY` en el contrato `HotelNights` (0 = PRIMARY, 1 = SECONDARY). */
const SALE_TYPE_SECONDARY = 1;

type SaleLogs = GetLogsReturnType<typeof SALE_EVENT>;

/**
 * Pagina los eventos `Sale` en chunks ≤ `GETLOGS_MAX_RANGE` desde el bloque de despliegue,
 * filtrando on-chain por el topic indexado indicado (`buyer` o `seller`) para minimizar el payload.
 */
async function paginatedSaleLogs(
  client: PublicClient,
  args: { address: Address; fromBlock: bigint; toBlock: bigint; buyer?: Address; seller?: Address },
): Promise<SaleLogs> {
  const range = BigInt(GETLOGS_MAX_RANGE);
  const ranges: Array<{ from: bigint; to: bigint }> = [];
  for (let from = args.fromBlock; from <= args.toBlock; from += range) {
    const to = from + range - 1n > args.toBlock ? args.toBlock : from + range - 1n;
    ranges.push({ from, to });
  }
  const filter = args.buyer ? { buyer: args.buyer } : { seller: args.seller as Address };
  const chunks = await Promise.all(
    ranges.map(({ from, to }) =>
      client.getLogs({
        address: args.address,
        event: SALE_EVENT,
        args: filter,
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
  });  const candidates = [
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

  // 4) Reventas ya cerradas (eventos `Sale` como VENDEDOR, solo secundarias). Permiten mostrar
  //    «Vendidas» y detectar novedades comparando el bloque con la última visita (sin PII).
  const sellerSales = await paginatedSaleLogs(client, {
    address: contractAddress,
    fromBlock: deploymentBlock,
    toBlock: head,
    seller: address,
  });
  const resales: ResaleSale[] = sellerSales
    .filter((log) => Number(log.args.saleType) === SALE_TYPE_SECONDARY)
    .map((log): ResaleSale | null => {
      const tokenId = log.args.tokenId;
      const price = log.args.price;
      const buyer = log.args.buyer;
      if (tokenId === undefined || price === undefined || buyer === undefined) return null;
      const { room, dateYYYYMMDD } = decodeTokenId(tokenId);
      const type = roomTypeOf(room);
      if (!type) return null;
      return {
        tokenId: tokenId.toString(),
        room,
        dateYYYYMMDD,
        type,
        priceWei: price.toString(),
        buyer,
        blockNumber: log.blockNumber ?? 0n,
      } satisfies ResaleSale;
    })
    .filter((sale): sale is ResaleSale => sale !== null)
    .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));

  // 5) Saldo pendiente de cobro (reventas ya vendidas, pull-payment).
  const pending = await client.readContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "pendingWithdrawals",
    args: [address],
  });

  // 6) Foto real de cada habitación: la cadena solo trae el número, así que la portada se resuelve
  //    contra el maestro off-chain en **una** llamada. Falla en blando: sin foto, la tarjeta usa su
  //    imagen de tipo (nunca se enseña la de otra habitación).
  const nightsWithCovers = await attachCoverUrls(nights);

  return { nights: nightsWithCovers, pendingWei: pending.toString(), resales };
}

/**
 * Añade a cada noche la URL de la **foto de su habitación**.
 *
 * `GET /api/public/rooms/covers` resuelve el salto número → portada (el maestro off-chain conoce la
 * foto; la cadena, solo el número). Si la llamada falla, se devuelven las noches sin `coverUrl` en
 * lugar de romper «Mis noches»: la foto es un adorno, la noche es el dato.
 */
async function attachCoverUrls(nights: readonly OwnedNight[]): Promise<OwnedNight[]> {
  if (nights.length === 0) return [...nights];
  const numbers = [...new Set(nights.map((night) => night.room))].join(",");
  try {
    const response = await fetch(`/api/public/rooms/covers?numbers=${numbers}`);
    if (!response.ok) return [...nights];
    const data = (await response.json()) as { covers?: Record<string, { url?: string }> };
    const covers = data.covers ?? {};
    return nights.map((night) => ({ ...night, coverUrl: covers[String(night.room)]?.url ?? null }));
  } catch {
    return [...nights];
  }
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
