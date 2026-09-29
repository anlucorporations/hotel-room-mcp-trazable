# CU-41 · La sección «Sistemas» (solo para el dueño) — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Owner · Requisitos: RF-41, RF-41.1

## 1. Ficha y trazabilidad

- **Objetivo.** Reunir en una sola sección del back-office el gobierno de la plataforma (contratos,
  usuarios, finanzas y operaciones) y reservarla a la cuenta del propietario, con la puerta cerrada
  en el servidor, no solo en la interfaz.
- **Actor primario.** Owner (`DEFAULT_ADMIN_ROLE`). **Secundario:** recepción (`RECEPTION_ROLE`),
  que debe quedar fuera de la sección. Actores descritos en
  `RepoTecnico/incremento_v3/casos_uso_incremento.md:10`.
- **Requisitos que cubre.** RF-41 y RF-41.1
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:70`). Requisito no funcional asociado:
  RNF-41, que prohíbe exponer secretos de los operadores
  (`apps/web/src/app/api/admin/system/users/route.ts:26`).
- **Precondición.** Sesión iniciada con `DEFAULT_ADMIN_ROLE`
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:69`). La sesión se obtiene con usuario,
  contraseña y TOTP (`apps/web/src/components/admin/useAdminSession.ts:88`).
- **Disparador.** El owner abre el back-office; el sidebar monta el grupo Sistemas
  (`apps/web/src/components/admin/AdminLayout.tsx:244`).
- **Postcondición.** El owner ve y abre las entradas de Sistemas; cualquier otro rol recibe la
  pantalla de acceso denegado o un 403 en las APIs. Sin escritura on-chain en este caso de uso.
- **Dónde vive.**
  - Catálogo de la sección: `apps/web/src/components/admin/adminNav.ts:152`.
  - Gating de UI: `apps/web/src/components/admin/AdminLayout.tsx:244`–`:266`.
  - Puerta de servidor de las páginas: `apps/web/src/app/admin/sistemas/layout.tsx:16`.
  - Portada con tarjetas: `apps/web/src/app/admin/sistemas/page.tsx:7`.
  - Guard de las APIs: `apps/web/src/lib/guard.ts:201` (`requireRole`).
  - API de usuarios: `apps/web/src/app/api/admin/system/users/route.ts:44`.
  - API de operaciones: `apps/web/src/app/api/admin/system/operations/route.ts:15`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El operador entra en el back-office. El layout de servidor verifica la cookie de sesión con
   `currentAdminSession()` y, si no es válida, sirve la pantalla de acceso
   (`apps/web/src/app/admin/layout.tsx:22`).
2. Con sesión resuelta, el componente `Sidebar` pinta el grupo Sistemas **solo** cuando
   `session.isOwner` es cierto (`apps/web/src/components/admin/AdminLayout.tsx:244`); `isOwner` se
   calcula como `roles.includes("DEFAULT_ADMIN_ROLE")`
   (`apps/web/src/components/admin/useAdminSession.ts:265`).
3. El grupo se compone de `ADMIN_SYSTEMS_NAV` y se marca con `data-testid="nav-systems"`
   (`apps/web/src/components/admin/AdminLayout.tsx:245`). La lista tiene seis entradas y todas
   declaran `role: "DEFAULT_ADMIN_ROLE"`
   (`apps/web/src/components/admin/adminNav.ts:152`–`:159`).
4. Con el sidebar plegado a mini, el grupo se reduce a un único enlace con nombre accesible
   (`apps/web/src/components/admin/AdminLayout.tsx:247`); desplegado, se pintan la cabecera
   «Sistemas» y sus entradas (`:258`, `:262`).
5. Al abrir cualquier ruta bajo `/admin/sistemas`, el layout de la sección vuelve a comprobar la
   sesión en el servidor: sin sesión devuelve la pantalla de acceso
   (`apps/web/src/app/admin/sistemas/layout.tsx:18`); con sesión que no es `DEFAULT_ADMIN_ROLE`,
   pinta el aviso `data-testid="systems-denied"` y no el contenido
   (`apps/web/src/app/admin/sistemas/layout.tsx:20`, `:28`).
6. La portada `/admin/sistemas` lista cuatro tarjetas —Contratos, Usuarios, Finanzas y
   Operaciones— con `data-testid="systems-cards"`
   (`apps/web/src/app/admin/sistemas/page.tsx:7`, `:24`).
7. Cada subpágina repite el requisito en `AdminPanel` mediante `requiredRole`
   (`apps/web/src/app/admin/sistemas/usuarios/page.tsx:12`; el mecanismo, en
   `apps/web/src/components/admin/AdminPanel.tsx:26`).
