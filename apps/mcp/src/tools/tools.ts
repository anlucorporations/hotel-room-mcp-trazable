import type { Address } from "viem";
import {
  CATALOG_WINDOW_DAYS,
  buildPurchaseTxData,
  computeNightState,
  decodeTokenId,
  encodeTokenId,
  isPurchasable,
  roomTypeOf,
  type NightState,
  type SaleType,
} from "@hotel/shared";
import type { ChainReader, NightSignals } from "../chain/chain-reader";
import { searchKnowledge, type KnowledgeHit } from "../knowledge/search";
import { ToolError } from "./errors";
import type { AvailabilityResult, NightDescriptor, OwnedNightDescriptor, PurchaseTxData } from "./types";
import type {
  BuildPurchaseTxInput,
  CheckAvailabilityInput,
  GetOwnedNightsInput,
  ListAvailableNightsInput,
  SearchHotelManualsInput,
} from "./schemas";

/** Datos del contrato que necesita `buildPurchaseTx` para componer la tx (no firma). */
export interface ToolConfig {
  readonly contractAddress: Address;
  readonly chainId: number;
}

const SALE_TYPE_BY_STATE: Partial<Record<NightState, SaleType>> = {
  DISPONIBLE: "PRIMARY",
  LISTADA_SECUNDARIO: "SECONDARY",
};

/** Señales de una noche inexistente (para aislar fallos de lectura puntuales). */
const ABSENT_SIGNALS: NightSignals = {
  exists: false,
  soldOnce: false,
  expired: false,
  listed: false,
  primaryPriceWei: 0n,
  listingPriceWei: 0n,
};

function todayYYYYMMDD(): number {
  const now = new Date();
  return now.getUTCFullYear() * 10_000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

function defaultWindowEnd(): number {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + CATALOG_WINDOW_DAYS);
  return end.getUTCFullYear() * 10_000 + (end.getUTCMonth() + 1) * 100 + end.getUTCDate();
}

/** Precio y tipo de venta de una noche comprable según su estado; `null` si no es comprable. */
function purchaseTermsOf(
  signals: NightSignals,
): { priceWei: bigint; saleType: SaleType } | null {
  const state = computeNightState(signals);
  const saleType = state ? SALE_TYPE_BY_STATE[state] : undefined;
  if (!saleType) return null;
  return {
    priceWei: saleType === "PRIMARY" ? signals.primaryPriceWei : signals.listingPriceWei,
    saleType,
  };
}

/** TC-MCP-008: noches comprables (DISPONIBLE + LISTADA) en la ventana, con filtro de tipo. */
export async function listAvailableNights(
  reader: ChainReader,
  input: ListAvailableNightsInput,
): Promise<NightDescriptor[]> {
  const today = todayYYYYMMDD();
  // La ventana nunca incluye fechas pasadas: una noche con fecha < hoy está EXPIRADA y no es
  // comprable (docs/SRS.md §9), aunque el llamante pida un `from` anterior.
  const from = Math.max(input.window?.from ?? today, today);
  const to = input.window?.to ?? defaultWindowEnd();
  const inWindow = (date: number): boolean => date >= from && date <= to;

  const [mints, sold, listedIds] = await Promise.all([
    reader.getMintRecords(),
    reader.getSoldTokenIds(),
    reader.getListedTokenIds(),
  ]);

  const byToken = new Map<string, NightDescriptor>();

  // DISPONIBLE (primaria): minteadas sin venta, en ventana.
  for (const mint of mints) {
    const id = mint.tokenId.toString();
    if (sold.has(id) || !inWindow(mint.dateYYYYMMDD)) continue;
    const type = roomTypeOf(mint.room);
    if (!type) continue;
    byToken.set(id, {
      tokenId: id,
      room: mint.room,
      dateYYYYMMDD: mint.dateYYYYMMDD,
      type,
      priceWei: mint.priceWei.toString(),
      saleType: "PRIMARY",
    });
  }

  // LISTADA_SECUNDARIO: candidatas de `Listed`, confirmadas por su estado on-chain actual.
  // Cada lectura se aísla: un revert puntual no debe tumbar todo el listado (paridad con la web).
  const listedSignals = await Promise.all(
    listedIds.map((id) => reader.getNightSignals(id).catch((): NightSignals => ABSENT_SIGNALS)),
  );
  listedIds.forEach((id, i) => {
    const terms = purchaseTermsOf(listedSignals[i]!);
    if (!terms || terms.saleType !== "SECONDARY") return;
    const { room, dateYYYYMMDD } = decodeTokenId(id);
    if (!inWindow(dateYYYYMMDD)) return;
    const type = roomTypeOf(room);
    if (!type) return;
    byToken.set(id.toString(), {
      tokenId: id.toString(),
      room,
      dateYYYYMMDD,
      type,
      priceWei: terms.priceWei.toString(),
      saleType: "SECONDARY",
    });
  });

  return [...byToken.values()]
    .filter((n) => !input.type || n.type === input.type)
    .sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}

