import { getTranslations } from "next-intl/server";
import { MyNights } from "@/components/my-nights/MyNights";

// El descubrimiento de noches vive en cliente (wagmi + TanStack Query, ADR-09).
export const dynamic = "force-dynamic";

export default async function MyNightsPage() {
  const t = await getTranslations("myNights");
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-slate-600">{t("tagline")}</p>
      </header>
      <MyNights />
    </main>
  );
}
