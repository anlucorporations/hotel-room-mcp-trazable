"use client";

import { AdminLayout } from "./AdminLayout";

/**
 * Pantalla de acceso del back-office cuando NO hay sesión canónica en servidor (gate RSC en
 * `app/admin/layout.tsx`, `app/admin/sistemas/layout.tsx` y las puertas de las suites de personal).
 *
 * D-04: el acceso es usuario + contraseña + TOTP, no SIWE. Al conceder sesión, el gate re-evalúa el
 * servidor y sirve el contenido: de ese refresco se encarga `AdminLayout` (`SignInGate`), que es
 * quien **comparte la instancia de sesión** con el formulario.
 *
 * **D-82 (arreglo del hallazgo de la release `v12`).** Antes esta pantalla pintaba su propia
 * plantilla —`div` + `header` con marca y `WalletBar` + `main`— y por eso **no pasaba por
 * `AdminLayout`**: el HTML servido sin sesión no contenía ni una sola marca del shell redistribuido
 * (sidebar marino, barra superior con Ayuda, pie), de modo que el rediseño AdminLTE solo era visible
 * con sesión iniciada. Ahora es un envoltorio mínimo que delega en el shell con `gate`, así que el
 * acceso y el panel comparten distribución. Se retira el `WalletBar`: sin sesión no hay transacción
 * que firmar, y la billetera queda en el bloque de sesión del panel Administración (D-81).
 *
 * **2026-10-02.** Se retira también la segunda instancia de `useAdminSession` que vivía aquí: era la
 * causa de que el formulario no desapareciera al iniciar sesión (su `router.refresh()` observaba una
 * sesión que nunca cambiaba). Este componente ya no necesita estado propio.
 */
export function AdminSignInScreen() {
  return (
    <AdminLayout gate>
      <span />
    </AdminLayout>
  );
}
