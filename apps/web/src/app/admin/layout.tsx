import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Gate **server-side** del back-office (RNF-13, cierre de auditoría FASE 4.5): sin una sesión
 * SIWE válida (cookie HMAC verificada en servidor) NO se renderiza ni se envía ningún panel de
 * administración; el visitante solo recibe la pantalla de acceso. El login SIWE sigue siendo
 * client-side (firma de wallet) y, al conceder sesión, refresca para re-evaluar este gate.
 * La autoridad última de cada acción es el contrato (`onlyRole`); esto es defensa en profundidad.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return <AdminSignInScreen />;
  return <>{children}</>;
}
