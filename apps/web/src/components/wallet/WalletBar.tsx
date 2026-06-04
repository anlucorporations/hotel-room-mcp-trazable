"use client";

import { useTranslations } from "next-intl";
import { useOnboarding } from "./useOnboarding";

const TOUCH = "min-h-touch min-w-touch";

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Barra de onboarding/estado de wallet (CU-17, RNF-19). */
export function WalletBar() {
  const t = useTranslations("wallet");
  const { hasWallet, isConnected, address, isWrongNetwork, isConnecting, connect, switchToAppChain } =
    useOnboarding();

  if (!hasWallet) {
    return (
      <div data-testid="no-wallet" className="rounded-md bg-amber-50 px-4 py-3 text-amber-800">
        {t("noWallet")}{" "}
        <a className="font-semibold underline" href="https://metamask.io/download/">
          {t("installMetamask")}
        </a>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={isConnecting}
        className={`${TOUCH} rounded-md bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-60`}
      >
        {isConnecting ? t("connecting") : t("connect")}
      </button>
    );
  }

  if (isWrongNetwork) {
    return (
      <div data-testid="wrong-network" className="flex items-center gap-3 rounded-md bg-red-50 px-4 py-3 text-red-800">
        <span>{t("wrongNetwork")}</span>
        <button
          type="button"
          onClick={switchToAppChain}
          className={`${TOUCH} rounded-md bg-red-700 px-3 py-1 font-semibold text-white`}
        >
          {t("switchNetwork")}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="wallet-connected" className="rounded-md bg-emerald-50 px-4 py-2 text-emerald-800">
      {t("connectedAs", { address: address ? short(address) : "" })}
    </div>
  );
}
