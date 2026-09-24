import type { ReactNode } from "react";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { currentAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * Gate **server-side** del back-office (RNF-13, D-04).
 *
 * Verifica la sesión canónica de las cookies HttpOnly (`hotel_access_token` /
 * `hotel_refresh_token`) **en el render**: firma, caducidad y blocklist de Redis, con el mismo
 * guard que protege las rutas de API. Sin sesión válida se sirve la pantalla de acceso.
 *
 * Hasta M7 este gate solo comprobaba la PRESENCIA de la cookie, y en el App Router la página se
 * renderiza igualmente (el layout decide si la pinta): con una cookie inventada —o sin ninguna— el
 * HTML y el flujo RSC incluían el panel con sus cifras. Lo detectó la verificación adversarial de
 * M7 con el build real (HTTP 200 sin cookies en `/admin/dashboard`). Por eso la comprobación de
 * validez vive aquí Y en cada página que lee datos (defensa en profundidad: el layout puede
 * ocultar el árbol, no impide que se renderice).
 */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = await currentAdminSession();
  if (!session.ok) return <AdminSignInScreen />;
  return <>{children}</>;
}
