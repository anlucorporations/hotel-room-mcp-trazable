# CU-46 · Proteger la cuenta del que manda — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Owner, Recepción · Requisitos: RF-46

## 1. Ficha y trazabilidad

- **Objetivo.** Que cada operador proteja **su propia** cuenta desde Seguridad y mis datos: rotar su
  segundo factor (MFA) para obtener semilla nueva y ocho códigos de rescate, y cambiar su
  contraseña.
- **Actor primario.** Cualquier operador de back-office autenticado: Owner
  (`DEFAULT_ADMIN_ROLE`) y Recepción (`RECEPTION_ROLE`)
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:214`). **Secundario:** ninguno; nadie puede
  tocar la cuenta de otro por esta vía (`apps/web/src/app/api/auth/password/route.ts:15`).
- **Requisitos que cubre.** RF-46 (`RepoTecnico/incremento_v3/casos_uso_incremento.md:215`).
- **Precondición.** Sesión de back-office válida (access token vigente)
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:214`).
- **Disparador.** El operador abre Seguridad y mis datos desde el menú de la cabecera
  (`apps/web/src/lib/wallet-menu-items.ts:70`) o entra en `/admin/seguridad`
  (`apps/web/src/app/admin/seguridad/page.tsx:8`).
- **Postcondición.** La semilla TOTP anterior deja de valer y los códigos de rescate antiguos se
  reemplazan (`apps/web/src/app/api/auth/mfa/setup/route.ts:34`–`:35`); o la contraseña nueva pasa a
  ser la válida (`apps/web/src/app/api/auth/password/route.ts:57`).
- **Dónde vive.**
  - Pantalla: `apps/web/src/components/admin/AdminSecurity.tsx:25`.
  - Página: `apps/web/src/app/admin/seguridad/page.tsx:8`.
  - Rotación de MFA: `apps/web/src/app/api/auth/mfa/setup/route.ts:25`.
  - Cambio de contraseña: `apps/web/src/app/api/auth/password/route.ts:21`.
  - Guard: `apps/web/src/lib/guard.ts:105`, `:201`.
  - Persistencia: `packages/shared/src/db/repositories/users.repository.ts:106`, `:113`, `:187`.
  - Criptografía: `packages/shared/src/auth/service.ts:109`–`:155`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El operador llega a `/admin/seguridad`. La página envuelve el componente en `AdminLayout` y
   `AdminPanel` **sin** `requiredRole`, así que vale cualquier sesión válida
   (`apps/web/src/app/admin/seguridad/page.tsx:11`; `apps/web/src/components/admin/AdminPanel.tsx:24`).
2. `AdminSecurity` lee del contexto de sesión `apiFetch` y `sessionUsername`
   (`apps/web/src/components/admin/AdminSecurity.tsx:27`) y muestra en qué cuenta está actuando
   (`:100`).
3. **Rotar MFA.** Al pulsar «Rotar MFA» (`:117`) llama a `POST /api/auth/mfa/setup`
   (`:45`) y, si va bien, guarda el resultado en `mfa` (`:48`).
4. La API exige sesión de gestión con `requireRole(request)` sin rol explícito
   (`apps/web/src/app/api/auth/mfa/setup/route.ts:27`), genera semilla y códigos
   (`:30`–`:31`), **guarda la semilla cifrada** del propio operador (`:34`) y reemplaza sus códigos
   de rescate (`:35`).
5. La respuesta trae `uri`, `secret` y `recoveryCodes` en claro (`:37`–`:41`): la pantalla los pinta
   en el bloque `mfa-credentials` (`apps/web/src/components/admin/AdminSecurity.tsx:122`–`:128`) bajo
   el aviso «Se muestran una sola vez: guárdalos ahora» (`:123`).
6. El botón «Copiar» junta semilla, enlace y códigos y los manda al portapapeles
   (`apps/web/src/components/admin/AdminSecurity.tsx:88`–`:89`); si lo consigue, cambia la etiqueta a
   «Copiado» (`:91`).
7. **Cambiar contraseña.** El formulario pide contraseña actual, nueva y repetición
   (`apps/web/src/components/admin/AdminSecurity.tsx:143`, `:147`, `:151`).
