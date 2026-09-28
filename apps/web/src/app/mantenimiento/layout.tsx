import type { ReactNode } from "react";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { currentAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * Puerta de la suite del técnico de mantenimiento (2026-09-28).
 *
 * La suite pública es la única que se abre **sin** sesión; a partir de aquí todo exige una sesión
 * verificada en servidor con el rol correspondiente (el owner entra a todas). MAINTENANCE es un rol de
 * BD **sin wallet** (D-56): el acceso es contraseña + TOTP, y la wallet no interviene.
 *
 * La comprobación vive en el layout **y** en el componente de la página (defensa en profundidad):
 * un layout puede ocultar el árbol, no impedir que se renderice (lección de M7 · H1).
 */
export default async function SuiteLayout({ children }: { children: ReactNode }) {
  const session = await currentAdminSession("MAINTENANCE");
  if (!session.ok) return <AdminSignInScreen />;
  return <>{children}</>;
}
