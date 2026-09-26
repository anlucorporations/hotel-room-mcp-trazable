# Plan de desarrollo · Incremento v3 (menú de wallet + Sistemas)

> Plan vertical por hitos; cada hito cierra con `pnpm typecheck` y sus pruebas en verde.

## Contexto técnico

- Back-office: `apps/web/src/app/admin/*`, `components/admin/*` (`AdminLayout`, `AdminPanel`, `adminNav.ts`), `lib/guard.ts`, `lib/admin-roles.ts`.
- Sitio público: `components/layout/SiteHeader.tsx` + `components/wallet/WalletBar.tsx` + `useOnboarding`.
- Identidad: `admin_users` vía `UsersRepository`; `AuthService.provisionUser` ya genera contraseña + TOTP + rescate.
- Contrato: `HotelNights` (ABI en `packages/shared/src/abi`); componentes `AdminRoles`, `AdminPause`, `AdminFunds`.
- Agregados/estado: worker `/health`, `/aggregates`, `/history` vía `lib/worker-api.ts`.

---

## H1 · Menú desplegable unificado (`WalletMenu`)

**Objetivo**: un solo desplegable en el back-office y en la cabecera pública.
1. `components/wallet/WalletMenu.tsx` (client): botón con título (usuario+rol o wallet) y panel con Seguridad, Usuarios, Roles, Salir y acciones de wallet.
2. Helper puro `lib/wallet-menu-items.ts` con las entradas visibles según `{ hasSession, isOwner, isConnected, isWrongNetwork }` (testeable).
3. Integrarlo en `AdminLayout` (sustituye chip de usuario + WalletBar) y en `SiteHeader` (sustituye/absorbe WalletBar).
4. i18n `walletMenu` ES/EN/RU.

**Cierre**: typecheck; test del helper; a11y (roles ARIA, cierre con Escape).

---

## H2 · Sección Sistemas (owner-only)

**Objetivo**: navegación agrupada y landing.
1. `adminNav.ts`: añadir el grupo `sistemas` con hijos (contratos, usuarios, finanzas, operaciones), gated a `DEFAULT_ADMIN_ROLE`.
2. `AdminLayout.Sidebar`: renderizar grupo e hijos.
3. `app/admin/sistemas/page.tsx`: landing con tarjetas a las 4 subsecciones.
4. `AdminPanel` para el gating de UI.

**Cierre**: owner ve Sistemas; recepción no.

---

## H3 · Usuarios

**Objetivo**: gestión real de operadores.
1. `UsersRepository.listAll()` (+ test con pool mockeado).
2. `apps/web/src/app/api/admin/system/users/route.ts`: GET (lista, sin secretos), POST (alta/rotación vía `AuthService.provisionUser`), PATCH (activar/desactivar). Owner-only; un owner no puede desactivarse a sí mismo.
3. `components/admin/system/SystemUsers.tsx`: tabla + formulario de alta/rotación + toggle activo; muestra credenciales en claro una vez.
4. Página `app/admin/sistemas/usuarios/page.tsx` (gate server-side con `currentAdminSession`).
5. Tests de la API (401/403, listado sin secretos, alta, validación de rol, desactivación).

**Cierre**: API probada; pantalla operativa.

---

## H4 · Contratos y Finanzas

**Objetivo**: estado y acciones dentro de Sistemas.
1. `SystemContracts.tsx`: resumen on-chain (address, chainId, deploymentBlock, paused, treasury, minListingPrice, owner) + embebe `AdminRoles` y `AdminPause`.
2. `SystemFinances.tsx`: embebe `AdminFunds` + resumen de agregados (`fetchAggregates`).
3. Páginas `app/admin/sistemas/{contratos,finanzas}/page.tsx`.

**Cierre**: acciones de gobernanza y retirada accesibles desde Sistemas.

---

## H5 · Operaciones

**Objetivo**: salud operativa.
1. `lib/worker-api.ts`: `fetchWorkerHealth()` (timeout, sin caché).
2. `app/api/admin/system/operations/route.ts`: owner-only; devuelve el health del worker normalizado.
3. `SystemOperations.tsx` + página: estado del worker, lag, fallos, degradaciones y último checkpoint.

**Cierre**: estado degradado explícito si el worker no responde.

---

## H6 · Seguridad del operador

**Objetivo**: autogestión de credenciales.
1. `app/api/auth/password/route.ts`: POST `{ currentPassword, newPassword }`; verifica la actual, hashea la nueva, invalida intentos fallidos; **cualquier rol de back-office** sobre su propia cuenta.
2. Ampliar `app/api/auth/mfa/setup/route.ts` para aceptar cualquier rol de back-office (hoy exige owner) sobre la propia cuenta.
3. `components/admin/AdminSecurity.tsx` + página `app/admin/seguridad/page.tsx`: rotar MFA y cambiar contraseña.
4. Tests: contraseña incorrecta → 401; cambio correcto; rotación de MFA.

**Cierre**: autogestión probada.

---

## H7 · Verificación y cierre

1. `pnpm --filter @hotel/shared typecheck` y `@hotel/web typecheck`.
2. Suites `@hotel/shared` y `@hotel/web`; guardianes (boundaries, a11y, paused, documentation).
3. `pnpm --filter @hotel/web build`.
4. Artefactos de datos (`diccionario_datos.md`, `diagrama_er.md`, `base_datos.sql`) sincronizados.
5. `estado_proyecto.md` y SRS (catálogo CU-40…CU-46) actualizados.
6. Commit y push a `anlucorporations/Hotel-DSH-GCP` (origin + github).

**Cierre**: todo en verde o deuda declarada.

---

## Estimación relativa

| Hito | Esfuerzo | Depende de |
|---|---|---|
| H1 | M | — |
| H2 | S | H1 |
| H3 | L | H2 |
| H4 | M | H2 |
| H5 | M | H2 |
| H6 | M | H1 |
| H7 | S | H1–H6 |
