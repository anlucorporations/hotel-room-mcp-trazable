"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminLayout } from "./AdminLayout";
import { useAdminSession } from "./useAdminSession";

/**
 * Pantalla de acceso del back-office cuando NO hay sesión canónica en servidor (gate RSC en
 * `app/admin/layout.tsx`, `app/admin/sistemas/layout.tsx` y las puertas de las suites de personal).
 *
 * D-04: el acceso es usuario + contraseña + TOTP, no SIWE. Al conceder sesión, `router.refresh()`
 * re-evalúa el gate del servidor para servir el contenido.
 *
 * **D-82 (arreglo del hallazgo de la release `v12`).** Antes esta pantalla pintaba su propia
 * plantilla —`div` + `header` con marca y `WalletBar` + `main`— y por eso **no pasaba por
 * `AdminLayout`**: el HTML servido sin sesión no contenía ni una sola marca del shell redistribuido
 * (sidebar marino, barra superior con Ayuda, pie), de modo que el rediseño AdminLTE solo era visible
 * con sesión iniciada. Ahora es un envoltorio mínimo que delega en el shell con `gate`, así que el
 * acceso y el panel comparten distribución. Se retira el `WalletBar`: sin sesión no hay transacción
 * que firmar, y la billetera queda en el bloque de sesión del panel Administración (D-81).
 */
export function AdminSignInScreen() {
  const router = useRouter();
  const session = useAdminSession();

  useEffect(() => {
    if (session.sessionUsername) router.refresh();
  }, [session.sessionUsername, router]);

  return (
    <AdminLayout gate>
      <span />
    </AdminLayout>
  );
}
