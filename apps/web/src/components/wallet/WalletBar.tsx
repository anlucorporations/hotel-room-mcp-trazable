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
      <div data-testid="no-wallet" className="rounded-brand-sm bg-sand-2 px-4 py-3 text-small text-terracotta-text">
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
        className={`${TOUCH} rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60`}
      >
        {isConnecting ? t("connecting") : t("connect")}
      </button>
    );
  }

  if (isWrongNetwork) {
    return (
      <div data-testid="wrong-network" className="flex items-center gap-3 rounded-brand-sm bg-sand-2 px-4 py-2 text-small text-terracotta-text">
        <span>{t("wrongNetwork")}</span>
        <button
          type="button"
          onClick={switchToAppChain}
          className={`${TOUCH} rounded-pill bg-terracotta px-4 font-semibold text-shell transition-colors hover:opacity-90`}
        >
          {t("switchNetwork")}
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="wallet-connected"
      className="inline-flex min-h-touch items-center gap-2 rounded-pill border border-line bg-shell px-4 text-small font-medium text-ink"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-olive shadow-[0_0_0_3px_rgba(94,107,69,0.25)]" />
      {t("connectedAs", { address: address ? short(address) : "" })}
    </div>
  );
}