8. Las migas de pan del grupo se derivan de la ruta: Inicio → Sistemas → entrada
   (`apps/web/src/components/admin/adminNav.ts:224`).
9. Cuando una de esas páginas llama a su API, el guard de servidor exige otra vez el rol con
   `requireRole(request, "DEFAULT_ADMIN_ROLE")`
   (`apps/web/src/app/api/admin/system/users/route.ts:45`;
   `apps/web/src/app/api/admin/system/operations/route.ts:16`).

### 2.2 Validaciones

- **Autorización en servidor (RF-41.1).** El layout de Sistemas exige el rol antes de renderizar
  cualquier subpágina, con el mismo guard que las APIs
  (`apps/web/src/app/admin/sistemas/layout.tsx:9`).
- **401 y 403.** `authorize` devuelve `unauthorized` sin token válido
  (`apps/web/src/lib/guard.ts:107`) y `forbidden` cuando la sesión no ostenta el rol
  (`apps/web/src/lib/guard.ts:138`); `requireRole` los traduce a 401 y 403 respectivamente
  (`apps/web/src/lib/guard.ts:211`).
- **Fallo de configuración.** Secreto ausente o Redis caído se clasifican como
  `misconfigured` y responden 500 para cerrar en falso (`apps/web/src/lib/guard.ts:182`).
- **El gating de UI es complemento, no sustituto.** El comentario del sidebar lo deja explícito: el
  gating real lo imponen las rutas y las APIs
  (`apps/web/src/components/admin/AdminLayout.tsx:243`).
- **Owner implica cualquier rol** a efectos de aplicación
  (`apps/web/src/lib/admin-roles.ts:20`), pero la puerta de Sistemas compara el rol de la sesión de
  forma estricta contra `DEFAULT_ADMIN_ROLE`
  (`apps/web/src/app/admin/sistemas/layout.tsx:20`).
- **Puerta total del back-office.** El layout raíz ya verifica la sesión en el render
  (`apps/web/src/app/admin/layout.tsx:22`), de modo que Sistemas queda detrás de dos comprobaciones.

### 2.3 Efectos on-chain / persistencia

- Este caso de uso **no** escribe en la cadena ni en base de datos: solo autoriza y pinta
  navegación.
- Las acciones peligrosas que cuelgan de la sección sí firman transacciones y se documentan en sus
  propios casos de uso (CU-43 contratos, CU-44 finanzas, CU-45 operaciones).
