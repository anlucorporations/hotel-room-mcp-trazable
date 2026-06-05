import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminPause } from "@/components/admin/AdminPause";

export const dynamic = "force-dynamic";

/** Pausa de emergencia (CU-14): gateada por PAUSER_ROLE. */
export default function AdminPausePage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="pauseTitle" descriptionKey="pauseTagline" requiredRole="PAUSER_ROLE">
        <AdminPause />
      </AdminPanel>
    </AdminLayout>
  );
}
