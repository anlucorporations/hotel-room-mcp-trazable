import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { RoomsBoardAdmin } from "@/components/admin/rooms/RoomsBoardAdmin";

export const dynamic = "force-dynamic";

/**
 * Subsección **Publicar** (2026-10-04): mapa de disponibilidad y gestión del día.
 *
 * Sustituye a la antigua «Publicar noche» (`/admin/mint`): el minteo on-chain de una noche se
 * conserva dentro del panel del día, con la habitación y la fecha ya elegidas. El acceso es de
 * owner y recepción; publicar y acuñar siguen exigiendo owner/`MINTER_ROLE` en sus propios
 * endpoints y se deshabilitan en la interfaz para quien no los tiene.
 */
export default function AdminPublishBoardPage() {
  return (
    <AdminLayout>
      <AdminPanel
        titleKey="publishBoardTitle"
        descriptionKey="publishBoardTagline"
        requiredRole={["DEFAULT_ADMIN_ROLE", "RECEPTION_ROLE"]}
      >
        <RoomsBoardAdmin />
      </AdminPanel>
    </AdminLayout>
  );
}
