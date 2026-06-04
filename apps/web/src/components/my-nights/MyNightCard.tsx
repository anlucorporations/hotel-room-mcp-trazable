"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { parseEther } from "viem";
import { NightImage } from "@/components/NightImage";
import { TxModal } from "@/components/buy/TxModal";
import { formatEth, formatNightDate, TYPE_LABEL } from "@/lib/format";
import { useListNight } from "./useListNight";
import type { OwnedNight } from "./useMyNights";

const BTN = "min-h-touch w-full rounded-md px-4 py-2 font-semibold text-white disabled:opacity-60";

/** Tarjeta de una noche poseída: listar para reventa o cancelar el listado (CU-06). */
export function MyNightCard({
  night,
  onConfirmed,
}: {
  night: OwnedNight;
  onConfirmed: () => void;
}) {
  const t = useTranslations("myNights");
  const { list, unlist, reset, status } = useListNight();
  const [priceEth, setPriceEth] = useState("");
  const [priceError, setPriceError] = useState(false);

  const busy = status === "signing" || status === "pending";
  const isListed = night.listingPriceWei !== null;

  // Tras confirmarse la tx, refresca los datos (re-lee listingOf/ownerOf).
  useEffect(() => {
    if (status === "confirmed") onConfirmed();
  }, [status, onConfirmed]);

  const alt = t("imageAlt", {
    type: TYPE_LABEL[night.type],
    room: night.room,
    date: formatNightDate(night.dateYYYYMMDD),
  });

  function onList(event: FormEvent): void {
    event.preventDefault();
    const value = Number(priceEth);
    if (!(value > 0)) {
      setPriceError(true);
      return;
    }
    setPriceError(false);
    list(night.tokenId, parseEther(priceEth));
  }

  return (
    <article
      data-testid={`my-night-${night.tokenId}`}
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

        {isListed ? (
          <span className="text-xs font-medium text-amber-700">{t("listedBadge")}</span>
        ) : (
          <span className="text-xs font-medium text-emerald-700">{t("ownedBadge")}</span>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {isListed ? (
            <>
              <p className="text-sm font-semibold">
                {t("listedPrice", { price: formatEth(night.listingPriceWei ?? "0") })}
              </p>
              <button
                type="button"
                data-testid={`unlist-${night.tokenId}`}
                disabled={busy}
                onClick={() => unlist(night.tokenId)}
                className={`${BTN} bg-slate-700`}
              >
                {busy ? t("processing") : t("unlist")}
              </button>
            </>
          ) : (
            <form onSubmit={onList} className="flex flex-col gap-2">
              <label className="flex flex-col text-sm">
                {t("priceLabel")}
                <input
                  data-testid={`list-price-${night.tokenId}`}
                  type="number"
                  step="0.001"
                  min="0"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  aria-invalid={priceError}
                  className="mt-1 min-h-touch rounded-md border border-slate-300 px-3"
                />
              </label>
              {priceError && (
                <p data-testid={`list-error-${night.tokenId}`} role="alert" className="text-sm text-red-700">
                  {t("invalidPrice")}
                </p>
              )}
              <button
                type="submit"
                data-testid={`list-${night.tokenId}`}
                disabled={busy}
                className={`${BTN} bg-sky-700`}
              >
                {busy ? t("processing") : t("list")}
              </button>
            </form>
          )}
        </div>
      </div>

      <TxModal status={status} onClose={reset} />
    </article>
  );
}
