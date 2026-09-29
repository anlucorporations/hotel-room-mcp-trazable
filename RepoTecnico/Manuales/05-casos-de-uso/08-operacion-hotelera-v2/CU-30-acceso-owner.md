# CU-30 · Que el dueño lo vea y lo pueda todo — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Owner · Requisitos: RF-30, RF-30.1, RF-30.2

## 1. Ficha y trazabilidad

- **Objetivo.** Que la cuenta de gobierno del hotel (`DEFAULT_ADMIN_ROLE`) vea habilitados todos
  los paneles del back-office y pueda abrirlos, sin que el gating por rol lo deje fuera de su
  propio panel. La autoridad última sigue siendo la cadena.
- **Actor primario.** Owner (`admin@hotel.es`, descrito en
  `RepoTecnico/incremento_v2/casos_uso_incremento.md:11`). **Secundario:** recepción
  (`RECEPTION_ROLE`), que debe quedar fuera de los paneles de administración.
- **Requisitos que cubre.** RF-30, RF-30.1 y RF-30.2
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:21`). Decisión de diseño asociada: **D-30**,
  «`DEFAULT_ADMIN_ROLE` implica cualquier rol a efectos de UI y de guard de API»
  (`apps/web/src/lib/admin-roles.ts:11`).
- **Precondición.** Sesión iniciada con usuario, contraseña y TOTP obligatorio. Las credenciales se
  validan en `apps/web/src/app/api/auth/login/route.ts:43`; el segundo factor, en
  `apps/web/src/app/api/auth/mfa/verify/route.ts:29`.
- **Disparador.** El operador abre cualquier ruta bajo `/admin/**`.
- **Postcondición.** Se sirve la plantilla del back-office con la sesión resuelta; cada entrada del
  sidebar queda habilitada o deshabilitada según el rol. No hay escritura on-chain en este CU.
- **Dónde vive.**
  - Puerta de servidor del back-office: `apps/web/src/app/admin/layout.tsx:22`.
  - Resolución de la sesión: `apps/web/src/lib/admin-session.ts:21` y
    `apps/web/src/app/api/auth/session/route.ts:44`.
  - Catálogo de paneles: `apps/web/src/components/admin/adminNav.ts:79` (secciones) y `:146`
    (lista plana `ADMIN_NAV`).
  - Gating de la UI: `apps/web/src/components/admin/AdminLayout.tsx:107` (entradas) y `:242`
    (grupo Sistemas, solo owner).
  - Aviso de rol insuficiente: `apps/web/src/components/admin/AdminPanel.tsx:34`.
  - Guard de las APIs: `apps/web/src/lib/guard.ts:105` (`authorize`) y `:201` (`requireRole`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. El operador envía usuario y contraseña. `POST /api/auth/login` llama a
   `authService.loginWithPassword` (`apps/web/src/app/api/auth/login/route.ts:43`) y responde con
   `challengeRequired: true` y un `sessionToken` de reto (`:78`); todavía no hay sesión.
2. `POST /api/auth/mfa/verify` valida el código TOTP o un código de rescate contra el reto
   (`apps/web/src/app/api/auth/mfa/verify/route.ts:29`, `:51`) y devuelve `roles: [result.role]`
   junto al usuario (`:97`).
3. Al abrir `/admin/**`, el layout de servidor verifica la cookie con
   `currentAdminSession()` (`apps/web/src/app/admin/layout.tsx:22`). Si no es válida, sirve la
   pantalla de acceso en lugar del panel (`:23`).
4. El cliente resuelve la sesión con `useAdminSession`
   (`apps/web/src/components/admin/useAdminSession.ts:88`): roles en estado (`:92`) e
   `isOwner: roles.includes("DEFAULT_ADMIN_ROLE")` (`:265`).
5. El guard aplica la regla del owner: si el rol de la sesión es `DEFAULT_ADMIN_ROLE`, satisface
   cualquier `requiredRole` exigido por una ruta
   (`apps/web/src/lib/guard.ts:138`, comentario en `:102`). Recepción necesita coincidencia exacta.
6. El sidebar decide cada entrada con `roleSatisfies`: el owner habilita todas; un rol operativo
   solo la suya (`apps/web/src/components/admin/AdminLayout.tsx:107`, política en
   `apps/web/src/lib/admin-roles.ts:16`).
7. Las entradas habilitadas se pintan como enlace; las bloqueadas se pintan como texto
   `aria-disabled` con `title` y `aria-describedby` del motivo
   (`apps/web/src/components/admin/AdminLayout.tsx:117`).
8. El grupo **Sistemas** (`ADMIN_SYSTEMS_NAV`, incremento v3) solo se monta si `session.isOwner`
   (`apps/web/src/components/admin/AdminLayout.tsx:242`, catálogo en `adminNav.ts:152`).
9. Dentro de cada página, `AdminPanel` vuelve a comprobar el rol y, si falta, pinta el aviso
   `data-testid="role-denied"` en lugar del contenido
   (`apps/web/src/components/admin/AdminPanel.tsx:26`, `:34`). Ejemplo: `/admin/mint` exige
   `MINTER_ROLE` (`apps/web/src/app/admin/mint/page.tsx:11`).

### 2.2 Validaciones

- **Sesión obligatoria.** Sin token válido, `authorize` devuelve `unauthorized`
  (`apps/web/src/lib/guard.ts:107`) y `requireRole` lo traduce a **401**
  (`apps/web/src/lib/guard.ts:211`).
- **Rol de operador reconocido.** Un rol fuera del vocabulario de operadores se trata como
  `forbidden` (`apps/web/src/lib/guard.ts:128`, `:162`).
- **Rol exigido.** Con sesión válida pero sin el rol, la respuesta es **403**
  (`apps/web/src/lib/guard.ts:136`, `:211`). Las rutas sin rol explícito se reservan a los roles
  de gestión (`:148`).
- **Fallo de configuración.** Secreto ausente o Redis caído devuelven **500** para cerrar en falso
  (`apps/web/src/lib/guard.ts:182`, `:211`).
- **Gating de UI no es seguridad.** El propio código lo advierte: es UX y autorización de
  aplicación; al firmar, el contrato comprueba su propia tabla de AccessControl
  (`apps/web/src/lib/admin-roles.ts:11`).

### 2.3 Efectos on-chain / persistencia

- Este CU **no escribe** en la cadena. Solo resuelve sesión y pinta navegación.
- La autoridad de cadena se manifiesta cuando el owner lanza una acción: `mint` exige
  `onlyRole(MINTER_ROLE)` (`packages/contracts/src/HotelNights.sol:132`) y `markCheckedIn` exige
  `onlyRole(RECEPTION_ROLE)` y `whenNotPaused` (`packages/contracts/src/HotelNights.sol:198`).
  Si la wallet firmante no tiene el rol, la transacción revierte aunque la web la deje pulsar.
- Persistencia de la sesión: tabla `admin_sessions` (`packages/shared/src/db/schema.sql:65`) y
  blocklist en Redis consultada por el guard (`apps/web/src/lib/guard.ts:14`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Ruta / firma | Rol exigido | Referencia |
|---|---|---|---|
| Login (paso 1) | `POST /api/auth/login` | público | `apps/web/src/app/api/auth/login/route.ts:24` |
| Segundo factor | `POST /api/auth/mfa/verify` | reto válido | `apps/web/src/app/api/auth/mfa/verify/route.ts:29` |
| Sesión actual | `GET /api/auth/session` | cookie válida | `apps/web/src/app/api/auth/session/route.ts:22` |
| Cierre de sesión | `POST /api/auth/logout` | cookie válida | `apps/web/src/app/api/auth/logout/route.ts` |
| Métricas | `GET /api/admin/metrics` | cualquier rol de gestión | `apps/web/src/app/api/admin/metrics/route.ts:28` |
| Publicar noche | `POST /api/admin/mint` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/mint/route.ts:55` |
| Contrato, check-in | `markCheckedIn(uint256)` | `RECEPTION_ROLE` | `packages/contracts/src/HotelNights.sol:198` |

### 4.2 Eventos y errores canónicos

- **Evento on-chain (solo si el owner opera):** `CheckedIn(uint256 indexed tokenId, address indexed by, uint256 timestamp)`
  (`packages/contracts/src/IHotelNights.sol:42`).
- **Errores de guard (API):** `UNAUTHORIZED` (401), `FORBIDDEN` (403) y `SERVER_MISCONFIGURED` (500)
  (`apps/web/src/lib/guard.ts:212`).
- **Errores de acceso (UI):** `invalidCredentials`, `mfaInvalid`, `locked`, `rateLimited`,
  `expired` y `failed` (`apps/web/src/components/admin/useAdminSession.ts:12`), mapeados desde
  429, 423 y 401 en `:171`–`:222`.
- **Aviso de panel bloqueado:** clave i18n `admin.roleDenied` (`apps/web/messages/es.json:482`).

### 4.3 Estructuras de datos y almacenamiento

- `AdminSession` expone `sessionUsername`, `roles`, `isOwner`, `hasRole(role)` y `apiFetch`
  (`apps/web/src/components/admin/useAdminSession.ts:23`).
- `ADMIN_NAV_SECTIONS` agrupa las entradas en siete secciones de acordeón con icono
  (`apps/web/src/components/admin/adminNav.ts:79`); `ADMIN_NAV` es su proyección plana (`:146`).
- Cada `AdminNavItem` declara `href`, `labelKey` y `role: RoleName | null`; `null` significa
  «cualquier sesión válida» (`apps/web/src/components/admin/adminNav.ts:36`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin sesión en `/admin/**` | pantalla de acceso (no se renderiza el panel) | `apps/web/src/app/admin/layout.tsx:23` |
| Sin token en `/api/admin/**` | 401 `UNAUTHORIZED` | `apps/web/src/lib/guard.ts:107`, `:211` |
| Recepción pide una acción de owner | 403 `FORBIDDEN` | `apps/web/src/lib/guard.ts:138` |
| Recepción abre un panel de administración | aviso `role-denied` | `apps/web/src/components/admin/AdminPanel.tsx:34` |
| Entrada no permitida en el sidebar | texto `aria-disabled` + `lockedHint` | `apps/web/src/components/admin/AdminLayout.tsx:117` |
| Owner sin `MINTER_ROLE` on-chain publica | revert del contrato | `packages/contracts/src/HotelNights.sol:135` |
| Contrato en pausa | revert `EnforcedPause` (`whenNotPaused`) | `packages/contracts/src/HotelNights.sol:201` |
| Token caducado en un panel abierto | bloque `session-expired-block` | `apps/web/src/components/admin/AdminPanel.tsx:42` |
| Exceso de peticiones a `/api/admin**` | 429 del WAF de borde (30/min por IP) | `apps/web/src/middleware.ts:25` |

## 6. Pruebas y evidencia

- `apps/web/src/lib/admin-roles.test.ts:10`: el owner satisface cualquier rol; recepción **nunca**
  se eleva a `DEFAULT_ADMIN_ROLE` ni a `MINTER_ROLE` (`:31`).
- `apps/web/src/components/admin/admin-shell.test.ts:37`: derivación de la ruta activa, sección del
  acordeón e iconos; `:94` fija el contrato del shell (plegado por clase, `aria-expanded`,
  `aria-controls`, cajón móvil y migas).
- `apps/web/src/lib/guard.test.ts:104`: el guard acepta una sesión `RECEPTION_ROLE` donde
  corresponde y rechaza el resto.
- `apps/web/src/app/api/reception/reception-v2.test.ts:49`: el patrón 401/403 con `RECEPTION_ROLE`
  verificado en las rutas de recepción.
- `apps/web/e2e/a11y.spec.ts:35`: auditoría axe de las rutas `/admin/**` (incluida
  `/admin/dashboard`) sin violaciones critical/serious.
- **No cubierto:** no hay prueba de extremo a extremo que entre con un usuario real
  `DEFAULT_ADMIN_ROLE` por TOTP y compruebe los enlaces habilitados uno a uno; el gating se prueba
  en unitario, no navegando.

## 7. Pendiente de confirmar

- El criterio Gherkin habla de «los **7** enlaces de `ADMIN_NAV`»
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:38`). El catálogo real ya tiene **14**
  entradas tras los incrementos F3–F6 (`apps/web/src/components/admin/adminNav.ts:79`–`:143`).
  No se ha reescrito el criterio.
- El flujo alternativo A1 dice que «las rutas de administración responden 403» a recepción
  (`casos_uso_incremento.md:29`). En el código, la **página** `/admin/**` sí se abre con
  `RECEPTION_ROLE` —la puerta de servidor no exige rol de administración
  (`apps/web/src/app/admin/layout.tsx:22`, `apps/web/src/lib/guard.ts:148`)— y el bloqueo visible
  es el aviso `role-denied`; el 403 lo devuelven las APIs que sí declaran rol, como
  `POST /api/admin/mint` (`apps/web/src/app/api/admin/mint/route.ts:55`).
- `POST /api/admin/mint` exige `DEFAULT_ADMIN_ROLE` (`:55`), no `MINTER_ROLE` como el panel
  (`apps/web/src/app/admin/mint/page.tsx:11`). No queda documentado por qué el requisito de API
  difiere del de UI.
- No hay datos de siembra visibles en el repositorio que creen `admin@hotel.es` con
  `DEFAULT_ADMIN_ROLE`: el actor se toma del documento de incremento
  (`casos_uso_incremento.md:11`), no del código.
