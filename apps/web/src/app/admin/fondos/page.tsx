import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminFunds } from "@/components/admin/AdminFunds";
import { AdminPanel } from "@/components/admin/AdminPanel";

export const dynamic = "force-dynamic";

/** Fondos (CU-15): retirar a tesorería, gateado por TREASURER_ROLE (UX). */
export default function AdminFundsPage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="fundsTitle" descriptionKey="fundsTagline" requiredRole="TREASURER_ROLE">
        <AdminFunds />
      </AdminPanel>
    </AdminLayout>
  );
}
