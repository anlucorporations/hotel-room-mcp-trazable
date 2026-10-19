import { getTranslations } from "next-intl/server";
import { GuestChargeView } from "@/components/guest/GuestChargeView";

export const dynamic = "force-dynamic";

/** Aviso de cargo por daños para el huésped (F7 · T7.4): consultar, reclamar o aceptar. */
export default async function GuestChargePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("damages");
  const { id } = await params;
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("guestDetailTitle")}</h1>
        <p className="text-body text-ink-soft">{t("guestDetailTagline")}</p>
      </header>
      <GuestChargeView id={id} />
    </>
  );
}
