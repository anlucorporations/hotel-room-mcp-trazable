# CU-40 · El menú de la cartera y del usuario — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Cualquier usuario · Requisitos: RF-40, RF-40.1, RF-40.2, RF-40.3

## 1. Ficha y trazabilidad

- **Objetivo.** Un único menú desplegable en la cabecera que reúne la identidad del usuario y las
  acciones de cartera (wallet) o de cuenta, tanto en el sitio público como en el back-office.
- **Actor primario.** Cualquier usuario. **Secundarios:** visitante sin sesión (solo acciones de
  cartera y acceso al back-office), recepción (`RECEPTION_ROLE`, sin Usuarios ni Roles) y owner
  (`DEFAULT_ADMIN_ROLE`, con todo). Actores descritos en
  `RepoTecnico/incremento_v3/casos_uso_incremento.md:10`–`:12`.
- **Requisitos que cubre.** RF-40, RF-40.1, RF-40.2 y RF-40.3
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:20`). Decisiones asociadas: **D-76** (la suite
  pública es el home del proyecto) y **D-77** (el menú ofrece los accesos a las suites que
  corresponden al tipo de usuario), documentadas en `apps/web/src/lib/suite-access.ts:1`.
- **Precondición.** Página cargada; no se exige sesión ni cartera conectada
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:19`).
- **Disparador.** El usuario pulsa el botón del menú en la cabecera
  (`apps/web/src/components/wallet/WalletMenu.tsx:135`).
- **Postcondición.** El panel se despliega con el título (usuario + rol, o dirección de cartera) y
  las entradas disponibles; al elegir una entrada se navega o se ejecuta la acción y el panel se
  cierra (`apps/web/src/components/wallet/WalletMenu.tsx:100`, `:110`, `:184`).
- **Dónde vive.**
  - Componente: `apps/web/src/components/wallet/WalletMenu.tsx:64`.
  - Decisión pura de entradas: `apps/web/src/lib/wallet-menu-items.ts:52`.
  - Accesos por suite: `apps/web/src/lib/suite-access.ts:40`.
  - Cabecera pública: `apps/web/src/components/layout/SiteHeader.tsx:169`.
  - Barra superior del back-office: `apps/web/src/components/admin/AdminLayout.tsx:373`.
  - Estado de cartera y sesión: `apps/web/src/components/wallet/useOnboarding.ts:29` y
    `apps/web/src/components/admin/useAdminSession.ts:88`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. La página monta la cabecera. En público, `SiteHeader` resuelve la sesión con `useAdminSession`
   (`apps/web/src/components/layout/SiteHeader.tsx:93`) y pasa el resultado a `WalletMenu`
   (`:169`); en back-office, `Topbar` hace lo mismo dentro de `AdminLayout`
   (`apps/web/src/components/admin/AdminLayout.tsx:373`).
2. El botón se pinta con `aria-expanded`, `aria-controls` y `aria-label` dependientes del estado
   (`apps/web/src/components/wallet/WalletMenu.tsx:132`), más `data-testid="wallet-menu-button"`
   (`:130`). El punto de color indica si hay cartera conectada (`:140`).
3. El título se calcula en una sola expresión: usuario de sesión si la hay; si no, dirección
   abreviada de la cartera; si no, el texto «Wallet no conectada»
   (`apps/web/src/components/wallet/WalletMenu.tsx:120`). La abreviatura es
   `0x1234…abcd` (`:37`). Con sesión se añade la insignia del rol (`:145`).
4. Al pulsar, `open` pasa a `true` (`apps/web/src/components/wallet/WalletMenu.tsx:135`) y el panel
   se pinta con `role="menu"` y `data-testid="wallet-menu-panel"` (`:168`, `:170`).
5. El efecto de apertura mueve el foco al primer `[role="menuitem"]` y registra el cierre con
   `Escape`, que además devuelve el foco al botón
   (`apps/web/src/components/wallet/WalletMenu.tsx:78`–`:90`).
6. Las entradas salen de la función pura `walletMenuItems`, alimentada con `hasSession`, `isOwner`,
   `isConnected`, `isWrongNetwork` y los roles de la sesión
   (`apps/web/src/components/wallet/WalletMenu.tsx:92`; decisión en
   `apps/web/src/lib/wallet-menu-items.ts:52`).
7. Cada entrada es un enlace (`href`) o un botón. Los botones cubren conectar, cambiar de red,
   desconectar y cerrar sesión; el resto navega
   (`apps/web/src/components/wallet/WalletMenu.tsx:179`, `:190`).
8. Antes del primer acceso a otra suite se inserta el encabezado «Tus suites»
   (`apps/web/src/components/wallet/WalletMenu.tsx:202`; conjunto de acciones en `:45`).
9. Al pie del panel se monta el botón de grifo de pruebas (`FaucetButton`), que se oculta solo si
   no aplica (`apps/web/src/components/wallet/WalletMenu.tsx:218`).

