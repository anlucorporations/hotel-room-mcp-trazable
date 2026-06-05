import { getTranslations } from "next-intl/server";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { PublicShell } from "@/components/layout/PublicShell";

export default async function AsistentePage() {
  const t = await getTranslations("assistant");
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <AssistantChat />
      </div>
    </PublicShell>
  );
}
