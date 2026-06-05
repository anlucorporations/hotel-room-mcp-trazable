import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { WalletBar } from "@/components/wallet/WalletBar";

export default async function AsistentePage() {
  const t = await getTranslations("assistant");
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-slate-600">{t("tagline")}</p>
          </div>
          <Link
            href="/"
            className="min-h-touch self-center rounded-md border border-slate-300 px-4 py-2 font-medium"
          >
            {t("backToCatalog")}
          </Link>
        </div>
        <WalletBar />
      </header>

      <AssistantChat />
    </main>
  );
}
