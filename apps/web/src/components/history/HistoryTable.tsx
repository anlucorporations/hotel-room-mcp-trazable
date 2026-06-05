import { useTranslations } from "next-intl";
import type { SaleHistoryEntry } from "@hotel/shared";
import { formatEth, formatNightDate, TYPE_LABEL } from "@/lib/format";

const short = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** Histórico público de ventas (CU-09): orden total, sin PII (solo wallets). */
export function HistoryTable({ entries }: { entries: readonly SaleHistoryEntry[] }) {
  const t = useTranslations("history");

  if (entries.length === 0) {
    return (
      <p data-testid="history-empty" className="rounded-brand bg-sand-2 px-4 py-10 text-center text-ink-soft">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-brand border border-line bg-shell px-4">
      <table className="w-full border-collapse text-small">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            <th scope="col" className="py-2 pr-4">{t("colRoom")}</th>
            <th scope="col" className="py-2 pr-4">{t("colDate")}</th>
            <th scope="col" className="py-2 pr-4">{t("colType")}</th>
            <th scope="col" className="py-2 pr-4">{t("colPrice")}</th>
            <th scope="col" className="py-2 pr-4">{t("colSaleType")}</th>
            <th scope="col" className="py-2 pr-4">{t("colSeller")}</th>
            <th scope="col" className="py-2">{t("colBuyer")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.txHash}-${e.logIndex}`} data-testid="history-row" className="border-b border-line/60">
              <td className="py-2 pr-4">{e.room}</td>
              <td className="py-2 pr-4">{formatNightDate(e.dateYYYYMMDD)}</td>
              <td className="py-2 pr-4">{TYPE_LABEL[e.roomType]}</td>
              <td className="py-2 pr-4 font-medium">{formatEth(e.priceWei)}</td>
              <td className="py-2 pr-4">{t(e.saleType === "SECONDARY" ? "secondary" : "primary")}</td>
              <td className="py-2 pr-4 font-mono text-xs">{short(e.seller)}</td>
              <td className="py-2 font-mono text-xs">{short(e.buyer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
