"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { AUCTION_DEFAULT_HOURS, auctionDraftIssue, auctionDraftToCall, type AuctionDraft } from "./auction-form";
import { AUCTION_ROLES, CURRENCY_SYMBOL, ZERO_ADDRESS } from "@hotel/shared/domain";
import { nightAuctionAbi } from "@hotel/shared/abi";
import { auctionAddress } from "@/config/chain";
import { TxModal, type TxModalCopy, type TxPhase } from "@/components/buy/TxModal";
import { useAuctionWrite } from "@/components/auctions/useAuctionWrite";
import { formatAuctionDate } from "@/lib/auction-view";
import { AdminCard } from "./AdminPanel";

const PRIMARY =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const SECONDARY =
  "min-h-touch rounded-pill border border-line-strong px-4 text-small font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/** Noche del inventario del hotel que puede subastarse (RF-13: premium ⇒ suite). */
export interface AdminAuctionCandidate {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly priceWei: string;
}

/** Acción en curso del panel: decide el cuerpo de la revisión. */
type PendingAction = "create" | "cancel";

export interface AdminAuctionsProps {
  readonly candidates: readonly AdminAuctionCandidate[];
}

/**
 * Panel de subastas (C2 · RF-13, CU-48): el hotel abre la subasta de una noche premium con su
 * reserva y su duración, y puede cancelarla mientras nadie haya pujado.
 *
 * La autoridad es el contrato (`AUCTION_ADMIN_ROLE`); aquí solo se evita ofrecer lo imposible: el
 * formulario valida con las mismas cotas que `createAuction` (1 h–14 d) y la cancelación solo se
 * ofrece a las subastas sin pujas.
 */
export function AdminAuctions({ candidates }: AdminAuctionsProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { address } = useAccount();
  const tx = useAuctionWrite();

  const [draft, setDraft] = useState<AuctionDraft>({
    tokenId: candidates[0]?.tokenId ?? "",
    reserveEth: "0.1",
    hours: String(AUCTION_DEFAULT_HOURS),
  });
  const [action, setAction] = useState<PendingAction | null>(null);
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  const canManage = useReadContract({
    address: auctionAddress ?? undefined,
    abi: nightAuctionAbi,
    functionName: "hasRole",
    args: address ? [AUCTION_ROLES.AUCTION_ADMIN_ROLE, address] : undefined,
    query: { enabled: Boolean(auctionAddress && address) },
  });

  useEffect(() => {
    if (tx.status === "confirmed") router.refresh();
  }, [tx.status, router]);

  const issue = auctionDraftIssue(draft);
  const call = useMemo(() => auctionDraftToCall(draft, nowSeconds), [draft, nowSeconds]);
  const selected = candidates.find((c) => c.tokenId === draft.tokenId);

  const copy: TxModalCopy = {
    review: t("tx.review"),
    reviewHint: t("tx.reviewHint"),
    status: {
      signing: t("tx.signing"),
      pending: t("tx.pending"),
      confirmed: t("tx.confirmed"),
      reverted: t("tx.reverted"),
    },
    statusHint: {
      signing: t("tx.signingHint"),
      pending: t("tx.pendingHint"),
      confirmed: t("tx.confirmedHint"),
      reverted: t("tx.revertedHint"),
    },
  };

  const close = (): void => {
    setAction(null);
    tx.reset();
  };

  const modalPhase: TxPhase = tx.status !== "idle" ? (tx.status as TxPhase) : action ? "review" : "idle";

  return (
    <div className="flex flex-col gap-6">
      {!auctionAddress && (
        <p data-testid="admin-auctions-not-configured" role="status" className="text-small text-ink-soft">
          {t("auctionsNotConfigured")}
        </p>
      )}

      <AdminCard>
        <h2 className="font-display text-h3 text-ink">{t("auctionsCreateTitle")}</h2>
        <p className="mt-1 text-small text-ink-soft">{t("auctionsCreateIntro")}</p>

        {candidates.length === 0 ? (
          <p data-testid="admin-auctions-no-candidates" className="mt-3 text-small text-ink-soft">
            {t("auctionsNoCandidates")}
          </p>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (issue === null) setAction("create");
            }}
          >
            <label className="flex flex-col gap-1 text-small text-ink-soft" htmlFor="auction-night">
              {t("auctionsNight")}
            </label>
            <select
              id="auction-night"
              data-testid="admin-auction-night"
              value={draft.tokenId}
              onChange={(event) => setDraft({ ...draft, tokenId: event.target.value })}
              className="min-h-touch rounded-brand-md border border-line-strong bg-shell px-3 text-ink"
            >
              {candidates.map((candidate) => (
                <option key={candidate.tokenId} value={candidate.tokenId}>
                  {t("auctionsNightOption", {
                    room: candidate.room,
                    date: formatAuctionDate(candidate.dateYYYYMMDD),
                  })}
                </option>
              ))}
            </select>

            <label className="flex flex-col gap-1 text-small text-ink-soft" htmlFor="auction-reserve">
              {t("auctionsReserve", { symbol: CURRENCY_SYMBOL })}
            </label>
            <input
              id="auction-reserve"
              data-testid="admin-auction-reserve"
              inputMode="decimal"
              value={draft.reserveEth}
              onChange={(event) => setDraft({ ...draft, reserveEth: event.target.value })}
              className="min-h-touch rounded-brand-md border border-line-strong bg-shell px-3 text-ink tabular-nums"
            />
            {selected && (
              <p className="text-small text-ink-soft">
                {t("auctionsCatalogPrice", {
                  price: formatEther(BigInt(selected.priceWei)),
                  symbol: CURRENCY_SYMBOL,
                })}
              </p>
            )}

            <label className="flex flex-col gap-1 text-small text-ink-soft" htmlFor="auction-hours">
              {t("auctionsHours")}
            </label>
            <input
              id="auction-hours"
              data-testid="admin-auction-hours"
              inputMode="numeric"
              value={draft.hours}
              onChange={(event) => setDraft({ ...draft, hours: event.target.value })}
              className="min-h-touch rounded-brand-md border border-line-strong bg-shell px-3 text-ink tabular-nums"
            />

            {issue !== null && (
              <p role="alert" data-testid="admin-auction-issue" className="text-small text-error">
                {t(`auctionsIssue.${issue}`)}
              </p>
            )}

            {canManage.data === false && (
              <p data-testid="admin-auction-no-role" className="text-small text-ink-soft">
                {t("auctionsNoRole")}
              </p>
            )}

            <button
              type="submit"
              data-testid="admin-auction-create"
              disabled={issue !== null || !auctionAddress || canManage.data === false}
              className={PRIMARY}
            >
              {t("auctionsCreate")}
            </button>
          </form>
        )}
      </AdminCard>

      <AdminCard>
        <h2 className="font-display text-h3 text-ink">{t("auctionsListTitle")}</h2>
        {candidates.length === 0 ? (
          <p className="text-small text-ink-soft">{t("auctionsNoCandidates")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {candidates.map((candidate) => (
              <AuctionRow
                key={candidate.tokenId}
                candidate={candidate}
                onCancel={(tokenId) => {
                  setDraft({ ...draft, tokenId });
                  setAction("cancel");
                }}
                canManage={canManage.data === true}
              />
            ))}
          </ul>
        )}
      </AdminCard>

      <TxModal
        phase={modalPhase}
        onClose={close}
        hash={tx.hash}
        copy={copy}
        reviewBody={
          <p data-testid="admin-auction-review" className="text-small text-ink">
            {action === "create" && call !== null
              ? t("auctionsReviewCreate", {
                  room: selected?.room ?? "—",
                  reserve: draft.reserveEth,
                  symbol: CURRENCY_SYMBOL,
                  hours: draft.hours,
                })
              : t("auctionsReviewCancel", { room: selected?.room ?? "—" })}
          </p>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="admin-auction-confirm"
              onClick={() => {
                if (action === "create" && call) tx.create(call);
                if (action === "cancel" && selected) tx.cancel(BigInt(selected.tokenId));
              }}
              className={PRIMARY}
            >
              {t("confirm")}
            </button>
            <button type="button" onClick={close} className={SECONDARY}>
              {t("cancel")}
            </button>
          </>
        }
      />
    </div>
  );
}

