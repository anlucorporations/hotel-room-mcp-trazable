import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminPause } from "@/components/admin/AdminPause";
import { AdminRoles } from "@/components/admin/AdminRoles";
import { SystemContractState } from "@/components/admin/system/SystemContractState";

export const dynamic = "force-dynamic";

/**
 * Sistemas → Contratos (RF-43, CU-43): estado on-chain en solo lectura + acciones de gobernanza
 * (roles y pausa), reutilizando los componentes existentes.
 */
export default function SystemContractsPage() {
  return (
    <AdminPanel
      titleKey="contractsTitle"
      descriptionKey="contractsTagline"
      requiredRole="DEFAULT_ADMIN_ROLE"
    >
      <div className="flex flex-col gap-6">
        <SystemContractState />
        <AdminRoles />
        <AdminPause />
      </div>
    </AdminPanel>
  );
}
