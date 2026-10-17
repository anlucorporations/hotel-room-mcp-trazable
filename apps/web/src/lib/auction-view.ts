export type { AuctionPhase } from "@hotel/shared/domain";
import {
  auctionPhase,
  nextMinBid,
  timeLeftSeconds,
  type AuctionPhase,
  type AuctionView,
} from "@hotel/shared/domain";

/**
 * Modelo de vista de una subasta (C2 · RF-13), **puro**: convierte el estado on-chain en lo que
 * pinta la tarjeta (fase, cuenta atrás, puja mínima) sin tocar la red ni el DOM, para poder probarlo.
 */
export interface AuctionItem {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: string;
  readonly seller: string;
  readonly phase: AuctionPhase;
  readonly reservePriceWei: string;
  readonly highestBidWei: string;
  readonly highestBidder: string;
  readonly minNextBidWei: string;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
  readonly timeLeftSeconds: number;
  readonly coverUrl: string | null;
  /** RF-13: la subasta es para habitaciones **premium** (suite en el maestro). */
  readonly isPremium: boolean;
}

/** Subasta on-chain + los datos de la noche que la tarjeta necesita. */
export interface AuctionRaw extends AuctionView {
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: string;
  readonly coverUrl?: string | null;
}

export function buildAuctionItem(raw: AuctionRaw, nowSeconds: bigint): AuctionItem {
  const phase = auctionPhase(raw, nowSeconds);
  return {
    tokenId: raw.tokenId.toString(),
    room: raw.room,
    dateYYYYMMDD: raw.dateYYYYMMDD,
    roomType: raw.roomType,
    seller: raw.seller,
    phase,
    reservePriceWei: raw.reservePrice.toString(),
    highestBidWei: raw.highestBid.toString(),
    highestBidder: raw.highestBidder,
    minNextBidWei: nextMinBid(raw).toString(),
    startTimeSeconds: Number(raw.startTime),
    endTimeSeconds: Number(raw.endTime),
    timeLeftSeconds: Number(timeLeftSeconds(raw, nowSeconds)),
    coverUrl: raw.coverUrl ?? null,
    isPremium: raw.roomType === "suite",
  };
}

/** Unidades de la cuenta atrás, listas para traducir (nada de texto aquí). */
export interface CountdownUnits {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

export function countdownUnits(totalSeconds: number): CountdownUnits {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(safe / 86_400),
    hours: Math.floor((safe % 86_400) / 3_600),
    minutes: Math.floor((safe % 3_600) / 60),
    seconds: safe % 60,
  };
}

export type CountdownUnit = "days" | "hours" | "minutes" | "seconds";

/**
 * Las **dos** unidades más significativas de la cuenta atrás («2 d 3 h», «45 min 10 s»), que es lo
 * que cabe en una tarjeta. Si ya no queda tiempo, devuelve `0 s`.
 */
export function countdownParts(units: CountdownUnits): { unit: CountdownUnit; value: number }[] {
  const pairs: [CountdownUnit, number][] = [
    ["days", units.days],
    ["hours", units.hours],
    ["minutes", units.minutes],
    ["seconds", units.seconds],
  ];
  const first = pairs.findIndex(([, value]) => value > 0);
  if (first === -1) return [{ unit: "seconds", value: 0 }];
  return pairs.slice(first, first + 2).map(([unit, value]) => ({ unit, value }));
}

/** Fecha `AAAAMMDD` en formato corto y estable (`1 jul 2026`), sin depender de la zona del entorno. */
export function formatAuctionDate(dateYYYYMMDD: number, locale = "es-ES"): string {
  const raw = String(dateYYYYMMDD).padStart(8, "0");
  const date = new Date(
    Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))),
  );
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Orden de la parrilla: primero lo **accionable** (abiertas, por cierre más próximo), luego las
 * programadas, después las cerradas pendientes de liquidar y al final el histórico.
 */
const PHASE_RANK: Readonly<Record<AuctionPhase, number>> = {
  OPEN: 0,
  SCHEDULED: 1,
  CLOSED: 2,
  SETTLED: 3,
  CANCELLED: 4,
  NONE: 5,
};

export function phaseRank(phase: AuctionPhase): number {
  return PHASE_RANK[phase];
}

export function sortAuctionItems(items: readonly AuctionItem[]): AuctionItem[] {
  return [...items].sort((a, b) => {
    const rank = phaseRank(a.phase) - phaseRank(b.phase);
    if (rank !== 0) return rank;
    // Dentro del mismo grupo: las abiertas y programadas, por cierre/cierre más próximo; el
    // histórico, por cierre más reciente.
    return phaseRank(a.phase) <= 1
      ? a.endTimeSeconds - b.endTimeSeconds
      : b.endTimeSeconds - a.endTimeSeconds;
  });
}

/** Subastas que merecen estar en la portada (abiertas o a punto de abrir). */
export function openAuctions(items: readonly AuctionItem[]): AuctionItem[] {
  return items.filter((item) => item.phase === "OPEN" || item.phase === "SCHEDULED");
}

/**
 * Fase **en vivo**: la instantánea se leyó en el servidor, pero la tarjeta lleva una cuenta atrás en
 * el cliente y debe cambiar de estado sin volver a consultar el RPC (abrir al llegar la hora, cerrar
 * al agotarse). Los estados terminales (liquidada/cancelada) no cambian con el reloj.
 */
export function livePhase(
  item: Pick<AuctionItem, "phase" | "startTimeSeconds" | "endTimeSeconds">,
  nowSeconds: number,
): AuctionPhase {
  if (item.phase === "SETTLED" || item.phase === "CANCELLED" || item.phase === "NONE") {
    return item.phase;
  }
  if (nowSeconds < item.startTimeSeconds) return "SCHEDULED";
  if (nowSeconds >= item.endTimeSeconds) return "CLOSED";
  return "OPEN";
}

/** Segundos restantes con el reloj del cliente (0 si no está abierta). */
export function liveTimeLeft(
  item: Pick<AuctionItem, "phase" | "startTimeSeconds" | "endTimeSeconds">,
  nowSeconds: number,
): number {
  if (livePhase(item, nowSeconds) !== "OPEN") return 0;
  return Math.max(0, item.endTimeSeconds - nowSeconds);
}
