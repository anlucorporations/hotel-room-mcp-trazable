import { AdminFunds } from "@/components/admin/AdminFunds";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { SystemFinances } from "@/components/admin/system/SystemFinances";

export const dynamic = "force-dynamic";

/**
 * Sistemas → Finanzas (RF-44, CU-44): resumen de agregados + retirada a tesorería (`AdminFunds`).
 */
export default function SystemFinancesPage() {
  return (
    <AdminPanel
      titleKey="financesTitle"
      descriptionKey="financesTagline"
      requiredRole="DEFAULT_ADMIN_ROLE"
    >
      <div className="flex flex-col gap-6">
        <SystemFinances />
        <AdminFunds />
      </div>
    </AdminPanel>
  );
}
