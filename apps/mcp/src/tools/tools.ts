import type { Address } from "viem";
import {
  CATALOG_WINDOW_DAYS,
  buildPurchaseTxData,
  computeNightState,
  decodeTokenId,
  encodeTokenId,
  isPurchasable,
  isValidCalendarDate,
  roomTypeOf,
  splitYYYYMMDD,
  type NightState,
  type SaleType,
} from "@hotel/shared";
import type { ChainReader, NightSignals } from "../chain/chain-reader";
import { searchKnowledge, type KnowledgeHit } from "../knowledge/search";
import { ToolError } from "./errors";
import type {
  AvailabilityResult,
  NightDescriptor,
  OwnedNightDescriptor,
  PurchaseTxData,
  StayNightDescriptor,
  StayPlan,
} from "./types";
import type {
  BuildPurchaseTxInput,
  CheckAvailabilityInput,
  GetOwnedNightsInput,
  ListAvailableNightsInput,
  PrepareStayTxInput,
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

/**
 * Tope de noches de una estancia preparada. Es una palanca de coste y de UX: cada noche es una tx
 * que el huésped firma a mano, así que una «estancia» de meses no es un caso real y multiplicaría
 * las lecturas on-chain sin aportar nada.
 */
export const MAX_STAY_NIGHTS = 14;

/** Tope de habitaciones candidatas cuando la estancia no fija habitación (acota las lecturas). */
export const MAX_STAY_ROOMS = 8;

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
 * Noches (AAAAMMDD) de la estancia `[checkIn, checkOut)`: `checkOut` es la **fecha de salida**, así
 * que esa noche no se compra. Lanza `INVALID_INPUT` si alguna fecha no existe en el calendario
 * (2026-02-30, 29-feb no bisiesto): no se normaliza en silencio a otra noche.
 */
function stayDates(checkIn: number, checkOut: number): number[] {
  const start = splitYYYYMMDD(checkIn);
  const end = splitYYYYMMDD(checkOut);
  if (!isValidCalendarDate(start) || !isValidCalendarDate(end)) {
    throw new ToolError("INVALID_INPUT", `Fecha de estancia inválida: ${checkIn}–${checkOut}.`);
  }
  const dates: number[] = [];
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  // El bucle se acota por `checkOut`; el tope evita un rango absurdo (años) si el llamante se pasa.
  while (dates.length <= MAX_STAY_NIGHTS) {
    const date =
      cursor.getUTCFullYear() * 10_000 + (cursor.getUTCMonth() + 1) * 100 + cursor.getUTCDate();
    if (date >= checkOut) break;
    dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Plan de una habitación concreta: las noches comprables y las que no lo son. */
async function planRoom(
  reader: ChainReader,
  config: ToolConfig,
  room: number,
  dates: readonly number[],
): Promise<{ nights: StayNightDescriptor[]; missing: number[] }> {
  const type = roomTypeOf(room);
  const nights: StayNightDescriptor[] = [];
  const missing: number[] = [];
  if (!type) return { nights, missing: [...dates] };

  for (const date of dates) {
    let tokenId: bigint;
    try {
      tokenId = encodeTokenId(room, date);
    } catch {
      missing.push(date);
      continue;
    }
    // Cada lectura se aísla: un revert puntual se cuenta como «noche no disponible» en lugar de
    // tumbar toda la estancia (paridad con `listAvailableNights`).
    const signals = await reader.getNightSignals(tokenId).catch((): NightSignals => ABSENT_SIGNALS);
    const terms = signals.exists ? purchaseTermsOf(signals) : null;
    if (!terms) {
      missing.push(date);
      continue;
    }
    nights.push({
      tokenId: tokenId.toString(),
      room,
      dateYYYYMMDD: date,
      type,
      priceWei: terms.priceWei.toString(),
      saleType: terms.saleType,
      tx: buildPurchaseTxData({
        tokenId,
        priceWei: terms.priceWei,
        saleType: terms.saleType,
        contractAddress: config.contractAddress,
        chainId: config.chainId,
      }),
    });
  }
  return { nights, missing };
}

/**
 * TC-MCP-010: prepara la compra de **todas las noches de una estancia** en una misma habitación
 * (petición del responsable, 2026-10-13: «no se realizan la reserva en rango de fechas»). Devuelve
 * una tx **sin firmar** por noche —cada noche es una compra distinta, con su propia firma— y el
 * importe total.
 *
 * Es **todo o nada**: si alguna noche de la estancia no es comprable en la habitación elegida, no
 * devuelve un plan parcial (el asistente pide alternativas con `listAvailableNights`), porque un
 * huésped no debe firmar media estancia sin saberlo. Sin `room`, elige la primera habitación del
 * `type` pedido —o de cualquier tipo— que tenga la estancia completa.
 */
export async function prepareStayTx(
  reader: ChainReader,
  config: ToolConfig,
  input: PrepareStayTxInput,
): Promise<StayPlan> {
  const dates = stayDates(input.checkIn, input.checkOut);
  if (input.checkIn < todayYYYYMMDD()) {
    throw new ToolError(
      "INVALID_INPUT",
      `La entrada (${input.checkIn}) ya pasó: hoy es ${todayYYYYMMDD()} y las noches pasadas no se compran.`,
    );
  }
  if (dates.length === 0) {
    throw new ToolError(
      "INVALID_INPUT",
      `La salida (${input.checkOut}) debe ser posterior a la entrada (${input.checkIn}).`,
    );
  }
  if (dates.length > MAX_STAY_NIGHTS) {
    throw new ToolError(
      "INVALID_INPUT",
      `La estancia no puede superar ${MAX_STAY_NIGHTS} noches (se pidieron ${dates.length}).`,
    );
  }

  let candidates: number[];
  if (input.room !== undefined) {
    candidates = [input.room];
  } else {
    // Sin habitación fija: solo las habitaciones que tienen TODAS las noches minteadas pueden
    // completar la estancia, así que el filtro barato (los `Mint`) evita leer señales en balde.
    const mints = await reader.getMintRecords();
    const mintedByRoom = new Map<number, Set<number>>();
    for (const mint of mints) {
      const type = roomTypeOf(mint.room);
      if (!type) continue;
      if (input.type && input.type !== type) continue;
      const minted = mintedByRoom.get(mint.room) ?? new Set<number>();
      minted.add(mint.dateYYYYMMDD);
      mintedByRoom.set(mint.room, minted);
    }
    candidates = [...mintedByRoom.entries()]
      .filter(([, minted]) => dates.every((date) => minted.has(date)))
      .map(([room]) => room)
      .sort((a, b) => a - b)
      .slice(0, MAX_STAY_ROOMS);

    if (candidates.length === 0) {
      throw new ToolError(
        "STAY_NOT_AVAILABLE",
        `Ninguna habitación tiene disponibles todas las noches de la estancia (${dates.join(", ")}).`,
      );
    }
  }

  const failures: { room: number; missing: number[] }[] = [];
  for (const room of candidates) {
    const plan = await planRoom(reader, config, room, dates);
    if (plan.missing.length === 0) {
      return {
        room,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: plan.nights,
        totalPriceWei: plan.nights.reduce((sum, night) => sum + BigInt(night.priceWei), 0n).toString(),
      };
    }
    failures.push({ room, missing: plan.missing });
  }

  const detail = failures.map((f) => `hab. ${f.room}: sin comprar ${f.missing.join(", ")}`).join("; ");
  throw new ToolError("STAY_NOT_AVAILABLE", `No hay una habitación libre para toda la estancia. ${detail}`);
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
