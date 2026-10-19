import { AdminPanel } from "@/components/admin/AdminPanel";
import { SettingsAdmin } from "@/components/admin/system/SettingsAdmin";
import { FlagsPanel } from "@/components/admin/system/FlagsPanel";

export const dynamic = "force-dynamic";

/** Sistemas → Ajustes (D-11/D-37/D-42): configuración de plataforma sin desplegar. */
export default function SystemSettingsPage() {
  return (
    <AdminPanel titleKey="settingsTitle" descriptionKey="settingsTagline" requiredRole="DEFAULT_ADMIN_ROLE">
      <SettingsAdmin />
      <FlagsPanel />
    </AdminPanel>
  );
}
