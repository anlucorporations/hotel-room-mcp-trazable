import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-slate-600">{t("tagline")}</p>
      </header>
      <section
        aria-label={t("catalogComingSoon")}
        className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-700"
      >
        {t("catalogComingSoon")}
      </section>
    </main>
  );
}
