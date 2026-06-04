import { useTranslations } from "next-intl";
import { BuyButton } from "@/components/buy/BuyButton";
import { NightImage } from "@/components/NightImage";
import { formatEth, formatNightDate, TYPE_LABEL } from "@/lib/format";
import type { NightView } from "@/lib/nights";

/** Tarjeta de una noche del catálogo (CU-04). */
export function NightCard({ night }: { night: NightView }) {
  const t = useTranslations("catalog");
  const alt = t("imageAlt", {
    type: TYPE_LABEL[night.type],
    room: night.room,
    date: formatNightDate(night.dateYYYYMMDD),
  });

  return (
    <article
      data-testid={`night-${night.tokenId}`}
      className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <NightImage type={night.type} alt={alt} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t("room", { room: night.room })}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {TYPE_LABEL[night.type]}
          </span>
        </div>
        <p className="text-sm text-slate-600">{formatNightDate(night.dateYYYYMMDD)}</p>
        <p className="text-lg font-bold">{formatEth(night.priceWei)}</p>
        {night.saleType === "SECONDARY" ? (
          <span className="text-xs font-medium text-amber-700">{t("resale")}</span>
        ) : (
          <span className="text-xs font-medium text-emerald-700">{t("available")}</span>
        )}
        <div className="mt-auto pt-2">
          <BuyButton
            tokenId={night.tokenId}
            priceWei={night.priceWei}
            saleType={night.saleType}
          />
        </div>
      </div>
    </article>
  );
}
