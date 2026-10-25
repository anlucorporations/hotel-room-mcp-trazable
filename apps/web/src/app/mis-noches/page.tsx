import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { MyNights } from "@/components/my-nights/MyNights";

// El descubrimiento de noches vive en cliente (wagmi + TanStack Query, ADR-09).
export const dynamic = "force-dynamic";

export default async function MyNightsPage() {
  const t = await getTranslations("myNights");
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-16 tablet:px-8 tablet:py-24">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <MyNights />
      </div>
    </PublicShell>
  );
}
