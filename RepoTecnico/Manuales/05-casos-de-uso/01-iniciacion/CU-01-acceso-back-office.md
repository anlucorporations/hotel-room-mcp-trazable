# CU-01 · Entrar al panel del hotel con la cartera y el rol correcto — Manual técnico

> Bloque 1 · Iniciación · Actor: Operador back-office · Requisitos: RF-06, RNF-13, Decisión 20

## 1. Ficha y trazabilidad

- **Objetivo.** Que un operador acreditado entre al back-office y vea solo las acciones que le
  corresponden por su rol.
- **Actor primario.** Operador back-office. **Secundarios:** el super-admin que le da de alta
  (CU-16/CU-42) y la wallet que firma las transacciones en su nombre.
- **Requisitos que cubre.** RF-06 y RNF-13; decisión de diseño Decisión 20 / D-04.
- **Precondición.** El operador existe y está activo; su cuenta tiene ≥1 rol de aplicación.
- **Disparador.** El operador abre el back-office (`/admin`).
- **Postcondición.** Hay sesión válida (cookies HttpOnly) y el panel se pinta con las acciones
  habilitadas por su rol. Sin sesión, se sirve la pantalla de acceso y **no** se lee ningún dato.
- **Dónde vive.**
  - Gate y pantalla de acceso: `apps/web/src/app/admin/layout.tsx:22`,
    `apps/web/src/lib/admin-session.ts:21`, `apps/web/src/components/admin/AdminSignInScreen.tsx:33`,
    `apps/web/src/components/admin/CredentialForm.tsx:110`.
  - Endpoints: `apps/web/src/app/api/auth/login/route.ts:24`,
    `apps/web/src/app/api/auth/mfa/verify/route.ts:29`,
    `apps/web/src/app/api/auth/refresh/route.ts:26`,
    `apps/web/src/app/api/auth/logout/route.ts`, `apps/web/src/app/api/auth/session/route.ts:22`.
  - Guard de autorización: `apps/web/src/lib/guard.ts:105` y `:201`.
  - Vía secundaria con wallet (SIWE/EIP-4361): `apps/web/src/app/api/auth/nonce/route.ts:7` y
    `apps/web/src/app/api/auth/verify/route.ts:31`.
  - Contrato que impone el rol al firmar: `packages/contracts/src/HotelNights.sol:132` (ejemplo
    `mint` con `onlyRole(MINTER_ROLE)`).

## 2. Recorrido técnico

### 2.1 Camino principal (el que la aplicación usa hoy)

1. El operador abre `/admin`. La página raíz redirige a `/admin/dashboard`
   (`apps/web/src/app/admin/page.tsx:7`).
2. El layout del back-office verifica la sesión **en el render** con `currentAdminSession()`
   (`apps/web/src/app/admin/layout.tsx:22`). Sin sesión válida devuelve `<AdminSignInScreen />`.
3. `currentAdminSession` exige cookies y delega en `authorize()`, el mismo guard que protege las
   rutas de API (`apps/web/src/lib/admin-session.ts:26`).
4. El operador rellena usuario y contraseña (`CredentialForm.tsx:123` y `:136`) y se envían a
   `POST /api/auth/login` (`apps/web/src/components/admin/useAdminSession.ts:161`).
5. El login valida contraseña con bcrypt y devuelve **solo un reto**: `challengeRequired` y un
   `sessionToken` de 10 minutos (`apps/web/src/app/api/auth/login/route.ts:77`). **No** emite sesión.
6. El formulario pasa al paso MFA (TOTP de 6 dígitos o código de rescate,
   `CredentialForm.tsx:46` y `:77`) y llama a `POST /api/auth/mfa/verify`
   (`useAdminSession.ts:205`).