8. Antes de enviar comprueba en cliente que las dos nuevas coincidan; si no, muestra
   `passwordMismatch` y **no** llama a la API (`:61`–`:64`).
9. Si coinciden, envía `POST /api/auth/password` con `{ currentPassword, newPassword }` (`:67`–`:71`).
10. La API exige sesión (`apps/web/src/app/api/auth/password/route.ts:22`), exige una nueva
    contraseña de 12 caracteres o más (`:34`), busca al operador (`:41`), compara la actual (`:49`) y
    guarda el hash nuevo (`:57`). Devuelve `{ status: "PASSWORD_UPDATED" }` (`:62`).
11. La pantalla muestra el mensaje de éxito y vacía los tres campos
    (`apps/web/src/components/admin/AdminSecurity.tsx:74`–`:77`).
12. Cualquier fallo se pinta en `security-error` (`:103`) y el éxito en `security-message` (`:108`).

### 2.2 Validaciones

- **Sesión obligatoria.** Ambas APIs cierran en el servidor con 401 sin token y 403 con un rol que no
  es de gestión (`apps/web/src/lib/guard.ts:211`; `apps/web/src/lib/guard.ts:38`). Los roles sin
  wallet `HOUSEKEEPING` y `MAINTENANCE` **no** son de gestión, así que quedan fuera de estas dos
  rutas (`apps/web/src/lib/guard.ts:163`, `:167`).
- **Contraseña nueva mínima.** Menos de 12 caracteres devuelve 400 `PASSWORD_INVALIDA`
  (`apps/web/src/app/api/auth/password/route.ts:34`).
- **Contraseña actual obligatoria.** Si no coincide, 401 `PASSWORD_ACTUAL_INCORRECTA` y la
  contraseña **no** cambia (`apps/web/src/app/api/auth/password/route.ts:50`).
- **Operador inexistente.** 404 `USUARIO_NO_ENCONTRADO`
  (`apps/web/src/app/api/auth/password/route.ts:42`).
- **Coincidencia en cliente.** La repetición se valida antes de llamar a la API
  (`apps/web/src/components/admin/AdminSecurity.tsx:61`).
- **Siempre la propia cuenta.** Las dos rutas usan `auth.session.username` y no aceptan un usuario
  por parámetro (`apps/web/src/app/api/auth/mfa/setup/route.ts:34`;
  `apps/web/src/app/api/auth/password/route.ts:22`).

### 2.3 Efectos on-chain / persistencia

- **Ninguna escritura en la cadena.** Estos roles de plataforma viven en PostgreSQL; los roles
  on-chain se conceden desde CU-43.
- **Rotar MFA** escribe dos cosas: la semilla cifrada con AES-256-GCM en
  `admin_users.totp_secret_enc` (`apps/web/src/app/api/auth/mfa/setup/route.ts:34`;
  `packages/shared/src/db/repositories/users.repository.ts:106`) y el reemplazo completo de los
  códigos de rescate, que se guardan hasheados (`.../users.repository.ts:187`,
  `packages/shared/src/auth/service.ts:155`).
- En claro solo se devuelve el `otpauth://` y los códigos, y solo en esa respuesta
  (`apps/web/src/app/api/auth/mfa/setup/route.ts:21`).
- **Cambiar contraseña** escribe `password_hash` (`.../users.repository.ts:113`) usando el hash que
  produce `AuthService` (`apps/web/src/app/api/auth/password/route.ts:57`).
- El endpoint de contraseña **no** revoca sesiones ni códigos de rescate: los tokens ya emitidos
  siguen valiendo hasta caducar.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Rol exigido | Referencia |
