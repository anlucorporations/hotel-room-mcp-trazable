"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  BaseError,
  ContractFunctionRevertedError,
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

/**
 * Resultado del escaneo de caducadas. `partial` indica que algún `isExpired` falló por error de
 * RED (no por revert esperado), por lo que el recuento puede estar INCOMPLETO (MINOR#35): el
 * panel lo avisa en vez de presentar el lote como completo.
 */
export interface ExpiredScanResult {
  readonly nights: readonly ExpiredNight[];
  readonly partial: boolean;
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

/** Resultado por token: expirado/no, o error de red (no se pudo verificar). */
type ExpiredCheck = { kind: "ok"; expired: boolean } | { kind: "network-error" };

/**
 * ¿`tokenId` está expirado on-chain? Distingue (MINOR#35):
 *  - REVERT esperado (token quemado/inexistente) → no candidato (`expired: false`);
 *  - error de RED (RPC caído/timeout) → `network-error` (el escaneo marcará el resultado parcial).
 */
async function checkExpired(client: PublicClient, tokenId: bigint): Promise<ExpiredCheck> {
  try {
    const expired = await client.readContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "isExpired",
      args: [tokenId],
    });
    return { kind: "ok", expired };
  } catch (err) {
    // Un revert del contrato (token inexistente/quemado) es ESPERADO: no es candidato.
    if (err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError)) {
      return { kind: "ok", expired: false };
    }
    // Cualquier otro fallo (red/RPC) NO debe ocultar candidatos en silencio.
    return { kind: "network-error" };
  }
}

async function scanExpired(client: PublicClient): Promise<ExpiredScanResult> {
  const head = await client.getBlockNumber();
  // MINOR#34: si el bloque de despliegue es POSTERIOR al head, la config es inválida: la
  // paginación no produciría rangos y devolveríamos 0 en silencio. Fallamos visiblemente.
  if (deploymentBlock > head) throw new Error("SCAN_CONFIG_INVALID");

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
  const checks = await Promise.all(candidates.map((id) => checkExpired(client, BigInt(id))));

  // Si algún token no se pudo verificar por red, el recuento es PARCIAL (MINOR#35).
  const partial = checks.some((c) => c.kind === "network-error");

  const nights = candidates
    .filter((_, i) => checks[i]?.kind === "ok" && (checks[i] as { expired: boolean }).expired)
    .map((id) => ({ tokenId: id, dateYYYYMMDD: minted.get(id) ?? 0 }))
    .sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);

  return { nights, partial };
}

/**
 * Escanea las noches del hotel caducadas candidatas a `burn` (CU-13), reutilizando la lectura
 * por eventos (como `lib/nights.ts`/`useMyNights`): `Mint` − `Sale` (vendidas excluidas) y
 * confirmación `isExpired`. El escaneo es por RPC y puede ser costoso en cadenas con muchos
 * eventos; por eso es bajo demanda (TanStack Query, `enabled` controlado) y el panel ofrece
 * además entrada manual de tokenIds como alternativa. Devuelve el lote y si fue PARCIAL.
 */
export function useExpiredNights(enabled: boolean): UseQueryResult<ExpiredScanResult, Error> {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["admin-expired", contractAddress],
    enabled: enabled && Boolean(client),
    queryFn: async (): Promise<ExpiredScanResult> => {
      if (!client) throw new Error("Cliente no disponible.");
      return scanExpired(client);
    },
  });
}
