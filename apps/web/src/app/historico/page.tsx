import { getTranslations } from "next-intl/server";
import {
  decodeTokenId,
  roomTypeOf,
  NFTsRepository,
  type NightType,
  type SaleHistoryEntry,
} from "@hotel/shared";
import { DegradedState } from "@/components/DegradedState";
import { HistoryTable } from "@/components/history/HistoryTable";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchHistory } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

export default async function HistoricoPage() {
  const t = await getTranslations("history");

  let entries: SaleHistoryEntry[] | null = null;
  try {
    const { items } = await nftsRepo.getSalesHistory(20, 0);
    if (items && items.length > 0) {
      entries = items.map((s, index) => {
        let room = 101;
        let dateYYYYMMDD = 20260720;
        let roomType: NightType = "simple";
        try {
          const decoded = decodeTokenId(BigInt(s.tokenId));
          room = decoded.room;
          dateYYYYMMDD = decoded.dateYYYYMMDD;
          roomType = (roomTypeOf(room) || "simple") as NightType;
        } catch {
          // fallback
        }
        return {
          tokenId: s.tokenId,
          room,
          dateYYYYMMDD,
          roomType,
          priceWei: s.priceInWei,
          saleType: s.isSecondary ? ("SECONDARY" as const) : ("PRIMARY" as const),
          seller: s.seller,
          buyer: s.buyer,
          blockNumber: s.blockNumber,
          logIndex: index,
          txHash: s.txHash,
        };
      });
    } else {
      entries = await fetchHistory();
    }
  } catch {
    try {
      entries = await fetchHistory();
    } catch {
      entries = null; // degradado
    }
  }

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-body text-ink-soft">{t("tagline")}</p>
          </div>
          <a
            href="/api/sales/history?format=csv"
            download
            className="inline-flex items-center justify-center gap-2 rounded-brand border border-line bg-shell px-4 py-2 text-small font-semibold text-ink shadow-sm transition hover:bg-sand-2 focus:outline-none focus:ring-2 focus:ring-sea"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar CSV
          </a>
        </header>
        {entries === null ? (
          <DegradedState message={t("degraded")} retryLabel={t("retry")} />
        ) : (
          <HistoryTable entries={entries} />
        )}
      </div>
    </PublicShell>
  );
}

