import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminExpired } from "@/components/admin/AdminExpired";
import { AdminPanel } from "@/components/admin/AdminPanel";

export const dynamic = "force-dynamic";

/** Caducadas (CU-13): quemar en lote noches expiradas del hotel, gateado por BURNER_ROLE. */
export default function AdminExpiredPage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="expiredTitle" descriptionKey="expiredTagline" requiredRole="BURNER_ROLE">
        <AdminExpired />
      </AdminPanel>
    </AdminLayout>
  );
}