|---|---|---|---|
| Rotar MFA propio | `POST /api/auth/mfa/setup` | cualquier rol de gestión | `apps/web/src/app/api/auth/mfa/setup/route.ts:25` |
| Cambiar contraseña propia | `POST /api/auth/password` | cualquier rol de gestión | `apps/web/src/app/api/auth/password/route.ts:21` |
| Generar semilla TOTP | `AuthService.generateTOTPSecret()` | interno | `packages/shared/src/auth/service.ts:109` |
| Generar `otpauth://` | `AuthService.generateTOTPUri(username, secret)` | interno | `packages/shared/src/auth/service.ts:114` |
| Generar 8 códigos | `AuthService.generateRecoveryCodes(8)` | interno | `packages/shared/src/auth/service.ts:155` |
| Guardar semilla | `UsersRepository.updateTotpSecretEnc()` | interno | `packages/shared/src/db/repositories/users.repository.ts:106` |
| Reemplazar códigos | `UsersRepository.replaceRecoveryCodes()` | interno | `packages/shared/src/db/repositories/users.repository.ts:187` |
| Guardar contraseña | `UsersRepository.updatePasswordHash()` | interno | `packages/shared/src/db/repositories/users.repository.ts:113` |
| Expuesto en el menú | acción `security` → `/admin/seguridad` | sesión de back-office | `apps/web/src/lib/wallet-menu-items.ts:70` |

### 4.2 Eventos y errores canónicos

- **Eventos:** ninguno (ni on-chain ni de dominio).
- **Errores de MFA:** `INTERNAL_SERVER_ERROR` (500) si falla la generación o el guardado
  (`apps/web/src/app/api/auth/mfa/setup/route.ts:44`).
- **Errores de contraseña:** `PASSWORD_INVALIDA` (400), `USUARIO_NO_ENCONTRADO` (404) y
  `PASSWORD_ACTUAL_INCORRECTA` (401) (`apps/web/src/app/api/auth/password/route.ts:36`, `:44`, `:52`).
- **Respuesta correcta:** `{ status: "PASSWORD_UPDATED" }`
  (`apps/web/src/app/api/auth/password/route.ts:62`) y `{ uri, secret, recoveryCodes }`
  (`apps/web/src/app/api/auth/mfa/setup/route.ts:37`).
- **Errores de guard:** `UNAUTHORIZED` (401), `FORBIDDEN` (403) y `SERVER_MISCONFIGURED` (500)
  (`apps/web/src/lib/guard.ts:212`).
- **Claves de UI:** `securityRotateError`, `passwordMismatch`, `passwordChanged` y `passwordError`
  (`apps/web/messages/es.json:1118`, `:1125`, `:1126`, `:1127`).

### 4.3 Estructuras de datos y almacenamiento

- **Tabla `admin_users`:** `username`, `password_hash`, `totp_secret_enc`, `role`, `active`,
  `failed_attempts`, `locked_until` (`packages/shared/src/db/migrator.ts:113`).
- **Tabla `mfa_recovery_codes`:** `username`, `code_hash`, `used`, `used_at`
  (`packages/shared/src/db/migrator.ts:129`).
- **`MfaSetup` en el cliente:** `uri`, `secret` y `recoveryCodes`
  (`apps/web/src/components/admin/AdminSecurity.tsx:15`).
- **Cifrado de la semilla:** `encryptTotpSecret` / `decryptTotpSecret` con `AES_SECRET_KEY`
  (`packages/shared/src/auth/service.ts:130`).