7. El segundo factor se verifica contra `admin_users.totp_secret_enc` y, si es correcto, se emiten
   access token (15 min) y refresh token (7 días con rotación)
   (`packages/shared/src/auth/service.ts:36` y `apps/web/src/app/api/auth/mfa/verify/route.ts:94`).
   Ambos se dejan en cookies HttpOnly (`mfa/verify/route.ts:102`; nombres en
   `apps/web/src/lib/guard.ts:23`).
8. `useAdminSession` recarga la sesión con `GET /api/auth/session`
   (`useAdminSession.ts:107`), que devuelve `username`, `role` y los códigos de rescate restantes
   (`apps/web/src/app/api/auth/session/route.ts:40`).
9. Cada panel del back-office declara su rol (`requiredRole="DEFAULT_ADMIN_ROLE"` en
   `apps/web/src/app/admin/roles/page.tsx:11`). `AdminPanel` avisa si la sesión no lo tiene
   (`AdminPanel.tsx:26`) y el guard de API responde 403 si se intenta la acción por HTTP
   (`guard.ts:136`).
10. Al cerrar sesión, `POST /api/auth/logout` revoca el `jti` y borra las cookies
    (`useAdminSession.ts:242`).

### 2.2 Camino SIWE (identificación con wallet)

1. La web pide un nonce de un solo uso a `GET /api/auth/nonce`
   (`apps/web/src/app/api/auth/nonce/route.ts:7`); el almacén es en memoria y caduca según
   `SESSION_NONCE_TTL_SECONDS` = 300 s (`apps/web/src/lib/nonce-store.ts:12`;
   `packages/shared/src/constants.ts:54`).
2. El operador firma el mensaje EIP-4361 y se envía a `POST /api/auth/verify`
   (`apps/web/src/app/api/auth/verify/route.ts:31`).
3. El endpoint comprueba: dominio = host (`:44`), URI (`:55`), `chainId` (`:59`), expiración (`:62`),
   «not before» (`:66`), firma con `verifySiweMessage` —EOA y EIP-1271— (`:78`), consumo del nonce
   (`:94`) y lectura en paralelo de `hasRole` de los 6 roles (`:100`).
4. Si la wallet no tiene ningún rol responde **HTTP 403 `NO_ROLE`** (`:111`); si algo de lo anterior
   falla, **HTTP 401** con el motivo (`:39`, `:45`, `:60`, `:89`, `:95`).
5. Con ≥1 rol firma la cookie HMAC `hotel_admin_session` (`:116`; `apps/web/src/lib/session.ts:39`).
   **Ojo:** `session.ts:9` y `apps/web/src/app/api/auth/session/route.ts:16` documentan que esta vía
   ya **no autoriza** el back-office ni protege ninguna API.

### 2.3 Validaciones

- **Sesión.** `authorize` extrae el token de `Authorization: Bearer` o de la cookie
  (`guard.ts:74`), verifica firma y expiración HS256 (`:117`) y exige rol conocido (`:128`).
  Sin token → 401; con token sin el rol → 403; configuración rota → 500 (`:211`).
- **Login.** Usuario y contraseña obligatorios (`login/route.ts:35`); 5 intentos / 15 minutos →
  429 (`login/route.ts:45`; `packages/shared/src/auth/service.ts:39`); cuenta bloqueada → 423
  (`login/route.ts:56`).
- **MFA.** Reto inválido o caducado → 401 (`mfa/verify/route.ts:53`); TOTP o rescate incorrectos →
  401 (`:88`).
- **Contraseña al aprovisionar.** Mínimo 12 caracteres
  (`apps/web/src/app/api/admin/system/users/route.ts:93`).
- **Autoridad final.** El gating de la web es solo UX: al firmar, el contrato comprueba su propio
  `hasRole` y revierte con `AccessControlUnauthorizedAccount`
  (`packages/contracts/src/HotelNights.sol:132`, `packages/contracts/test/HotelNights.roles.t.sol:65`).

### 2.4 Efectos on-chain / persistencia