### 2.2 Validaciones

- **Estado de cartera.** Conectado en red incorrecta ⇒ «Cambiar de red»; conectado ⇒ «Desconectar»;
  sin conectar ⇒ «Conectar» (`apps/web/src/lib/wallet-menu-items.ts:56`–`:62`).
- **Sesión de back-office.** Con `hasSession` se añaden los accesos de suite y las acciones de
  cuenta; sin sesión, solo el acceso a `/admin`
  (`apps/web/src/lib/wallet-menu-items.ts:64`, `:77`).
- **Owner.** Las entradas Usuarios (`/admin/sistemas/usuarios`) y Roles (`/admin/roles`) solo se
  añaden si `isOwner` (`apps/web/src/lib/wallet-menu-items.ts:72`; `isOwner` se calcula como
  `roles.includes("DEFAULT_ADMIN_ROLE")` en `apps/web/src/components/admin/useAdminSession.ts:265`).
- **Roles sin suite propia.** Minter, pauser, burner y tesorería entran por Administración
  (`apps/web/src/lib/suite-access.ts:32`, `:54`).
- **Accesibilidad.** `aria-expanded`/`aria-controls` coherentes con el panel (RF-40.3), foco al
  primer elemento y retorno al botón; el velo de cierre al pulsar fuera lleva `aria-hidden` y
  `tabIndex={-1}` (`apps/web/src/components/wallet/WalletMenu.tsx:158`, `:161`).
- **Nada de esto es autorización.** El propio módulo lo advierte: es solo vista y la seguridad real
  vive en el servidor (`apps/web/src/lib/wallet-menu-items.ts:5`;
  `apps/web/src/lib/suite-access.ts:5`).

### 2.3 Efectos on-chain / persistencia

- Este caso de uso **no escribe** en la cadena ni en base de datos. Solo pinta navegación y delega
  en dos servicios del cliente:
  - `useOnboarding` para `connect`, `switchToAppChain` y `disconnect`
    (`apps/web/src/components/wallet/useOnboarding.ts:62`–`:71`).
  - `signOut` de la sesión, que llama a `POST /api/auth/logout` y refresca la ruta
    (`apps/web/src/components/wallet/WalletMenu.tsx:104`;
    `apps/web/src/components/admin/useAdminSession.ts:240`).
