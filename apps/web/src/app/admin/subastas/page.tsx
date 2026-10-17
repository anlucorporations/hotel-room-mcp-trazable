import { AdminAuctions, type AdminAuctionCandidate } from "@/components/admin/AdminAuctions";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { fetchCatalog } from "@/lib/nights";

// El inventario y las subastas se leen en cada request (sin caché intermedia, ADR-09).
export const dynamic = "force-dynamic";

/**
 * Subastas del hotel (C2 · RF-13, CU-48).
 *
 * Las candidatas son las noches **en venta del hotel** que son **suite** (RF-13: premium), leídas del
 * catálogo primario. La forma de la subasta la decide el contrato: `createAuction` exige que la noche
 * siga siendo inventario del hotel, futura, no vendida y sin check-in.
 */
export default async function AdminAuctionsPage() {
  const catalog = await fetchCatalog().catch(() => ({ nights: [], hiddenSoldCount: 0 }));
  const candidates: AdminAuctionCandidate[] = catalog.nights
    .filter((night) => night.type === "suite")
    .map((night) => ({
      tokenId: night.tokenId,
      room: night.room,
      dateYYYYMMDD: night.dateYYYYMMDD,
      priceWei: night.priceWei,
    }));

  return (
    <AdminLayout>
      <AdminPanel
        titleKey="auctionsTitle"
        descriptionKey="auctionsTagline"
        requiredRole="MINTER_ROLE"
      >
        <AdminAuctions candidates={candidates} />
      </AdminPanel>
    </AdminLayout>
  );
}
