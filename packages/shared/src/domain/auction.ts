import type { Address } from "viem";
import {
  AUCTION_ANTI_SNIPE_WINDOW_SECONDS,
  AUCTION_BPS_DENOMINATOR,
  AUCTION_MAX_DURATION_SECONDS,
  AUCTION_MIN_BID_INCREMENT_BPS,
  AUCTION_MIN_BID_INCREMENT_WEI,
  AUCTION_MIN_DURATION_SECONDS,
} from "../constants";

/**
 * Reglas **puras** de la subasta (C2 · RF-13), espejo de `NightAuction.sol`.
 *
 * Existen para que la UI pueda validar, calcular la siguiente puja mínima y pintar la cuenta atrás
 * **sin firmar nada**, con exactamente las mismas reglas que aplica el contrato. No conocen la red:
 * todo entra y sale en `bigint` (segundos y wei).
 */
export interface AuctionView {
  readonly tokenId: bigint;
  readonly seller: Address;
  readonly reservePrice: bigint;
  readonly startTime: bigint;
  readonly endTime: bigint;
  readonly highestBidder: Address;
  readonly highestBid: bigint;
  readonly settled: boolean;
  readonly cancelled: boolean;
}

/** Fase de la subasta para la UI. `NONE` = esa noche nunca se ha subastado. */
export type AuctionPhase = "NONE" | "SCHEDULED" | "OPEN" | "CLOSED" | "SETTLED" | "CANCELLED";

/** Dirección cero: lo que devuelve el contrato mientras no hay pujas. */
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** `true` si no hay subasta registrada para la noche (`tokenId == 0` en el contrato). */
export function isAuctionEmpty(auction: Pick<AuctionView, "tokenId">): boolean {
  return auction.tokenId === 0n;
}

export function auctionPhase(auction: AuctionView, nowSeconds: bigint): AuctionPhase {
  if (isAuctionEmpty(auction)) return "NONE";
  if (auction.settled) return "SETTLED";
  if (auction.cancelled) return "CANCELLED";
  if (nowSeconds < auction.startTime) return "SCHEDULED";
  if (nowSeconds >= auction.endTime) return "CLOSED";
  return "OPEN";
}

/** Segundos que faltan para el cierre (0 si ya cerró o aún no ha empezado). */
export function timeLeftSeconds(auction: AuctionView, nowSeconds: bigint): bigint {
  if (auctionPhase(auction, nowSeconds) !== "OPEN") return 0n;
  return auction.endTime - nowSeconds;
}

/**
 * Importe mínimo de la siguiente puja: el precio de reserva mientras no haya pujas y, después,
 * la mejor puja más el 5 % con un suelo absoluto de 0,001.
 */
export function nextMinBid(
  auction: Pick<AuctionView, "reservePrice" | "highestBidder" | "highestBid">,
): bigint {
  if (auction.highestBidder === ZERO_ADDRESS || auction.highestBid === 0n) {
    return auction.reservePrice;
  }
  let step =
    (auction.highestBid * BigInt(AUCTION_MIN_BID_INCREMENT_BPS)) /
    BigInt(AUCTION_BPS_DENOMINATOR);
  if (step < AUCTION_MIN_BID_INCREMENT_WEI) step = AUCTION_MIN_BID_INCREMENT_WEI;
  return auction.highestBid + step;
}

/**
 * Cierre vigente tras una puja: si entra dentro de la ventana anti-sniping, se desplaza a
 * `bidAt + ventana`; si no, se conserva el cierre.
 */
export function antiSnipeEndTime(
  endTime: bigint,
  bidAt: bigint,
  windowSeconds: number = AUCTION_ANTI_SNIPE_WINDOW_SECONDS,
): bigint {
  const window = BigInt(windowSeconds);
  if (endTime - bidAt < window) return bidAt + window;
  return endTime;
}

/** ¿La ventana propuesta es válida? (mismas cotas que el contrato). */
export function isValidAuctionWindow(
  startTime: bigint,
  endTime: bigint,
  nowSeconds: bigint,
  minDurationSeconds: number = AUCTION_MIN_DURATION_SECONDS,
  maxDurationSeconds: number = AUCTION_MAX_DURATION_SECONDS,
): boolean {
  return auctionWindowIssue(startTime, endTime, nowSeconds, minDurationSeconds, maxDurationSeconds) === null;
}

/**
 * Motivo por el que una ventana no vale, para el mensaje del formulario. `null` si es válida.
 * Se devuelve un **código** (no texto) para que la UI lo traduzca.
 */
export function auctionWindowIssue(
  startTime: bigint,
  endTime: bigint,
  nowSeconds: bigint,
  minDurationSeconds: number = AUCTION_MIN_DURATION_SECONDS,
  maxDurationSeconds: number = AUCTION_MAX_DURATION_SECONDS,
): "START_IN_PAST" | "TOO_SHORT" | "TOO_LONG" | null {
  if (startTime < nowSeconds) return "START_IN_PAST";
  const duration = endTime - startTime;
  if (duration < BigInt(minDurationSeconds)) return "TOO_SHORT";
  if (duration > BigInt(maxDurationSeconds)) return "TOO_LONG";
  return null;
}
