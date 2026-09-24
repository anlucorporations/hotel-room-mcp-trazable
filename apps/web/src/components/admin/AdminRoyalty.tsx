"use client";

import { useTranslations } from "next-intl";
import { AdminCard } from "./AdminPanel";

/**
 * Porcentajes de royalty de reventa FIJADOS POR CONSTRUCCIÓN en `HotelNights.sol` (D-06):
 * 5 % para simple y doble (habitaciones 101–130) y 10 % para suite (201–220). No existe
 * almacenamiento, setter ni rol de royalty; por eso este panel es solo informativo y no
 * ofrece ninguna transacción. `royaltyInfo(tokenId, salePrice)` (ERC-2981) es la fuente única.
 */
const ROYALTY_RATES = [
  { type: "simple", bps: 500, rooms: "101–130" },
  { type: "doble", bps: 500, rooms: "101–130" },
  { type: "suite", bps: 1000, rooms: "201–220" },
] as const;

/** bps → porcentaje entero legible (500 → «5», 1000 → «10»). */
const bpsToPercent = (bps: number): string => (bps / 100).toString();

/**
 * Royalty (D-06, informativo): explica que el porcentaje se fija al crear la noche según el
 * tipo de habitación y no puede modificarse después, y muestra los tres tipos con su
 * porcentaje. Sin formulario, sin envío de transacción y sin rol de royalty (eliminado del
 * contrato): el royalty es inmutable y `royaltyInfo` es la fuente única.
 */
export function AdminRoyalty() {
  const t = useTranslations("admin");
  const tRoomType = useTranslations("roomType");

  return (
    <AdminCard>
      <p data-testid="royalty-current" className="text-ink">
        {t("royaltyImmutable")}
      </p>

      <h2 className="mt-5 font-display text-h3 font-semibold text-ink">
        {t("royaltyRatesTitle")}
      </h2>
      <dl data-testid="royalty-rates" className="mt-3 flex flex-col gap-2">
        {ROYALTY_RATES.map((rate) => (
          <div key={rate.type} className="flex items-baseline justify-between gap-4">
            <dt className="text-small text-ink">
              {tRoomType(rate.type)} <span className="text-ink-soft">({rate.rooms})</span>
            </dt>
            <dd className="text-small font-semibold text-ink">
              {bpsToPercent(rate.bps)} %
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-small text-ink-soft">{t("royaltySourceNote")}</p>
    </AdminCard>
  );
}
