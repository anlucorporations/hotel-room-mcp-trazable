import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CatalogClient } from "@/components/CatalogClient";
import { DegradedState } from "@/components/DegradedState";
import { WalletBar } from "@/components/wallet/WalletBar";
import { fetchCatalog, type NightView } from "@/lib/nights";

// Lectura por RPC en cada request (la caché vive en TanStack en cliente, ADR-09).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("home");

  let nights: NightView[] | null = null;
  try {
    nights = await fetchCatalog();
  } catch {
    nights = null; // RPC caído → estado degradado
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-slate-600">{t("tagline")}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/historico"
              className="min-h-touch self-center rounded-md border border-slate-300 px-4 py-2 font-medium"
            >
              {t("historyLink")}
            </Link>
            <Link
              href="/mis-noches"
              className="min-h-touch self-center rounded-md border border-slate-300 px-4 py-2 font-medium"
            >
              {t("myNightsLink")}
            </Link>
          </nav>
        </div>
        <WalletBar />
      </header>

      {nights === null ? <DegradedState /> : <CatalogClient nights={nights} />}
    </main>
  );
}