- **Número de códigos de rescate:** ocho (`apps/web/src/app/api/auth/mfa/setup/route.ts:31`).
- **Sin persistencia del `otpauth://`:** solo se guarda el criptograma; el enlace se calcula al
  vuelo (`packages/shared/src/auth/service.ts:114`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin sesión | 401 `UNAUTHORIZED` | `apps/web/src/lib/guard.ts:211` |
| Sesión de housekeeping o mantenimiento | 403: no son roles de gestión | `apps/web/src/lib/guard.ts:167` |
| Operador no encontrado al cambiar contraseña | 404 `USUARIO_NO_ENCONTRADO` | `apps/web/src/app/api/auth/password/route.ts:42` |
| Contraseña nueva de menos de 12 caracteres | 400 `PASSWORD_INVALIDA` | `apps/web/src/app/api/auth/password/route.ts:34` |
| Contraseña actual incorrecta | 401 `PASSWORD_ACTUAL_INCORRECTA`; no cambia | `apps/web/src/app/api/auth/password/route.ts:50` |
| Las dos contraseñas nuevas no coinciden | `passwordMismatch`; no se llama a la API | `apps/web/src/components/admin/AdminSecurity.tsx:61` |
| Fallo al rotar el MFA | aviso `security-error` | `apps/web/src/components/admin/AdminSecurity.tsx:103` |
| Semilla antigua tras rotar | la nueva la sustituye en `totp_secret_enc` | `apps/web/src/app/api/auth/mfa/setup/route.ts:34` |
| Sesión caducada durante la pantalla | bloque `session-expired-block` | `apps/web/src/components/admin/AdminPanel.tsx:42` |
| Fallo al copiar al portapapeles | el botón vuelve a «Copiar» | `apps/web/src/components/admin/AdminSecurity.tsx:92` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/auth/password/password.test.ts:44`: exige sesión de back-office (401 sin
  sesión); `:50`: rechaza una contraseña nueva corta; `:56`: rechaza si la actual no es correcta;
  `:66`: cambia la contraseña cuando la actual es correcta.
- `packages/shared/src/auth/auth.test.ts:257`: `provisionUser` genera semilla, `otpauth` y ocho
  códigos de rescate; `:275`: los códigos se reemplazan en el repositorio.
- `packages/shared/src/auth/auth.test.ts`: bloque de login/MFA con verificación de TOTP y de códigos
  de rescate (`apps/web/src/app/api/auth/auth-endpoints.test.ts:208`).
- **No cubierto:** no hay prueba para `POST /api/auth/mfa/setup` (al grepear `mfa/setup` en los
  ficheros de prueba no aparece ninguna coincidencia) ni para el componente `AdminSecurity`
  (rotación, aviso de una sola vez, copia y cambio de contraseña). Tampoco hay prueba end-to-end que
  rote el MFA y compruebe que la semilla anterior ya no verifica.

## 7. Pendiente de confirmar

- El Gherkin pide que, al rotar el MFA, «su semilla anterior deja de ser válida»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:224`). El código la sobrescribe en
  `totp_secret_enc` (`apps/web/src/app/api/auth/mfa/setup/route.ts:34`), lo que en la práctica la
  invalida, pero **no hay prueba que lo verifique**; queda sin confirmar en ejecución.
- El escalado dice que el formulario MFA de `/admin/seguridad` «muestra `otpauth`» (CU-40,
  `RepoTecnico/incremento_v3/casos_uso_incremento.md:222`), pero **no se dibuja ningún código QR**:
  la pantalla solo imprime el texto del enlace y la semilla
  (`apps/web/src/components/admin/AdminSecurity.tsx:125`–`:126`). No se ha confirmado si falta el QR
  o si el enlace en texto es la decisión definitiva.
- La restricción EARS dice que la rotación de MFA está disponible para «cualquier rol de
  back-office» (`RepoTecnico/incremento_v3/casos_uso_incremento.md:242`). El guard solo admite roles
  de **gestión** (`apps/web/src/lib/guard.ts:38`), de modo que `HOUSEKEEPING` y `MAINTENANCE` —que
  también son roles de back-office en la base de datos— reciben 403. No está confirmado si es
  intencionado o si el personal sin wallet debería poder rotar su MFA.
- El criterio del cambio de contraseña no dice si deben revocarse las sesiones abiertas
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:226`–`:230`). El código **no** las revoca:
  `POST /api/auth/password` solo escribe el hash
  (`apps/web/src/app/api/auth/password/route.ts:57`), a diferencia del `PATCH` de usuarios, que sí
  revoca sesiones al desactivar (`apps/web/src/app/api/admin/system/users/route.ts:175`).
- El bloque de credenciales de esta pantalla no se limpia al cambiar de pestaña ni al recargar más
  tarde (`apps/web/src/components/admin/AdminSecurity.tsx:29`): solo se vacía al rotar de nuevo
  (`:43`). No hay criterio que fije cuánto tiempo deben permanecer visibles.
- No hay límite de intentos ni re-autenticación para rotar el MFA: cualquiera con un token válido
  puede rotarlo (`apps/web/src/app/api/auth/mfa/setup/route.ts:27`), sin pedir la contraseña actual,
  a diferencia del cambio de contraseña.