- La autenticación **no toca la cadena**: escribe en `admin_users` (contraseña bcrypt, semilla TOTP
  cifrada AES-256-GCM), `mfa_recovery_codes` y `admin_sessions`
  (`packages/shared/src/db/migrator.ts:113` y `:129`).
- Redis guarda la blocklist de JWT y el rate limiting (`packages/shared/src/auth/service.ts:6`).
- El efecto on-chain llega después, cuando el operador firma una transacción desde un panel: ahí se
  aplica su rol de wallet, no el rol de la sesión.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Método y ruta | Dónde | Éxito | Fallos |
|---------------|-------|-------|--------|
| `POST /api/auth/login` | `api/auth/login/route.ts:24` | 200 reto MFA | 400, 401, 423, 429, 500 |
| `POST /api/auth/mfa/verify` | `api/auth/mfa/verify/route.ts:29` | 200 + cookies | 400, 401, 423, 429, 500 |
| `POST /api/auth/refresh` | `api/auth/refresh/route.ts:26` | 200 par nuevo (RTR) | 400, 401 |
| `GET /api/auth/session` | `api/auth/session/route.ts:22` | 200 `{username, role, roles}` | 401, 500 |
| `POST /api/auth/logout` | `api/auth/logout/route.ts` | revoca `jti` y borra cookies | 400 |
| `GET /api/auth/nonce` | `api/auth/nonce/route.ts:7` | 200 `{nonce}` | — |
| `POST /api/auth/verify` | `api/auth/verify/route.ts:31` | 200 + cookie SIWE | 400, 401, 403 |
| `POST /api/auth/mfa/setup` | `api/auth/mfa/setup/route.ts:27` | semilla + URI nuevos | 401/403/500 |
| `POST /api/auth/password` | `api/auth/password/route.ts:22` | cambio de contraseña | 401/403/500 |

- `requireRole(request, "DEFAULT_ADMIN_ROLE")` es el patrón de las rutas gateadas, p. ej.
  `apps/web/src/app/api/admin/mint/route.ts:55` y `apps/web/src/app/api/admin/metrics/route.ts:28`.

### 4.2 Eventos y errores canónicos

- Códigos de error de la API: `BAD_REQUEST`, `INVALID_MESSAGE`, `DOMAIN_MISMATCH`, `URI_MISMATCH`,
  `CHAIN_MISMATCH`, `EXPIRED`, `NOT_YET_VALID`, `BAD_SIGNATURE`, `NONCE_REPLAY_OR_EXPIRED`, `NO_ROLE`
  (`apps/web/src/app/api/auth/verify/route.ts:34`–`:112`).
- Guard: `UNAUTHORIZED`, `FORBIDDEN`, `SERVER_MISCONFIGURED` (`apps/web/src/lib/guard.ts:212`).
- On-chain, el rechazo por rol es `AccessControlUnauthorizedAccount(account, role)`.

### 4.3 Estructuras de datos y almacenamiento

- `admin_users` (`id`, `username`, `password_hash`, `totp_secret_enc`, `role`, `active`,
  `failed_attempts`, `locked_until`) — `packages/shared/src/db/migrator.ts:113`.
- `mfa_recovery_codes` (`username`, `code_hash`, `used`) — `migrator.ts:129`.
- Roles de aplicación admitidos: `DEFAULT_ADMIN_ROLE`, `RECEPTION_ROLE`, `HOUSEKEEPING`,
  `MAINTENANCE` (`packages/shared/src/domain/roles.ts:53`).
- Cookies: `hotel_access_token` y `hotel_refresh_token`, HttpOnly y `SameSite=Lax`
  (`guard.ts:23`, `:226`).

## 5. Casos límite y errores

