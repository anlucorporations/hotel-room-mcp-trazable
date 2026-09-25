import { getTranslations } from "next-intl/server";
import { CatalogClient } from "@/components/CatalogClient";
import { Hero } from "@/components/catalog/Hero";
import { DegradedState } from "@/components/DegradedState";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchCatalog, fetchContractPaused, type NightView } from "@/lib/nights";

// Lectura por RPC en cada request (la caché vive en TanStack en cliente, ADR-09).
export const dynamic = "force-dynamic";

const HOW_STEPS = ["connect", "reserve", "own"] as const;

/**
 * Bloque «Cómo funciona» (UX#1): tres pasos (conectar wallet → reservar con ETH →
 * tu noche traspasable) que contextualizan al primerizo entre el hero y el catálogo.
 * Estático, accesible y mobile-first.
 */
async function HowItWorks() {
  const t = await getTranslations("howItWorks");

  return (
    <section
      aria-labelledby="how-it-works-title"
      className="border-y border-line/70 bg-sand-2/60"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-9 desktop:py-10">
        <h2 id="how-it-works-title" className="font-display text-h3 font-medium">
          {t("title")}
        </h2>
        <p className="mt-2 max-w-prose text-small text-ink-soft">{t("subtitle")}</p>
        <ol className="mt-6 grid gap-4 tablet:grid-cols-3">
          {HOW_STEPS.map((step, index) => (
            <li
              key={step}
              className="rounded-brand border border-line bg-shell p-5"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sea/10 font-display text-small font-semibold text-sea-deep"
              >
                {index + 1}
              </span>
              <h3 className="mt-3 font-display text-body font-semibold text-ink">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="mt-1.5 text-small text-ink-soft">{t(`steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default async function HomePage() {
  // Las dos lecturas van en paralelo pero se resuelven por separado (M7 · H9): si fallara la pausa
  // dentro del mismo `Promise.all`, el catálogo entero caería a estado degradado y el tercer estado
  // del aviso («no se pudo comprobar») sería inalcanzable.
  const [catalogResult, pausedResult] = await Promise.allSettled([
    fetchCatalog(),
    fetchContractPaused(),
  ]);
  const nights: NightView[] | null =
    catalogResult.status === "fulfilled" ? catalogResult.value : null;
  const paused: boolean | null = pausedResult.status === "fulfilled" ? pausedResult.value : null;

  return (
    <PublicShell>
      <Hero />
      <HowItWorks />
      {nights === null ? (
        <div className="mx-auto w-full max-w-6xl px-5 py-8">
          <DegradedState />
        </div>
      ) : (
        <CatalogClient nights={nights} paused={paused} />
      )}
    </PublicShell>
  );
}
