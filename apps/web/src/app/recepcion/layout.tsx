import type { ReactNode } from "react";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { PublicShell } from "@/components/layout/PublicShell";
import { currentAdminSession } from "@/lib/admin-session";
import { FrontOfficeShell } from "@/components/reception/FrontOfficeShell";

export const dynamic = "force-dynamic";

/**
 * Layout de la Suite Front Office (F2 · D-32). Conserva `/recepcion` como raíz y anida las
 * funciones de la suite; la barra superior vive en `FrontOfficeShell`.
 *
 * **Acceso**: sesión validada en servidor con rol `RECEPTION_ROLE` (el owner entra). Sin ella se
 * sirve la pantalla de acceso canónica en lugar del panel, para que ninguna lectura se renderice.
 */
export default async function ReceptionLayout({ children }: { children: ReactNode }) {
  // Puerta **en servidor** (2026-09-28): la suite pública es la única que se abre sin sesión. El
  // owner entra a todas; el rol de recepción, solo a la suya.
  const session = await currentAdminSession("RECEPTION_ROLE");
  if (!session.ok) return <AdminSignInScreen />;
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8">
        <FrontOfficeShell>{children}</FrontOfficeShell>
      </div>
    </PublicShell>
  );
}
