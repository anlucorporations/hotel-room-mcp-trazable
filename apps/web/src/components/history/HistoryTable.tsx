import { useTranslations } from "next-intl";
import type { SaleHistoryEntry } from "@hotel/shared";
import { formatEth, formatNightDate, useRoomTypeLabel } from "@/lib/format";

const short = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** Histórico público de ventas (CU-09): orden total, sin PII (solo wallets). */
export function HistoryTable({ entries }: { entries: readonly SaleHistoryEntry[] }) {
  const t = useTranslations("history");
  const roomTypeLabel = useRoomTypeLabel();

  if (entries.length === 0) {
    return (
      <p data-testid="history-empty" className="rounded-brand bg-sand-2 px-4 py-10 text-center text-ink-soft">
        {t("empty")}
      </p>
    );
  }

  return (
    <>
      {/* Móvil (<tablet): tarjetas apiladas con pares etiqueta/valor, en vez de una tabla
          de 7 columnas ilegible (UX#22). Cada tarjeta es una fila del histórico. */}
      <ul className="flex flex-col gap-3 tablet:hidden">
        {entries.map((e) => (
          <li
            key={`${e.txHash}-${e.logIndex}`}
            data-testid="history-row"
            className="rounded-brand border border-line bg-shell p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-body font-semibold text-ink">
                {t("colRoom")} {e.room}
              </span>
              <span className="font-medium">{formatEth(e.priceWei)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
              <dt className="text-ink-soft">{t("colDate")}</dt>
              <dd className="text-right">{formatNightDate(e.dateYYYYMMDD)}</dd>
              <dt className="text-ink-soft">{t("colType")}</dt>
              <dd className="text-right">{roomTypeLabel(e.roomType)}</dd>
              <dt className="text-ink-soft">{t("colSaleType")}</dt>
              <dd className="text-right">{t(e.saleType === "SECONDARY" ? "secondary" : "primary")}</dd>
              <dt className="text-ink-soft">{t("colSeller")}</dt>
              <dd className="text-right font-mono text-xs">{short(e.seller)}</dd>
              <dt className="text-ink-soft">{t("colBuyer")}</dt>
              <dd className="text-right font-mono text-xs">{short(e.buyer)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      {/* Tablet+: tabla completa con caption/scope para lectores de pantalla. */}
      <div className="hidden overflow-x-auto rounded-brand border border-line bg-shell px-4 tablet:block">
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
                <td className="py-2 pr-4">{roomTypeLabel(e.roomType)}</td>
                <td className="py-2 pr-4 font-medium">{formatEth(e.priceWei)}</td>
                <td className="py-2 pr-4">{t(e.saleType === "SECONDARY" ? "secondary" : "primary")}</td>
                <td className="py-2 pr-4 font-mono text-xs">{short(e.seller)}</td>
                <td className="py-2 font-mono text-xs">{short(e.buyer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
