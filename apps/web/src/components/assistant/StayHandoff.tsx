"use client";

import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { decodeTokenId } from "@hotel/shared/domain";
import { PurchaseHandoff } from "./PurchaseHandoff";
import type { PreparedPurchase } from "@/lib/assistant/types";

/** Habitación y fecha de una compra preparada, leídas del `tokenId` (puro, sin tocar la cadena). */
function nightOf(purchase: PreparedPurchase): { room: number | null; dateYYYYMMDD: number | null } {
  try {
    const { room, dateYYYYMMDD } = decodeTokenId(BigInt(purchase.tokenId));
    return { room, dateYYYYMMDD };
  } catch {
    return { room: null, dateYYYYMMDD: null };
  }
}

/**
 * **Reserva de una estancia** (petición del responsable, 2026-10-13: «no se realizan la reserva en
 * rango de fechas»).
 *
 * El asistente prepara una compra por noche —cada noche es una ficha distinta—, y este panel las
 * presenta **juntas, numeradas y en orden de fecha**, con el importe total, para que el huésped las
 * firme una a una sin perder de vista que la reserva es del rango entero. Cada noche reutiliza el
 * handoff de una noche (`PurchaseHandoff`): verificación on-chain, saldo y recibo, idénticos.
 */
export function StayHandoff({
  purchases,
  onOutcome,
}: {
  readonly purchases: readonly PreparedPurchase[];
  /** Desenlace de cada firma como parte de la conversación (una por noche). */
  readonly onOutcome?: (text: string) => void;
}): React.ReactNode {
  const t = useTranslations("assistant");
  if (purchases.length === 0) return null;

  const nights = purchases.map((purchase) => ({ purchase, ...nightOf(purchase) }));
  const total = purchases.reduce((sum, purchase) => sum + BigInt(purchase.tx.value), 0n);

  return (
    <section
      data-testid="stay-handoff"
      aria-label={t("stay.title", { count: purchases.length })}
      className="flex flex-col gap-3 rounded-brand border border-line-strong bg-mist px-4 py-4"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-h3 font-semibold text-ink">
          {t("stay.title", { count: purchases.length })}
        </h3>
        <p className="text-small text-ink-soft">{t("stay.subtitle")}</p>
        <p data-testid="stay-total" className="text-small font-semibold text-ink tabular-nums">
          {t("stay.total", { total: formatEther(total) })}
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {nights.map(({ purchase, room, dateYYYYMMDD }, index) => (
          <li
            key={purchase.tokenId}
            data-testid={`stay-night-${index + 1}`}
            className="flex flex-col gap-2"
          >
            <p className="text-micro font-semibold uppercase tracking-wide text-ink-soft">
              {t("stay.nightOf", { index: index + 1, total: purchases.length })}
              {room !== null ? ` · ${t("highlights.room", { room })}` : ""}
              {dateYYYYMMDD !== null ? ` · ${dateYYYYMMDD}` : ""}
            </p>
            <PurchaseHandoff purchase={purchase} onOutcome={onOutcome} />
          </li>
        ))}
      </ol>

      <p className="text-small text-ink-soft">{t("stay.hint")}</p>
    </section>
  );
}
