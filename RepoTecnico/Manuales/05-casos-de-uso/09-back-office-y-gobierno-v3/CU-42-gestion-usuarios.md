# CU-42 · Dar de alta, cambiar y quitar usuarios de la plataforma — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Owner · Requisitos: RF-42, RF-42.1

## 1. Ficha y trazabilidad

- **Objetivo.** Gestionar los operadores de la plataforma desde Sistemas → Usuarios: listarlos con
  su rol, estado y bloqueo; crear o rotar sus credenciales (contraseña, TOTP y códigos de rescate);
  y activarlos o desactivarlos.
- **Actor primario.** Owner (`DEFAULT_ADMIN_ROLE`). **Secundario:** ninguno con permiso; recepción
  y el personal quedan fuera tanto de la pantalla como de la API.
- **Requisitos que cubre.** RF-42 y RF-42.1
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:102`). Requisito no funcional asociado:
  RNF-41, que prohíbe que el listado devuelva `passwordHash` o `totpSecretEnc`
  (`apps/web/src/app/api/admin/system/users/route.ts:26`).
- **Precondición.** Sesión con `DEFAULT_ADMIN_ROLE`
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:101`).
- **Disparador.** El owner abre Sistemas → Usuarios
  (`apps/web/src/app/admin/sistemas/usuarios/page.tsx:7`).
- **Postcondición.** El listado refleja el alta, la rotación o el cambio de estado; al desactivar se
  revocan las sesiones de refresco del operador
  (`apps/web/src/app/api/admin/system/users/route.ts:175`).
