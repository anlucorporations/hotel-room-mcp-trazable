import { CatalogClient } from "@/components/CatalogClient";
import { Hero } from "@/components/catalog/Hero";
import { DegradedState } from "@/components/DegradedState";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchCatalog, type NightView } from "@/lib/nights";

// Lectura por RPC en cada request (la caché vive en TanStack en cliente, ADR-09).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let nights: NightView[] | null = null;
  try {
    nights = await fetchCatalog();
  } catch {
    nights = null; // RPC caído → estado degradado
  }

  return (
    <PublicShell>
      <Hero />
      {nights === null ? (
        <div className="mx-auto w-full max-w-6xl px-5 py-8">
          <DegradedState />
        </div>
      ) : (
        <CatalogClient nights={nights} />
      )}
    </PublicShell>
  );
}
