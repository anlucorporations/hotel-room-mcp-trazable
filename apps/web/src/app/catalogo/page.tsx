import { getTranslations } from "next-intl/server";
import { BookingBar } from "@/components/booking/BookingBar";
import { CatalogClient } from "@/components/CatalogClient";
import { DegradedState } from "@/components/DegradedState";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchCatalog, fetchContractPaused } from "@/lib/nights";

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
  const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : null;
  const nights = catalog?.nights ?? null;
  // F9: cuántas noches se retiraron por estar ya vendidas. Sirve para decirlo con honestidad en
  // lugar de dejar que un índice desfasado se parezca a un hotel lleno.
  const hiddenSoldCount = catalog?.hiddenSoldCount ?? 0;
  const paused: boolean | null = pausedResult.status === "fulfilled" ? pausedResult.value : null;

  return (
    <PublicShell>
      <header className="mx-auto w-full max-w-6xl px-5 pt-10">
        <h1 className="font-display text-h1 font-medium">{t("pageTitle")}</h1>
        <p className="mt-3 max-w-prose text-body text-ink-soft">{t("pageTagline")}</p>
      </header>
      {/* Barra de reserva (Fase C.2): el catálogo es la pantalla de decisión, así que la
          disponibilidad se consulta sin volver a la home. */}
      <div className="mx-auto w-full max-w-6xl px-5 pt-6">
        <BookingBar variant="inline" />
      </div>
      {nights === null ? (
        <div className="mx-auto w-full max-w-6xl px-5 py-8">
          <DegradedState />
        </div>
      ) : (
        <>
          {hiddenSoldCount > 0 && (
            // Aviso de sincronización, no de error: lo que se oculta es lo que la cadena ya vendió.
            <p
              data-testid="catalog-sync-notice"
              role="status"
              className="mx-auto mt-6 w-full max-w-6xl rounded-brand-lg border border-info/40 bg-info-bg px-5 py-3 text-small text-info"
            >
              {t("syncingNotice", { count: hiddenSoldCount })}
            </p>
          )}
          <CatalogClient nights={nights} paused={paused} />
        </>
      )}
    </PublicShell>
  );
}
