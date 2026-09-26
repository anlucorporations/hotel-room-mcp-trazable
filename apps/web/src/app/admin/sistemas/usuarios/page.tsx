import { AdminPanel } from "@/components/admin/AdminPanel";
import { SystemUsers } from "@/components/admin/system/SystemUsers";

export const dynamic = "force-dynamic";

/** Sistemas → Usuarios (RF-42, CU-42). El gate owner lo aplica `sistemas/layout.tsx`. */
export default function SystemUsersPage() {
  return (
    <AdminPanel
      titleKey="systemUsersTitle"
      descriptionKey="systemUsersTagline"
      requiredRole="DEFAULT_ADMIN_ROLE"
    >
      <SystemUsers />
    </AdminPanel>
  );
}