| Situación | Respuesta / error | Dónde se comprueba |
|-----------|-------------------|--------------------|
| Sin cookies de sesión | Pantalla de acceso, ningún dato | `lib/admin-session.ts:23` |
| Token ausente en una API | 401 `UNAUTHORIZED` | `lib/guard.ts:107` |
| Sesión sin el rol exigido | 403 `FORBIDDEN` | `lib/guard.ts:136` |
| `JWT_SECRET` ausente o Redis caído | 500 `SERVER_MISCONFIGURED` | `lib/guard.ts:122` |
| Contraseña incorrecta | 401 + intentos restantes | `api/auth/login/route.ts:66` |
| 5 intentos en 15 min | 429 | `api/auth/login/route.ts:45` |
| Cuenta bloqueada | 423 | `api/auth/login/route.ts:56` |
| Reto MFA manipulado o caducado | 401 | `api/auth/mfa/verify/route.ts:52` |
| Wallet SIWE sin ningún rol | 403 `NO_ROLE` | `api/auth/verify/route.ts:111` |
| Nonce SIWE reutilizado | 401 `NONCE_REPLAY_OR_EXPIRED` | `api/auth/verify/route.ts:94` |
| Firma con rol distinto al exigido por la tx | Revierte el contrato | `HotelNights.sol:132` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/auth/auth-endpoints.test.ts:110` — login: reto MFA, alias `email`, 400, 401,
  429 y 423.
- `auth-endpoints.test.ts:184` — MFA: TOTP, código de rescate, 400, 401, 429 y 423.
- `auth-endpoints.test.ts:281` — refresh con rotación y rechazo del refresh reutilizado.
- `auth-endpoints.test.ts:322` — logout: revoca `jti` y borra cookies.
- `auth-endpoints.test.ts:381` — `GET /api/auth/session` con token válido, sin token y manipulado.
- `apps/web/src/lib/admin-auth-guardian.test.ts:22` — el layout comprueba la **validez** de la sesión,
  no la mera presencia de la cookie; `:39` exige que el dashboard gatee antes de leer agregados.
- `packages/shared/src/auth/auth.test.ts:138` — tokens de reto y de acceso con `role`.
- `packages/shared/src/auth/session-trace.test.ts` — trazabilidad de sesiones.
- `packages/contracts/test/HotelNights.roles.t.sol:65` — la tx sin rol revierte on-chain.
- **No cubierto:** no existe test del endpoint SIWE `/api/auth/verify` ni del flujo de nonce
  (`grep` de `siwe` en `*.test.ts` no devuelve ninguna prueba); tampoco hay test de componente para
  `CredentialForm.tsx`.

## 7. Pendiente de confirmar

- **Deriva documental grave.** `docs/CASOS-DE-USO.md:139` describe el acceso como SIWE con nonce y
  roles on-chain; el código vigente dice que SIWE **ya no autoriza** el back-office
  (`apps/web/src/lib/session.ts:9`, `api/auth/session/route.ts:16`) y que la sesión canónica es
  contraseña + TOTP + JWT (D-04). Falta confirmar cuál de los dos relatos es el vigente para el manual.
- **Rol de acceso ≠ rol de wallet.** El caso de uso habla de «wallet con rol on-chain» (p. ej.
  `MINTER`), pero los roles que admiten entrar a la aplicación son solo
  `DEFAULT_ADMIN_ROLE | RECEPTION_ROLE | HOUSEKEEPING | MAINTENANCE`
  (`packages/shared/src/domain/roles.ts:53`). Confirmar si el operador necesita además rol on-chain.
- **Ruta de acceso.** No existe `/admin/login`: la entrada es `/admin` y redirige a
  `/admin/dashboard` (`apps/web/src/app/admin/page.tsx:7`). Confirmar si el manual literal debe
  llamarla «pantalla de acceso del panel».
- **`SESSION_NONCE_TTL`.** El brief y el CU citan `SESSION_NONCE_TTL`; en el código es
  `SESSION_NONCE_TTL_SECONDS = 300` (`packages/shared/src/constants.ts:54`). Confirmar el nombre
  que debe usarse.
- **Cobertura SIWE.** Sin pruebas del endpoint `/api/auth/verify`: decidir si se prueba o si se
  retira del alcance del manual.
