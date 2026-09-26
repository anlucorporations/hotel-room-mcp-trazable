import { AdminPanel } from "@/components/admin/AdminPanel";
import { SystemOperations } from "@/components/admin/system/SystemOperations";

export const dynamic = "force-dynamic";

/** Sistemas → Operaciones (RF-45, CU-45): salud del worker indexador. */
export default function SystemOperationsPage() {
  return (
    <AdminPanel
      titleKey="operationsTitle"
      descriptionKey="operationsTagline"
      requiredRole="DEFAULT_ADMIN_ROLE"
    >
      <SystemOperations />
    </AdminPanel>
  );
}
