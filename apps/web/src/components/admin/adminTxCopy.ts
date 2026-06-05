"use client";

import { useTranslations } from "next-intl";
import type { TxModalCopy } from "@/components/buy/TxModal";

/**
 * Copy GENÉRICO del ciclo de tx para el back-office (MAJOR#9). Los paneles admin no son una
 * «compra»: el `TxModal` debe decir «Firma la transacción» / «Esperando confirmación» /
 * «Operación completada» / «La operación no se completó», no copy del flujo de reserva. Centralizar
 * aquí evita repetir el objeto en cada panel (DRY) y mantiene un único punto de traducción.
 */
export function useAdminTxCopy(): TxModalCopy {
  const t = useTranslations("admin");
  return {
    review: t("tx.review"),
    reviewHint: t("tx.reviewHint"),
    status: {
      signing: t("tx.signing"),
      pending: t("tx.pending"),
      confirmed: t("tx.confirmed"),
      reverted: t("tx.reverted"),
    },
    statusHint: {
      signing: t("tx.signingHint"),
      pending: t("tx.pendingHint"),
      confirmed: t("tx.confirmedHint"),
      reverted: t("tx.revertedHint"),
    },
  };
}