- La conexión de cartera queda en el proveedor inyectado del navegador, no en el servidor
  (`apps/web/src/components/wallet/useOnboarding.ts:4`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Entradas del menú | `walletMenuItems(input): readonly WalletMenuItem[]` | `apps/web/src/lib/wallet-menu-items.ts:52` |
| Accesos por rol | `suiteLinksForRoles(roles, isOwner)` | `apps/web/src/lib/suite-access.ts:40` |
| Cierre de sesión | `POST /api/auth/logout` | `apps/web/src/components/admin/useAdminSession.ts:242` |
| Sesión actual | `GET /api/auth/session` | `apps/web/src/components/admin/useAdminSession.ts:107` |
| Renovación | `POST /api/auth/refresh` | `apps/web/src/components/admin/useAdminSession.ts:146` |
| Conectar cartera | `onboarding.connect()` | `apps/web/src/components/wallet/useOnboarding.ts:62` |
| Cambiar de red | `onboarding.switchToAppChain()` | `apps/web/src/components/wallet/useOnboarding.ts:64` |
| Desconectar | `onboarding.disconnect()` | `apps/web/src/components/wallet/useOnboarding.ts:71` |

### 4.2 Eventos y errores canónicos

- No emite eventos on-chain.
- El menú no produce errores propios: los de sesión se resuelven en `useAdminSession`
  (`invalidCredentials`, `mfaInvalid`, `locked`, `rateLimited`, `expired`, `failed` en
  `apps/web/src/components/admin/useAdminSession.ts:12`).
- Si el cierre de sesión falla en red, `signOut` limpia igualmente el estado local porque el
  `finally` no depende de la respuesta (`apps/web/src/components/admin/useAdminSession.ts:240`).

### 4.3 Estructuras de datos y almacenamiento

- `WalletMenuAction` enumera las trece acciones posibles y `WalletMenuItem` lleva `action` y `href`
  opcional (`apps/web/src/lib/wallet-menu-items.ts:15`, `:38`).
- `WalletMenuInput` declara `hasSession`, `isOwner`, `isConnected`, `isWrongNetwork` y `roles`
  (`apps/web/src/lib/wallet-menu-items.ts:29`).
- La etiqueta de cada rol se resuelve con dos tablas: roles de back-office y roles on-chain sin
  suite (`apps/web/src/components/wallet/WalletMenu.tsx:17`, `:25`).
- Los textos viven en el espacio de nombres `walletMenu` del catálogo español
  (`apps/web/messages/es.json:916`), por ejemplo `notConnected`, `sessionTitle`, `suitesTitle`.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin sesión y sin cartera | título «Wallet no conectada»; entradas Conectar + Iniciar sesión | `apps/web/src/components/wallet/WalletMenu.tsx:120`; `apps/web/src/lib/wallet-menu-items.ts:61`, `:79` |
| Cartera conectada en red incorrecta | entrada Cambiar de red (y no Desconectar) | `apps/web/src/lib/wallet-menu-items.ts:56` |
| Sesión de recepción | sin Usuarios ni Roles; con Seguridad y Salir | `apps/web/src/lib/wallet-menu-items.ts:70`, `:72` |
| Sesión de owner | cuatro suites + Seguridad + Usuarios + Roles + Salir | `apps/web/src/lib/wallet-menu-items.test.ts:45` |
| Rol de back-office sin suite propia | un solo acceso: Administración | `apps/web/src/lib/suite-access.ts:54` |
| Sin ningún rol con sesión | ninguna suite; solo Seguridad y Salir | `apps/web/src/lib/suite-access.ts:47` |
| Sesión caducada al usar el menú | `expired`; se limpia el usuario y se pide volver a entrar | `apps/web/src/components/admin/useAdminSession.ts:148` |
| Clic fuera del panel | el velo lo cierra sin capturar foco | `apps/web/src/components/wallet/WalletMenu.tsx:158` |
| `Escape` con el panel abierto | se cierra y el foco vuelve al botón | `apps/web/src/components/wallet/WalletMenu.tsx:82` |

## 6. Pruebas y evidencia

- `apps/web/src/lib/wallet-menu-items.test.ts:11`: en público, Conectar + Iniciar sesión; `:16`:
  conectada ⇒ Desconectar; `:21`: red incorrecta ⇒ Cambiar de red.
- `apps/web/src/lib/wallet-menu-items.test.ts:28`: recepción ve Seguridad y Salir y el acceso a
  Front Office, y **no** ve Usuarios ni Roles.
- `apps/web/src/lib/wallet-menu-items.test.ts:36`: housekeeping y mantenimiento ven su propia
  suite (D-77); `:45`: el owner ve las cuatro suites, Usuarios y Roles.
- `apps/web/src/lib/wallet-menu-items.test.ts:62`: cada entrada de navegación lleva su ruta exacta.
- `apps/web/src/components/admin/admin-shell.test.ts:52`: el grupo Sistemas no abre ninguna sección
  del acordeón; `:123`: el shell declara sidebar, navbar, cabecera, `main` y pie.
- `apps/web/e2e/a11y.spec.ts:19`: auditoría axe de las rutas públicas y de back-office (entre ellas
  `/admin/dashboard`) sin violaciones critical ni serious; el menú se escanea dentro de la cabecera.
- **No cubierto:** no existe prueba de componente que abra el panel y compruebe foco, `Escape` y
  `aria-expanded` en un DOM real; el comportamiento de teclado de RF-40.3 se sostiene solo en la
  lectura del efecto y en la auditoría de accesibilidad genérica.

## 7. Pendiente de confirmar

- El Gherkin del incremento pide que el owner vea «Seguridad, Usuarios, Roles y Salir»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:39`). El código real añade **antes** de esas
  entradas los accesos a las cuatro suites y el encabezado «Tus suites» (D-77), que no aparecen en
  el criterio (`apps/web/src/lib/wallet-menu-items.ts:66`; `:202`).
- El Gherkin del visitante dice que el menú ofrece «cambiar de red, desconectar y el acceso al
  back-office» (`casos_uso_incremento.md:51`). Con la cartera conectada en la red correcta solo hay
  **una** acción de cartera (Desconectar): no se ofrecen a la vez cambiar de red y desconectar
  (`apps/web/src/lib/wallet-menu-items.ts:56`).
- Las tablas de etiquetas contemplan roles on-chain (`MINTER_ROLE`, `PAUSER_ROLE`, `BURNER_ROLE`,
  `TREASURER_ROLE`) para la insignia del menú (`apps/web/src/components/wallet/WalletMenu.tsx:25`),
  pero la sesión de back-office solo transporta `DEFAULT_ADMIN_ROLE` o `RECEPTION_ROLE`
  (`apps/web/src/components/admin/useAdminSession.ts:28`); no se ha podido comprobar un caso real
  donde la insignia muestre esos cuatro roles.
- La insignia usa únicamente el primer rol de la sesión
  (`apps/web/src/components/wallet/WalletMenu.tsx:117`): con una sesión multirol la etiqueta podría
  no representar todos los roles. No hay escenario que lo fije.
- El botón del grifo dentro del panel (`apps/web/src/components/wallet/WalletMenu.tsx:218`) no se
  menciona en el criterio de aceptación; su visibilidad depende del propio componente
  (`apps/web/src/components/wallet/FaucetButton.tsx:25`) y no se ha verificado en producción.
