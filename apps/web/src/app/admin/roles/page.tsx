import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminRoles } from "@/components/admin/AdminRoles";

export const dynamic = "force-dynamic";

/** Roles y ownership (CU-16): gateado por DEFAULT_ADMIN_ROLE. */
export default function AdminRolesPage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="rolesTitle" descriptionKey="rolesTagline" requiredRole="DEFAULT_ADMIN_ROLE">
        <AdminRoles />
      </AdminPanel>
    </AdminLayout>
  );
}