- **Dónde vive.**
  - Pantalla: `apps/web/src/components/admin/system/SystemUsers.tsx:52`.
  - Página: `apps/web/src/app/admin/sistemas/usuarios/page.tsx:7`.
  - API: `apps/web/src/app/api/admin/system/users/route.ts:44` (GET), `:67` (POST) y `:140` (PATCH).
  - Aprovisionamiento: `packages/shared/src/auth/service.ts:330`.
  - Repositorio: `packages/shared/src/db/repositories/users.repository.ts:51`.
  - Tablas: `packages/shared/src/db/migrator.ts:113` (`admin_users`) y `:129`
    (`mfa_recovery_codes`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. El owner entra en `/admin/sistemas/usuarios`. El layout de la sección ya ha comprobado en el
   servidor que la sesión es `DEFAULT_ADMIN_ROLE`
   (`apps/web/src/app/admin/sistemas/layout.tsx:20`).
2. `SystemUsers` se monta dentro del contexto de sesión del back-office
   (`apps/web/src/components/admin/system/SystemUsers.tsx:54`) y carga el listado con
   `apiFetch("/api/admin/system/users")` (`:70`).
3. La API exige el rol con `requireRole(request, "DEFAULT_ADMIN_ROLE")`
   (`apps/web/src/app/api/admin/system/users/route.ts:45`) y responde con
   `{ users: [...] }` ya filtrado por `publicUser` (`:50`, `:27`).
4. La tabla pinta las columnas usuario, rol, estado, bloqueo, actualizado y acciones
   (`apps/web/src/components/admin/system/SystemUsers.tsx:166`). El propio owner se marca con la
   insignia «tú» (`:185`) y su botón de estado queda deshabilitado (`:198`).
5. El formulario de alta envía `{ username, role, password? }` por `POST`
   (`apps/web/src/components/admin/system/SystemUsers.tsx:92`). Si el campo de contraseña va vacío,
   se manda `undefined` y el servidor la genera (`:95`, `:103`).
6. La API valida el correo, el rol admitido y la longitud de la contraseña
   (`apps/web/src/app/api/admin/system/users/route.ts:81`, `:87`, `:93`); después genera la
   contraseña si no llegó ninguna (`:100`) y llama a `authService.provisionUser`
   (`:105`).
7. `provisionUser` genera semilla TOTP, hashea la contraseña, crea ocho códigos de rescate y hace
   `upsert` del operador con `active: true`
   (`packages/shared/src/auth/service.ts:337`–`:348`).
8. La respuesta es 201 con `status: "PROVISIONED"` y las credenciales en claro: `password`, `secret`,
   `uri` y `recoveryCodes` (`apps/web/src/app/api/admin/system/users/route.ts:111`).
9. La pantalla muestra el bloque de credenciales (`data-testid="system-user-credentials"`), avisa de
   que se ven una sola vez y ofrece copiarlas al portapapeles
   (`apps/web/src/components/admin/system/SystemUsers.tsx:258`, `:261`, `:269`).
10. Tras crear o rotar, se limpian usuario y contraseña y se recarga el listado
    (`apps/web/src/components/admin/system/SystemUsers.tsx:100`).
11. Activar o desactivar envía `PATCH { username, active }`
    (`apps/web/src/components/admin/system/SystemUsers.tsx:111`). La API comprueba que el usuario
    exista (`apps/web/src/app/api/admin/system/users/route.ts:166`), cambia el estado (`:174`) y, al
    desactivar, revoca todas las sesiones de refresco del operador (`:175`).
12. La respuesta del `PATCH` es `{ username, active }` y la pantalla refresca el listado
    (`apps/web/src/components/admin/system/SystemUsers.tsx:118`).

### 2.2 Validaciones

- **Correo obligatorio.** El usuario debe contener `@`, no estar vacío y no pasar de 100 caracteres;
  si no, 400 `USUARIO_INVALIDO`
  (`apps/web/src/app/api/admin/system/users/route.ts:81`).
- **Rol admitido.** Solo `DEFAULT_ADMIN_ROLE`, `RECEPTION_ROLE`, `HOUSEKEEPING` y `MAINTENANCE`; en
  caso contrario, 400 `ROL_INVALIDO` (`apps/web/src/app/api/admin/system/users/route.ts:19`, `:87`).
- **Contraseña.** Si se aporta, mínimo 12 caracteres; si no, se genera con 18 bytes aleatorios en
  base64url (`apps/web/src/app/api/admin/system/users/route.ts:93`, `:100`).
- **Solicitud de estado.** `username` no vacío y `active` booleano; si no, 400 `SOLICITUD_INVALIDA`
  (`apps/web/src/app/api/admin/system/users/route.ts:153`).
- **Nada de auto-desactivación.** El owner no puede desactivar su propia cuenta: 400
  `AUTO_DESACTIVACION` (`apps/web/src/app/api/admin/system/users/route.ts:159`). La UI lo refuerza
  deshabilitando el botón de la fila propia
  (`apps/web/src/components/admin/system/SystemUsers.tsx:198`).
- **Usuario inexistente.** 404 `USUARIO_NO_ENCONTRADO`
  (`apps/web/src/app/api/admin/system/users/route.ts:167`).
- **Sin secretos en la lista.** `publicUser` construye la vista pública sin `passwordHash` ni
  `totpSecretEnc` (`apps/web/src/app/api/admin/system/users/route.ts:27`), aunque el repositorio
  devuelva el registro completo
  (`packages/shared/src/db/repositories/users.repository.ts:67`).

### 2.3 Efectos on-chain / persistencia

- **Ninguna escritura en la cadena.** Los operadores viven en PostgreSQL, no en el contrato. Los
  roles on-chain (minter, pauser, burner, tesorería) se conceden desde CU-43.
- `provisionUser` escribe en dos tablas: `upsert` del operador con contraseña hasheada y semilla
  TOTP cifrada (`packages/shared/src/auth/service.ts:342`) y reemplazo de los códigos de rescate
  (`:350`). El `upsert` reinicia `failed_attempts` y `locked_until`, de modo que una cuenta
  bloqueada vuelve a ser utilizable tras rotar credenciales
  (`packages/shared/src/db/repositories/users.repository.ts:85`).
- Desactivar un operador escribe `active = false` con `updated_at`
  (`packages/shared/src/db/repositories/users.repository.ts:120`) y revoca sus sesiones de refresco
  (`apps/web/src/app/api/admin/system/users/route.ts:175`).
- Los códigos de rescate se guardan hasheados y de un solo uso
  (`packages/shared/src/db/repositories/users.repository.ts:187`, `:214`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Rol exigido | Referencia |
|---|---|---|---|
| Listar operadores | `GET /api/admin/system/users` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/system/users/route.ts:44` |
| Crear o rotar | `POST /api/admin/system/users` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/system/users/route.ts:67` |
| Activar / desactivar | `PATCH /api/admin/system/users` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/system/users/route.ts:140` |
| Aprovisionar | `AuthService.provisionUser({ username, password, role })` | interno | `packages/shared/src/auth/service.ts:330` |
| Listar en BD | `UsersRepository.listAll()` | interno | `packages/shared/src/db/repositories/users.repository.ts:67` |
| Cambiar estado | `UsersRepository.setActive(username, active)` | interno | `packages/shared/src/db/repositories/users.repository.ts:120` |
| Revocar sesiones | `SessionsRepository.revokeAllUserSessions(username)` | interno | `apps/web/src/app/api/admin/system/users/route.ts:175` |

### 4.2 Eventos y errores canónicos

- No emite eventos on-chain.
- **Errores de la API de usuarios:** `USUARIO_INVALIDO`, `ROL_INVALIDO` y `PASSWORD_INVALIDA` (400);
  `SOLICITUD_INVALIDA` y `AUTO_DESACTIVACION` (400); `USUARIO_NO_ENCONTRADO` (404);
  `INTERNAL_SERVER_ERROR` (500) (`apps/web/src/app/api/admin/system/users/route.ts:83`, `:89`, `:95`,
  `:155`, `:161`, `:169`, `:126`).
- **Errores de guard:** `UNAUTHORIZED` (401), `FORBIDDEN` (403) y `SERVER_MISCONFIGURED` (500)
  (`apps/web/src/lib/guard.ts:212`).
- **Respuesta de alta:** `status: "PROVISIONED"` con `password`, `secret`, `uri` y `recoveryCodes`
  (`apps/web/src/app/api/admin/system/users/route.ts:113`).
- **Errores de la UI:** claves `system.loadError`, `system.createError` y `system.updateError`
  (`apps/web/messages/es.json:1041`).

### 4.3 Estructuras de datos y almacenamiento

- Tabla `admin_users`: `username` único, `password_hash`, `totp_secret_enc`, `role`, `active`,
  `failed_attempts`, `locked_until`, `created_at` y `updated_at`
  (`packages/shared/src/db/migrator.ts:113`).
- Tabla `mfa_recovery_codes`: `username`, `code_hash`, `used`, `used_at`
  (`packages/shared/src/db/migrator.ts:129`).
- `AdminUserRecord` refleja la fila completa, incluidos los secretos, y solo se usa en el servidor
  (`packages/shared/src/db/repositories/users.repository.ts:15`).
- `SystemUser` en el cliente solo declara los campos públicos
  (`apps/web/src/components/admin/system/SystemUsers.tsx:19`).
- `ProvisionResult` recoge lo que se muestra una única vez
  (`apps/web/src/components/admin/system/SystemUsers.tsx:29`).
- Roles admitidos en la tabla y en el formulario: owner, recepción, housekeeping y mantenimiento
  (`packages/shared/src/db/repositories/users.repository.ts:12`;
  `apps/web/src/components/admin/system/SystemUsers.tsx:233`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Listado sin sesión o con sesión no owner | 401 / 403 de guard | `apps/web/src/lib/guard.ts:107`, `:138` |
| Fuga de `passwordHash` o `totpSecretEnc` | la vista pública no los incluye | `apps/web/src/app/api/admin/system/users/route.ts:27` |
| Usuario que no es correo | 400 `USUARIO_INVALIDO` | `apps/web/src/app/api/admin/system/users/route.ts:81` |
| Rol no permitido | 400 `ROL_INVALIDO` | `apps/web/src/app/api/admin/system/users/route.ts:87` |
| Contraseña de menos de 12 caracteres | 400 `PASSWORD_INVALIDA` | `apps/web/src/app/api/admin/system/users/route.ts:93` |
| El owner intenta desactivarse | 400 `AUTO_DESACTIVACION`; botón deshabilitado | `apps/web/src/app/api/admin/system/users/route.ts:159`; `apps/web/src/components/admin/system/SystemUsers.tsx:198` |
| Desactivar a quien no existe | 404 `USUARIO_NO_ENCONTRADO` | `apps/web/src/app/api/admin/system/users/route.ts:167` |
| Desactivar a un operador activo | 200 y revocación de sus sesiones | `apps/web/src/app/api/admin/system/users/route.ts:174` |
| Sesión caducada durante la pantalla | bloque `session-expired-block` | `apps/web/src/components/admin/AdminPanel.tsx:42` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/admin/system/users.test.ts:43`: 401 sin sesión y rol exigido
  `DEFAULT_ADMIN_ROLE`; `:53`: 403 con sesión que no es owner.
- `apps/web/src/app/api/admin/system/users.test.ts:59`: el listado no expone `passwordHash`,
  `totpSecretEnc` ni el hash literal.
- `apps/web/src/app/api/admin/system/users.test.ts:85`, `:91` y `:97`: rechazo de usuario no correo,
  rol no admitido y contraseña corta, con su código de error.
- `apps/web/src/app/api/admin/system/users.test.ts:103`: el alta responde 201 con `PROVISIONED`,
  contraseña de longitud suficiente y `otpauth`.
- `apps/web/src/app/api/admin/system/users.test.ts:121`, `:128` y `:134`: no auto-desactivación, 404
  de usuario inexistente y desactivación con revocación de sesiones.
- `packages/shared/src/auth/auth.test.ts:257`: `provisionUser` genera semilla, `otpauth` y ocho
  códigos de rescate.
- **No cubierto:** no hay prueba de componente para `SystemUsers` (llamadas a la API, tabla,
  insignia «tú» y bloque de credenciales), ni prueba de extremo a extremo que cree un operador y
  verifique que después puede autenticarse con TOTP.

## 7. Pendiente de confirmar

- El Gherkin de alta pide que el operador creado «queda activo y puede autenticarse»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:127`). El código garantiza `active: true` en
  el `upsert` (`packages/shared/src/auth/service.ts:347`), pero **no hay prueba end-to-end** que
  haga el login del operador recién creado; queda sin verificar en ejecución.
- La alternativa A1 del incremento dice que un alta con rol no permitido devuelve 400
  (`casos_uso_incremento.md:110`) y así es en el código
  (`apps/web/src/app/api/admin/system/users/route.ts:87`); en cambio los roles de contrato
  (`MINTER_ROLE`, `PAUSER_ROLE`, `BURNER_ROLE`, `TREASURER_ROLE`) no se pueden asignar como rol de
  BD desde esta pantalla, y no está documentado cómo se conceden a un operador de plataforma.
- Al desactivar, el repositorio ofrece `invalidateRecoveryCodes`
  (`packages/shared/src/db/repositories/users.repository.ts:241`) pero el `PATCH` **no lo llama**:
  solo revoca las sesiones de refresco
  (`apps/web/src/app/api/admin/system/users/route.ts:175`). No se ha confirmado si los códigos de
  rescate pendientes de un operador desactivado deben invalidarse.
- El `POST` es a la vez alta y rotación (`upsert`): repetir el mismo usuario cambia contraseña y
  semilla, y la respuesta sigue siendo **201**, no 200. El criterio solo describe el alta
  (`casos_uso_incremento.md:123`).
- La pantalla muestra el bloque de credenciales en un `role="status"` que no se limpia al
  desactivar o activar otro operador (`apps/web/src/components/admin/system/SystemUsers.tsx:258`):
  no hay criterio que fije cuándo debe desaparecer.
- La restricción EARS exige que las credenciales en claro se devuelvan solo en creación o rotación
  (`casos_uso_incremento.md:138`). Se cumple en `GET` (vista pública), pero no hay prueba que
  recorra todos los endpoints de Sistemas para descartar fugas por otras rutas.
