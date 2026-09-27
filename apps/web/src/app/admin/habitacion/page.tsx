import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { RoomsAdmin } from "@/components/admin/rooms/RoomsAdmin";

export const dynamic = "force-dynamic";

/** Sección 1 del back-office: gestión de habitaciones (F1 · D-1…D-26). */
export default function AdminRoomsPage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="roomsTitle" descriptionKey="roomsTagline" requiredRole="DEFAULT_ADMIN_ROLE">
        <RoomsAdmin />
      </AdminPanel>
    </AdminLayout>
  );
}
