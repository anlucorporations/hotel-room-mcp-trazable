import { parseEther } from "viem";
import { AUCTION_MAX_DURATION_SECONDS, AUCTION_MIN_DURATION_SECONDS } from "@hotel/shared/domain";

/**
 * Formulario de apertura de subasta (C2 · RF-13), **puro**: valida lo que el operador escribe con
 * las mismas cotas que aplica `NightAuction.createAuction` (B5) y prepara los argumentos de la
 * llamada. La UI no puede ofrecer un alta que el contrato vaya a rechazar por la ventana o el importe.
 */
export interface AuctionDraft {
  readonly tokenId: string;
  readonly reserveEth: string;
  /** Duración en horas, tal cual la escribe el operador. */
  readonly hours: string;
}

export type AuctionDraftIssue = "NO_NIGHT" | "INVALID_RESERVE" | "TOO_SHORT" | "TOO_LONG";

export const AUCTION_DEFAULT_HOURS = 24;
const MIN_HOURS = AUCTION_MIN_DURATION_SECONDS / 3_600;
const MAX_HOURS = AUCTION_MAX_DURATION_SECONDS / 3_600;

/** Motivo por el que el borrador no vale (código traducible), o `null` si es válido. */
export function auctionDraftIssue(draft: AuctionDraft): AuctionDraftIssue | null {
  if (draft.tokenId.trim() === "") return "NO_NIGHT";

  const reserve = draft.reserveEth.trim();
  if (reserve === "") return "INVALID_RESERVE";
  try {
    if (parseEther(reserve) < 0n) return "INVALID_RESERVE";
  } catch {
    return "INVALID_RESERVE";
  }

  const hours = Number(draft.hours.trim());
  if (!Number.isFinite(hours)) return "TOO_SHORT";
  if (hours < MIN_HOURS) return "TOO_SHORT";
  if (hours > MAX_HOURS) return "TOO_LONG";
  return null;
}

export interface AuctionCallArgs {
  readonly tokenId: bigint;
  readonly reserveWei: bigint;
  readonly startTime: bigint;
  readonly endTime: bigint;
}

/** Argumentos de `createAuction` (empieza ahora y dura lo indicado). `null` si el borrador no vale. */
export function auctionDraftToCall(
  draft: AuctionDraft,
  nowSeconds: number,
): AuctionCallArgs | null {
  if (auctionDraftIssue(draft) !== null) return null;
  const startTime = BigInt(Math.floor(nowSeconds));
  const hours = Number(draft.hours.trim());
  return {
    tokenId: BigInt(draft.tokenId.trim()),
    reserveWei: parseEther(draft.reserveEth.trim()),
    startTime,
    endTime: startTime + BigInt(Math.round(hours * 3_600)),
  };
}
