"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { WalletBar } from "@/components/wallet/WalletBar";

/**
 * Marca una acción que **exige firma EIP-712** (F4 · T4.3, RF-S-07).
 *
 * Contrato observable:
 *   · ⛓ + «Requiere firma» con `data-testid="requires-signature"`.
 *   · Sin wallet conectada, el contenedor lleva `data-testid="wallet-disconnected"` y el disparador
 *     queda `disabled` (no se puede ni abrir el flujo de firma).
 *   · El aviso no depende de la acción concreta: cualquier acción crítica se envuelve con esto.
 */
export function SignatureGate({
  requiresSignature,
  enabled,
  children,
  testId,
}: {
  readonly requiresSignature: boolean;
  /** `false` mientras la UI no puede firmar (sin wallet o red incorrecta). */
  readonly enabled: boolean;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  const t = useTranslations("maintenance");

  if (!requiresSignature) {
    return <div data-testid={testId}>{children}</div>;
  }

  return (
    <div className="flex flex-col gap-2" data-testid={enabled ? undefined : "wallet-disconnected"}>
      <p
        data-testid="requires-signature"
        className="inline-flex w-fit items-center gap-1 rounded-pill bg-info-bg px-3 py-1 text-micro font-semibold text-info"
      >
        <span aria-hidden>⛓</span> {t("signature.required")}
      </p>
      {enabled ? (
        <div data-testid={testId}>{children}</div>
      ) : (
        <div className="flex flex-col gap-2 rounded-brand-sm bg-mist-2 px-4 py-3 text-small text-ink-soft">
          <p>{t("signature.connectHint")}</p>
          <WalletBar />
        </div>
      )}
    </div>
  );
}
