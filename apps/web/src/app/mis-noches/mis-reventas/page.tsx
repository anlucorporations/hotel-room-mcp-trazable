import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { MyResales } from "@/components/my-nights/MyResales";

// El descubrimiento on-chain vive en cliente (wagmi + TanStack Query, ADR-09).
export const dynamic = "force-dynamic";

/** Gestión de reventas del huésped (RF-36/RF-37, CU-36/CU-37). */
export default async function MyResalesPage() {
  const t = await getTranslations("myResales");
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <MyResales />
      </div>
    </PublicShell>
  );
}
