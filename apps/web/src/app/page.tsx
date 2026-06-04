import { getTranslations } from "next-intl/server";
import { CatalogClient } from "@/components/CatalogClient";
import { DegradedState } from "@/components/DegradedState";
import { WalletBar } from "@/components/wallet/WalletBar";
import { fetchAvailableNights, type NightView } from "@/lib/nights";

// Lectura por RPC en cada request (la caché vive en TanStack en cliente, ADR-09).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("home");

  let nights: NightView[] | null = null;
  try {
    nights = await fetchAvailableNights();
  } catch {
    nights = null; // RPC caído → estado degradado
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-slate-600">{t("tagline")}</p>
        </div>
        <WalletBar />
      </header>

      {nights === null ? <DegradedState /> : <CatalogClient nights={nights} />}
    </main>
  );
}
