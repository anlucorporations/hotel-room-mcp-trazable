import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminSecurity } from "@/components/admin/AdminSecurity";

export const dynamic = "force-dynamic";

/** Seguridad y mis datos (RF-46, CU-46): cualquier operador autenticado sobre su propia cuenta. */
export default function AdminSecurityPage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="securityTitle" descriptionKey="securityTagline">
        <AdminSecurity />
      </AdminPanel>
    </AdminLayout>
  );
}
