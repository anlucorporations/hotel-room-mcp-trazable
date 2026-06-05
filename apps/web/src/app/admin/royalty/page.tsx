import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminRoyalty } from "@/components/admin/AdminRoyalty";

export const dynamic = "force-dynamic";

/** Royalty (CU-12): fijar el porcentaje de royalty, gateado por ROYALTY_ADMIN_ROLE. */
export default function AdminRoyaltyPage() {
  return (
    <AdminLayout>
      <AdminPanel
        titleKey="royaltyTitle"
        descriptionKey="royaltyTagline"
        requiredRole="ROYALTY_ADMIN_ROLE"
      >
        <AdminRoyalty />
      </AdminPanel>
    </AdminLayout>
  );
}
