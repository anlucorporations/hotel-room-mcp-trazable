import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * Entrada del portal de cargos por daños (F7 · T7.4).
 *
 * El aviso se abre con el enlace recibido (UUID de la notificación). La vista no expone datos de
 * otras estancias ni requiere cuenta: el enlace es la capacidad.
 */
export default async function GuestChargesPage() {
  const t = await getTranslations("damages");
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("guestPageTitle")}</h1>
        <p className="text-body text-ink-soft">{t("guestPageTagline")}</p>
      </header>
      <p className="rounded-brand border border-line px-4 py-3 text-small text-ink-soft">{t("guestPageHint")}</p>
      <Link href="/mis-noches" className="text-small font-semibold text-azure underline">{t("backToMyNights")}</Link>
    </>
  );
}
