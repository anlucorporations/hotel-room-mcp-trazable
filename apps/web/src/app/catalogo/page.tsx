import { getTranslations } from "next-intl/server";
import { CatalogClient } from "@/components/CatalogClient";
import { DegradedState } from "@/components/DegradedState";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchCatalog, fetchContractPaused, type NightView } from "@/lib/nights";

// Lectura por RPC en cada request (la caché vive en TanStack en cliente, ADR-09).
export const dynamic = "force-dynamic";

/**
 * Catálogo de noches de la suite pública (F6 · D-31).
 *
 * Hasta F6 el catálogo vivía en `/`; la suite pública pasa a tener su **home one-page** en `/` y el
 * catálogo se sirve aquí, en `/catalogo`, con la misma parrilla, filtros y compra de siempre.
 */
export default async function CatalogPage() {
  const t = await getTranslations("catalog");
  // Las dos lecturas van en paralelo pero se resuelven por separado (M7 · H9): si fallara la pausa
  // dentro del mismo `Promise.all`, el catálogo entero caería a estado degradado y el tercer estado
  // del aviso («no se pudo comprobar») sería inalcanzable.
  const [catalogResult, pausedResult] = await Promise.allSettled([
    fetchCatalog(),
    fetchContractPaused(),
  ]);
  const nights: NightView[] | null = catalogResult.status === "fulfilled" ? catalogResult.value : null;
  const paused: boolean | null = pausedResult.status === "fulfilled" ? pausedResult.value : null;

  return (
    <PublicShell>
      <header className="mx-auto w-full max-w-6xl px-5 pt-10">
        <h1 className="font-display text-h1 font-medium">{t("pageTitle")}</h1>
        <p className="mt-3 max-w-prose text-body text-ink-soft">{t("pageTagline")}</p>
      </header>
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
