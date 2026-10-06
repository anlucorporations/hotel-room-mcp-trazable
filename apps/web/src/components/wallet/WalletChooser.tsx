"use client";

import { useTranslations } from "next-intl";
import type { Connector } from "wagmi";

/**
 * Selector de billetera (Fase 3, 2026-10-05).
 *
 * Antes se conectaba directamente con el conector inyectado; ahora se **ofrecen las billeteras
 * disponibles** para que el usuario elija: las descubiertas por **EIP-6963** (con el nombre y el
 * icono que anuncia cada una), **Coinbase Wallet** y **WalletConnect** (esta última solo si la
 * plataforma tiene configurado `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; si no, no aparece).
 *
 * Cada botón lleva `data-testid` con el id del conector, que es lo que usan los E2E.
 */
export function WalletChooser({
  connectors,
  onPick,
}: {
  readonly connectors: readonly Connector[];
  readonly onPick: (connectorId: string) => void;
}) {
  const t = useTranslations("wallet");
  if (connectors.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-line px-1 pb-2" data-testid="wallet-chooser">
      <p className="px-2 pt-1 text-micro font-semibold uppercase tracking-wider text-ink-soft">
        {t("chooseWallet")}
      </p>
      {connectors.map((connector) => (
        <button
          key={connector.id}
          type="button"
          data-testid={`wallet-option-${connector.id}`}
          onClick={() => onPick(connector.id)}
          className="flex min-h-touch w-full items-center gap-2 rounded-brand-sm px-3 text-left text-small text-ink transition-colors hover:bg-mist-2"
        >
          {/* Icono anunciado por EIP-6963 (data-URI); si la billetera no lo anuncia, se omite. */}
          {connector.icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- icono remoto/data-URI pequeño, no pasa por el optimizador
            <img src={connector.icon} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded" />
          ) : null}
          <span>{connector.name}</span>
        </button>
      ))}
    </div>
  );
}