/** Fila de una noche: estado de su subasta y, si procede, cancelación. */
function AuctionRow({
  candidate,
  onCancel,
  canManage,
}: {
  readonly candidate: AdminAuctionCandidate;
  readonly onCancel: (tokenId: string) => void;
  readonly canManage: boolean;
}) {
  const t = useTranslations("admin");
  const auction = useReadContract({
    address: auctionAddress ?? undefined,
    abi: nightAuctionAbi,
    functionName: "auctionOf",
    args: [BigInt(candidate.tokenId)],
    query: { enabled: Boolean(auctionAddress) },
  });

  const raw = auction.data as
    | readonly [bigint, string, bigint, bigint, bigint, string, bigint, boolean, boolean]
    | undefined;
  const exists = raw !== undefined && raw[0] !== 0n;
  const settled = raw?.[7] ?? false;
  const cancelled = raw?.[8] ?? false;
  const highestBid = raw?.[6] ?? 0n;
  const highestBidder = (raw?.[5] ?? ZERO_ADDRESS) as string;

  const stateKey = !exists ? "auctionsStateNone" : cancelled ? "auctionsStateCancelled" : settled ? "auctionsStateSettled" : "auctionsStateOpen";
  const canCancel = canManage && exists && !settled && !cancelled && highestBidder.toLowerCase() === ZERO_ADDRESS;

  return (
    <li data-testid="admin-auction-row" data-token={candidate.tokenId} className="flex items-center justify-between gap-4 py-3">
      <div className="flex flex-col">
        <span className="text-small font-semibold text-ink">
          {t("auctionsNightOption", { room: candidate.room, date: formatAuctionDate(candidate.dateYYYYMMDD) })}
        </span>
        <span className="text-small text-ink-soft">
          {t(stateKey)}
          {exists && highestBid > 0n
            ? ` · ${formatEther(highestBid)} ${CURRENCY_SYMBOL}`
            : ""}
        </span>
      </div>
      {canCancel && (
        <button
          type="button"
          data-testid="admin-auction-cancel"
          onClick={() => onCancel(candidate.tokenId)}
          className={SECONDARY}
        >
          {t("auctionsCancel")}
        </button>
      )}
    </li>
  );
}
