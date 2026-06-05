import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminMint } from "@/components/admin/AdminMint";
import { AdminPanel } from "@/components/admin/AdminPanel";

export const dynamic = "force-dynamic";

/** Publicar noche (CU-02): minteo gateado por rol MINTER dentro del back-office. */
export default function AdminMintPage() {
  return (
    <AdminLayout>
      <AdminPanel titleKey="mintTitle" descriptionKey="mintTagline" requiredRole="MINTER_ROLE">
        <AdminMint />
      </AdminPanel>
    </AdminLayout>
  );
}