- La lectura de datos de los paneles se hace siempre a través de APIs guardadas, nunca en el
  render de la página sin sesión (`apps/web/src/app/api/admin/system/operations/route.ts:16`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Ruta / firma | Rol exigido | Referencia |
|---|---|---|---|
| Catálogo de la sección | `ADMIN_SYSTEMS_NAV` | — (vista) | `apps/web/src/components/admin/adminNav.ts:152` |
| Portada | `/admin/sistemas` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/admin/sistemas/layout.tsx:20` |
| Contratos | `/admin/sistemas/contratos` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/admin/sistemas/contratos/page.tsx:17` |
| Usuarios | `/admin/sistemas/usuarios` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/admin/sistemas/usuarios/page.tsx:12` |
| Finanzas | `/admin/sistemas/finanzas` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/admin/sistemas/finanzas/page.tsx` |
| Operaciones | `/admin/sistemas/operaciones` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/admin/sistemas/operaciones/page.tsx` |
| Ajustes | `/admin/sistemas/ajustes` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/admin/sistemas/ajustes/page.tsx:9` |
| Listar operadores | `GET /api/admin/system/users` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/system/users/route.ts:45` |
| Estado del worker | `GET /api/admin/system/operations` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/system/operations/route.ts:16` |

### 4.2 Eventos y errores canónicos

- No emite eventos on-chain.
- **Errores de guard (API):** `UNAUTHORIZED` (401), `FORBIDDEN` (403) y `SERVER_MISCONFIGURED`
  (500) (`apps/web/src/lib/guard.ts:212`).
- **Pantallas de denegación:** `systems-denied` para la sección
  (`apps/web/src/app/admin/sistemas/layout.tsx:28`) y `role-denied` para los paneles que vuelven a
  comprobar el rol (`apps/web/src/components/admin/AdminPanel.tsx:36`).
- **Textos:** `admin.systemsTitle`, `admin.systemsDenied` y `admin.systemsTagline`
  (`apps/web/messages/es.json:650`–`:652`).

### 4.3 Estructuras de datos y almacenamiento

- `AdminNavItem` declara `href`, `labelKey` y `role: RoleName | null`
  (`apps/web/src/components/admin/adminNav.ts:36`).
- `ADMIN_SYSTEMS_NAV` es una lista plana: no participa del acordeón de secciones, y por eso
  `sectionForPathname` devuelve `null` en las rutas de Sistemas
  (`apps/web/src/components/admin/adminNav.ts:181`).
- El grupo usa el icono `server`, el único que queda visible con el sidebar plegado
  (`apps/web/src/components/admin/adminNav.ts:162`).
- La sesión llega al cliente como `AdminSession` con `sessionUsername`, `roles`, `isOwner` y
  `hasRole` (`apps/web/src/components/admin/useAdminSession.ts:23`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Cliente sin sesión pide `/api/admin/system/users` | 401 `UNAUTHORIZED` | `apps/web/src/app/api/admin/system/users/route.ts:45`; `apps/web/src/lib/guard.ts:107` |
| Sesión de recepción pide la misma API | 403 `FORBIDDEN` | `apps/web/src/lib/guard.ts:138` |
| Recepción abre `/admin/sistemas/**` | aviso `systems-denied` | `apps/web/src/app/admin/sistemas/layout.tsx:20`, `:28` |
| Sin cookies en `/admin/sistemas/**` | pantalla de acceso (no el panel) | `apps/web/src/app/admin/sistemas/layout.tsx:18` |
| Recepción mira el sidebar | el grupo Sistemas no se monta | `apps/web/src/components/admin/AdminLayout.tsx:244` |
| Ruta de Sistemas con el acordeón | ninguna sección se abre (`null`) | `apps/web/src/components/admin/adminNav.ts:181` |
| Redis caído o secreto ausente | 500 `SERVER_MISCONFIGURED` | `apps/web/src/lib/guard.ts:182`, `:211` |
| Exceso de peticiones a `/api/admin**` | 429 del WAF de borde (30/min por IP) | `apps/web/src/middleware.ts:25` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/admin/system/users.test.ts:43`: la API responde 401 sin sesión y exige
  `DEFAULT_ADMIN_ROLE`; `:53`: responde 403 con una sesión que no es owner.
- `apps/web/src/components/admin/admin-shell.test.ts:52`: el grupo Sistemas no abre ninguna sección
  del acordeón; `:64`: las migas del grupo son Inicio → Sistemas → entrada.
- `apps/web/src/components/admin/admin-shell.test.ts:83`: cada sección del acordeón tiene su icono
  dibujado, lo que incluye el icono `server` del grupo.
- `apps/web/e2e/a11y.spec.ts:41`: se escanea `/admin/sistemas/ajustes` sin violaciones critical ni
  serious (en el entorno E2E, sin sesión, se mide la pantalla de acceso).
- **No cubierto:** no hay prueba automática que compruebe el `systems-denied` del layout de
  servidor ni la ausencia del grupo en el sidebar para recepción; tampoco hay prueba de navegación
  real que entre como owner y abra las cinco entradas.

## 7. Pendiente de confirmar

- El criterio Gherkin dice que el sidebar muestra «Contratos, Usuarios, Finanzas y Operaciones»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:78`). El catálogo real tiene **seis** entradas:
  añade la portada `/admin/sistemas` y **Ajustes** (`apps/web/src/components/admin/adminNav.ts:153`,
  `:158`). La portada solo pinta cuatro tarjetas, así que Ajustes queda accesible por el sidebar y
  no por la portada (`apps/web/src/app/admin/sistemas/page.tsx:7`).
- No se ha encontrado una prueba específica del gate de `apps/web/src/app/admin/sistemas/layout.tsx`
  ni del render condicional `session.isOwner` del sidebar; la verificación existe en las APIs, no en
  las páginas.
- La restricción EARS exige denegar «toda ruta y API de Sistemas» a quien no sea owner
  (`casos_uso_incremento.md:94`). Las rutas cubiertas por el layout están cerradas, pero el estado
  de `/admin/sistemas/finanzas` y `/admin/sistemas/operaciones` frente a una sesión de recepción no
  se ha podido comprobar ejecutando la aplicación.
- El layout de la sección compara el rol con `DEFAULT_ADMIN_ROLE` de forma exacta
  (`apps/web/src/app/admin/sistemas/layout.tsx:20`), mientras el guard de API y `roleSatisfies`
  tratan al owner como comodín (`apps/web/src/lib/admin-roles.ts:20`). No está documentado si esa
  diferencia es deliberada.
