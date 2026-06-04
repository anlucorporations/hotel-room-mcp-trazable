"use client";

import { useTranslations } from "next-intl";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { TxModal } from "./TxModal";
import { useBuyNight } from "./useBuyNight";

const BTN = "min-h-touch w-full rounded-md px-4 py-2 font-semibold text-white disabled:opacity-60";

/** Botón de compra primaria que integra onboarding (CU-17) + firma + TxModal (CU-05). */
export function BuyButton({ tokenId, priceWei }: { tokenId: string; priceWei: string }) {
  const t = useTranslations("buy");
  const { hasWallet, isConnected, isWrongNetwork, connect, switchToAppChain } = useOnboarding();
  const { buy, reset, status } = useBuyNight();

  const busy = status === "signing" || status === "pending";

  function onClick(): void {
    if (!isConnected) return connect();
    if (isWrongNetwork) return switchToAppChain();
    buy(tokenId, priceWei);
  }

  const label = !hasWallet
    ? t("needWallet")
    : !isConnected
      ? t("connectToBuy")
      : isWrongNetwork
        ? t("switchToBuy")
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
