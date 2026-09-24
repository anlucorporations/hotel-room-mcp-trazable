import { getTranslations } from "next-intl/server";
import { DegradedState } from "@/components/DegradedState";
import { PublicShell } from "@/components/layout/PublicShell";
import { ResaleMarketClient } from "@/components/resale/ResaleMarketClient";
import { fetchResaleMarket, fetchContractPaused, type NightView } from "@/lib/nights";

// Lectura on-chain en cada request: `listingOf` es el estado autoritativo de la reventa (ADR-09).
export const dynamic = "force-dynamic";

/**
 * Vista propia del mercado secundario (D-07). El catálogo (`/`) deja de mostrar reventas: aquí
 * viven los listados vigentes, con su etiqueta y su compra `buyResale` verificada.
 */
export default async function ResalePage() {
  const t = await getTranslations("resale");

  // Lecturas independientes (M7 · H9): un fallo al leer `paused()` no debe tumbar el mercado a
  // estado degradado; se avisa de que no se pudo comprobar el estado del contrato.
  const [marketResult, pausedResult] = await Promise.allSettled([
    fetchResaleMarket(),
    fetchContractPaused(),
  ]);
  const nights: NightView[] | null =
    marketResult.status === "fulfilled" ? marketResult.value : null;
  const paused: boolean | null = pausedResult.status === "fulfilled" ? pausedResult.value : null;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-6xl px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-prose text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <div className="mt-8">
          {nights === null ? (
            <DegradedState message={t("degraded")} />
          ) : (
            <ResaleMarketClient nights={nights} paused={paused} />
          )}
        </div>
      </div>
    </PublicShell>
  );
}
