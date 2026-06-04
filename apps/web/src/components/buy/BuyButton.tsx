"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SaleType } from "@hotel/shared";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { TxModal } from "./TxModal";
import { useBuyNight } from "./useBuyNight";

const BTN = "min-h-touch w-full rounded-md px-4 py-2 font-semibold text-white disabled:opacity-60";

/** Botón de compra primaria/reventa: onboarding (CU-17) + firma + TxModal (CU-05/07). */
export function BuyButton({
  tokenId,
  priceWei,
  saleType,
}: {
  tokenId: string;
  priceWei: string;
  saleType: SaleType;
}) {
  const t = useTranslations("buy");
  const router = useRouter();
  const { hasWallet, isConnected, isWrongNetwork, connect, switchToAppChain } = useOnboarding();
  const { buy, buyResale, reset, status } = useBuyNight();

  // Tras confirmarse la compra, refresca el catálogo (RSC) para que la noche vendida salga.
  useEffect(() => {
    if (status === "confirmed") router.refresh();
  }, [status, router]);

  const busy = status === "signing" || status === "pending";

  function onClick(): void {
    if (!isConnected) return connect();
    if (isWrongNetwork) return switchToAppChain();
    if (saleType === "SECONDARY") buyResale(tokenId, priceWei);
    else buy(tokenId, priceWei);
  }

  const label = !hasWallet
    ? t("needWallet")
    : !isConnected
      ? t("connectToBuy")
      : isWrongNetwork
        ? t("switchToBuy")
        : saleType === "SECONDARY"
          ? t("buyResale")
          : t("buy");

  return (
    <>
      <button
        type="button"
        data-testid={`buy-${tokenId}`}
        disabled={!hasWallet || busy}
        onClick={onClick}
        className={`${BTN} bg-sky-700`}
      >
        {busy ? t("processing") : label}
      </button>
      <TxModal status={status} onClose={reset} />
    </>
  );
}
