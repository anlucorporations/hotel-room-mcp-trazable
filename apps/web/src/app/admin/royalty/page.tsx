import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminRoyalty } from "@/components/admin/AdminRoyalty";

export const dynamic = "force-dynamic";

/** Royalty (D-06): panel informativo e inmutable, gateado por DEFAULT_ADMIN_ROLE (gobierno del propietario). */
export default function AdminRoyaltyPage() {
  return (
    <AdminLayout>
      <AdminPanel
        titleKey="royaltyTitle"
        descriptionKey="royaltyTagline"
        requiredRole="DEFAULT_ADMIN_ROLE"
      >
        <AdminRoyalty />
      </AdminPanel>
    </AdminLayout>
  );
}
