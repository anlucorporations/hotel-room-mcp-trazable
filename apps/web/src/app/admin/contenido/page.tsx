import { getTranslations } from "next-intl/server";
import { ContentAdmin } from "@/components/admin/content/ContentAdmin";

export const dynamic = "force-dynamic";

/** Gestión del contenido de la home (F6 · D-73/D-74) — solo owner. */
export default async function ContenidoPage() {
  const t = await getTranslations("content");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("adminTitle")}</h1>
        <p className="text-body text-ink-soft">{t("adminTagline")}</p>
      </header>
      <ContentAdmin />
    </div>
  );
}