/** TC-MCP-001/007: existencia, comprabilidad y precio de una noche concreta. */
export async function checkAvailability(
  reader: ChainReader,
  input: CheckAvailabilityInput,
): Promise<AvailabilityResult> {
  let tokenId: bigint;
  try {
    tokenId = encodeTokenId(input.room, input.date);
  } catch {
    return { exists: false, available: false };
  }

  const signals = await reader.getNightSignals(tokenId);
  if (!signals.exists) return { exists: false, available: false };

  const terms = purchaseTermsOf(signals);
  return {
    exists: true,
    available: isPurchasable(signals),
    tokenId: tokenId.toString(),
    ...(terms ? { priceWei: terms.priceWei.toString(), saleType: terms.saleType } : {}),
  };
}

/** TC-MCP-002: noches que la wallet posee actualmente (Sale.buyer → confirma con ownerOf). */
export async function getOwnedNights(
  reader: ChainReader,
  input: GetOwnedNightsInput,
): Promise<OwnedNightDescriptor[]> {
  const wallet = input.wallet as Address;
  const candidates = await reader.getPurchasedTokenIds(wallet);
  const ownership = await Promise.all(candidates.map((id) => reader.isOwnedBy(id, wallet)));

  return candidates
    .filter((_, i) => ownership[i])
    .map((id) => {
      const { room, dateYYYYMMDD } = decodeTokenId(id);
      const type = roomTypeOf(room);
      return type ? { tokenId: id.toString(), room, dateYYYYMMDD, type } : null;
    })
    .filter((n): n is OwnedNightDescriptor => n !== null)
    .sort((a, b) => a.dateYYYYMMDD - b.dateYYYYMMDD);
}

/**
 * TC-MCP-003/004: construye la tx de compra **sin firma**. Lee el precio y el estado on-chain
 * (no confía en el llamante): rechaza si la noche no existe o no es comprable, y el `value`
 * es siempre el precio on-chain (`priceOf`/`listingOf`).
 */
export async function buildPurchaseTx(
  reader: ChainReader,
  config: ToolConfig,
  input: BuildPurchaseTxInput,
): Promise<PurchaseTxData> {
  let tokenId: bigint;
  try {
    tokenId = BigInt(input.tokenId);
  } catch {
    throw new ToolError("INVALID_INPUT", `tokenId inválido: ${input.tokenId}`);
  }
  const signals = await reader.getNightSignals(tokenId);
  if (!signals.exists) {
    throw new ToolError("NIGHT_NOT_FOUND", `La noche ${tokenId} no existe.`);
  }
  const terms = purchaseTermsOf(signals);
  if (!terms) {
    const state = computeNightState(signals);
    throw new ToolError("NIGHT_NOT_PURCHASABLE", `La noche ${tokenId} no es comprable (estado ${state}).`);
  }
  return buildPurchaseTxData({
    tokenId,
    priceWei: terms.priceWei,
    saleType: terms.saleType,
    contractAddress: config.contractAddress,
    chainId: config.chainId,
  });
}

/**
 * TC-MCP-009 (hito H2 de la v3): recupera los fragmentos del conocimiento del hotel relevantes para
 * una consulta y devuelve, con cada uno, la sección y el fichero de los que procede (RF-59: es lo
 * que el asistente cita como fuente).
 *
 * Es una operación **puramente local**: el índice se genera en el build y vive en memoria, así que
 * no toca la cadena ni la base de datos y no depende de {@link ChainReader}. Por eso no puede
 * degradarse por un RPC lento y no añade latencia de red.
 */
export function searchHotelManuals(input: SearchHotelManualsInput): KnowledgeHit[] {
  return searchKnowledge(input.query, { audience: input.audience, limit: input.limit });
}
