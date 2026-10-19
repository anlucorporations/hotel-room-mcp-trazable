import { getTranslations } from "next-intl/server";
import { DamageChargesRepository, NFTsRepository, RoomsRepository } from "@hotel/shared";
import { currentHousekeepingSession } from "@/lib/housekeeping-suite/session";
import { DamageChargeForm } from "@/components/housekeeping/DamageChargeForm";
import type { DamageNotificationView } from "@/lib/damages/types";

export const dynamic = "force-dynamic";

/** Cargos por daños (F7 · T7.2/T7.7): alta desde la suite y estado de los avisos. */
export default async function AmaDeLlavesDamagesPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("damages");
  const [rooms, sold, checkedIn, charges] = await Promise.all([
    new RoomsRepository().listRooms().catch(() => []),
    new NFTsRepository().queryCatalog({ status: "SOLD", limit: 50 }).catch(() => null),
    new NFTsRepository().queryCatalog({ status: "CHECKED_IN", limit: 50 }).catch(() => null),
    new DamageChargesRepository().listNotifications({ limit: 50 }).catch(() => []),
  ]);
  const tokens = [...(sold?.items ?? []), ...(checkedIn?.items ?? [])]
    .filter((nft) => nft.roomNumber !== null)
    .map((nft) => ({
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber as number,
      label: `${nft.roomNumber} · ${nft.checkInDate} · ${nft.status}`,
    }));

  const initialCharges: DamageNotificationView[] = charges.map((charge) => ({
    id: charge.id,
    status: charge.status,
    channel: charge.channel,
    dueDate: charge.dueDate.toISOString(),
    concept: charge.concept,
    amountCents: charge.amountCents,
    currency: charge.currency,
    damageDescription: charge.damageDescription,
    roomNumber: charge.roomNumber,
    evidencePath: charge.evidencePath,
    disputedAt: charge.disputedAt?.toISOString() ?? null,
    resolvedAt: charge.resolvedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("pageTitle")}</h1>
        <p className="text-body text-ink-soft">{t("pageTagline")}</p>
      </header>
      {tokens.length === 0 ? (
        <p data-testid="empty-state" className="rounded-brand border border-dashed border-line px-4 py-6 text-small text-ink-soft">
          {t("noSoldNights")}
        </p>
      ) : (
        <DamageChargeForm
          rooms={rooms.map((room) => ({ id: room.id, roomNumber: room.roomNumber }))}
          tokens={tokens}
          initialCharges={initialCharges}
        />
      )}
    </>
  );
}
