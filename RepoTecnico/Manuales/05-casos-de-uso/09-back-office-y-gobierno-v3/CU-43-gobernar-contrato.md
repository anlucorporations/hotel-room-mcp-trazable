# CU-43 · Gobernar el contrato (pausar, roles, royalty, propiedad) — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Owner · Requisitos: RF-43

## 1. Ficha y trazabilidad

- **Objetivo.** Ver el estado on-chain del contrato canónico desde Sistemas → Contratos y ejecutar
  las acciones de gobierno que sí existen en el contrato: conceder y revocar roles, pausar y
  reanudar, y gestionar la titularidad informativa (`owner`/`pendingOwner`).
- **Actor primario.** Owner (`DEFAULT_ADMIN_ROLE`). **Secundarios:** el titular de la wallet que
  firma, que debe ostentar on-chain el rol de cada acción (`PAUSER_ROLE` para la pausa,
  `DEFAULT_ADMIN_ROLE` para roles y propiedad).
- **Requisitos que cubre.** RF-43 (`RepoTecnico/incremento_v3/casos_uso_incremento.md:147`).
- **Precondición.** Sesión de back-office con `DEFAULT_ADMIN_ROLE` y wallet conectada con los roles
  on-chain (`RepoTecnico/incremento_v3/casos_uso_incremento.md:146`).
- **Disparador.** El owner abre Sistemas → Contratos
  (`apps/web/src/app/admin/sistemas/contratos/page.tsx:12`).
- **Postcondición.** La transacción firmada queda minada y el estado leído se refresca: `paused`,
  `owner` y `pendingOwner` se vuelven a consultar al confirmar
  (`apps/web/src/components/admin/AdminPause.tsx:45`;
  `apps/web/src/components/admin/AdminRoles.tsx:74`).
- **Dónde vive.**
  - Página: `apps/web/src/app/admin/sistemas/contratos/page.tsx:12`.
  - Estado en solo lectura: `apps/web/src/components/admin/system/SystemContractState.tsx:15`.
  - Roles y propiedad: `apps/web/src/components/admin/AdminRoles.tsx:44`.
  - Pausa: `apps/web/src/components/admin/AdminPause.tsx:28`.
  - Escritura genérica: `apps/web/src/components/admin/useAdminWrite.ts:29`.
  - Contrato: `packages/contracts/src/HotelNights.sol:314` (`pause`), `:319` (`unpause`),
    `:305` (`setMinListingPrice`), `:335` (`setTreasury`).
  - IDs de rol: `packages/shared/src/domain/roles.ts:30`.
  - Dirección y red: `apps/web/src/config/chain.ts:13` y `:80`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El owner entra en `/admin/sistemas/contratos`. El layout comprueba en servidor la sesión y exige
   `DEFAULT_ADMIN_ROLE` antes de pintar nada
   (`apps/web/src/app/admin/sistemas/layout.tsx:17`, `:20`).
2. La página monta tres bloques: estado, roles y pausa
   (`apps/web/src/app/admin/sistemas/contratos/page.tsx:20`–`:22`).
3. `SystemContractState` lee `paused`, `treasury`, `minListingPrice` y `owner`
   (`apps/web/src/components/admin/system/SystemContractState.tsx:18`–`:21`) y los pinta junto a la
   dirección, el `chainId` y el bloque de despliegue (`:33`–`:39`).
4. Para tocar roles, elige rol y cuenta en el formulario
   (`apps/web/src/components/admin/AdminRoles.tsx:140`, `:159`). Los roles salen de
   `ALL_ROLE_NAMES` (`:147`) y sus IDs de `ROLES` (`:94`, `:115`).
5. **Conceder** valida la dirección y firma directo `grantRole(rol, cuenta)`
   (`apps/web/src/components/admin/AdminRoles.tsx:92`, `:94`). **Revocar** es destructivo: abre el
   `TxModal` en revisión y solo firma `revokeRole` al confirmar (`:101`, `:115`).
6. En la tarjeta de propiedad puede designar un owner pendiente (`transferOwnership`, `:117`, `:242`)
   o aceptar la titularidad pendiente (`acceptOwnership`, `:251`); transferir exige confirmación
   (`:108`).
7. `useAdminWrite` envía la escritura por wagmi y deriva firmar → minar → confirmar/revertir
   (`apps/web/src/components/admin/useAdminWrite.ts:33`–`:48`).
8. Al confirmarse, `AdminRoles` refresca `owner` y `pendingOwner`
   (`apps/web/src/components/admin/AdminRoles.tsx:74`–`:79`).
9. Para la pausa, `AdminPause` muestra `paused()` como texto (`AdminPause.tsx:31`, `:64`) y ofrece
   «Pausar» (`:75`) y «Reanudar» (`:84`), deshabilitados cuando no procede (`:78`, `:87`).
10. Ambas acciones piden confirmación en el `TxModal` y luego firman `pause` o `unpause`
    (`apps/web/src/components/admin/AdminPause.tsx:57`, `:59`); al confirmar se relee `paused()`
    (`:45`–`:47`).
11. Si la transacción revierte, `classifyAdminTxError` traduce el motivo a una clave de i18n
    (`apps/web/src/components/admin/adminTxError.ts:49`) y el panel muestra el aviso
    (`apps/web/src/components/admin/AdminPause.tsx:95`).

### 2.2 Validaciones

- **Gating de UI, no de cadena.** `AdminPanel` exige `DEFAULT_ADMIN_ROLE` para pintar el contenido
  y, si no lo tiene, muestra `role-denied`
  (`apps/web/src/components/admin/AdminPanel.tsx:24`, `:29`). La autoridad real es el contrato: la
  propia `useAdminWrite` avisa de que el gating por rol es solo UX y que la cadena revierte con
  `AccessControlUnauthorizedAccount` (`apps/web/src/components/admin/useAdminWrite.ts:27`).
- **Dirección de cuenta.** Conceder, revocar y transferir exigen `isAddress`; si no, se muestra
  `rolesInvalidAddress` sin enviar nada (`apps/web/src/components/admin/AdminRoles.tsx:92`, `:100`,
  `:107`).
- **Confirmación explícita.** Solo las acciones destructivas o engañosas (revocar y transferir) y
  la pausa pasan por la fase `review` del `TxModal`
  (`apps/web/src/components/admin/AdminRoles.tsx:32`, `:81`;
  `apps/web/src/components/admin/AdminPause.tsx:50`).
- **Sesión caducada.** Sin `sessionUsername`, el panel bloquea con `session-expired-block` en vez
  de dejar botones que fallarían (`apps/web/src/components/admin/AdminPanel.tsx:42`).

### 2.3 Efectos on-chain / persistencia

- `pause()` lleva `onlyRole(PAUSER_ROLE)` y `unpause()` igual
  (`packages/contracts/src/HotelNights.sol:314`, `:319`). Pausar bloquea mint, compra, reventa,
  check-in y burn (`whenNotPaused`), pero **no** la retirada de fondos, que se permite en pausa a
  propósito (`apps/web/src/components/admin/adminTxError.ts:8`–`:10`).
- `grantRole`/`revokeRole` son de AccessControl: no hay estado propio en PostgreSQL. Los roles son
  los seis de `packages/shared/src/domain/roles.ts:30`.
- `transferOwnership` y `acceptOwnership` son de `Ownable2Step` (`owner`/`pendingOwner`). El propio
  código avisa de que `owner()` es **informativo** y no cede el control real: el control es
  `DEFAULT_ADMIN_ROLE` (`apps/web/src/components/admin/AdminRoles.tsx:37`–`:42`;
  `apps/web/messages/es.json:630`).
- El contrato arranca con `DEFAULT_ADMIN_ROLE` para el desplegador y con la tesorería del
  constructor, que emite `TreasuryUpdated` (`packages/contracts/src/HotelNights.sol:124`–`:127`).
- Ninguna de estas acciones escribe en la base de datos de la aplicación.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma | Rol on-chain | Referencia |
|---|---|---|---|
| Leer pausa | `paused()` | lectura | `apps/web/src/components/admin/AdminPause.tsx:31` |
| Pausar | `pause()` | `PAUSER_ROLE` | `packages/contracts/src/HotelNights.sol:314` |
| Reanudar | `unpause()` | `PAUSER_ROLE` | `packages/contracts/src/HotelNights.sol:319` |
| Conceder rol | `grantRole(bytes32, address)` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/components/admin/AdminRoles.tsx:94` |
| Revocar rol | `revokeRole(bytes32, address)` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/components/admin/AdminRoles.tsx:115` |
| Designar owner | `transferOwnership(address)` | `owner()` | `apps/web/src/components/admin/AdminRoles.tsx:117` |
| Aceptar owner | `acceptOwnership()` | `pendingOwner` | `apps/web/src/components/admin/AdminRoles.tsx:251` |
| Leer owner | `owner()` / `pendingOwner()` | lectura | `apps/web/src/components/admin/AdminRoles.tsx:47`, `:52` |
| Leer tesorería y suelo | `treasury()` / `minListingPrice()` | lectura | `apps/web/src/components/admin/system/SystemContractState.tsx:19`, `:20` |
| Fijar suelo | `setMinListingPrice(uint256)` | `DEFAULT_ADMIN_ROLE` | `packages/contracts/src/HotelNights.sol:305` |
| Fijar tesorería | `setTreasury(address)` | `DEFAULT_ADMIN_ROLE` | `packages/contracts/src/HotelNights.sol:335` |

No hay endpoint propio de este CU: todo va por wagmi contra el contrato, sin pasar por la API de la
web.

### 4.2 Eventos y errores canónicos

- **Eventos:** `TreasuryUpdated` (`packages/contracts/src/IHotelNights.sol:40`),
  `MinListingPriceUpdated` (`:44`). `pause`/`unpause` y los cambios de rol emiten los eventos
  estándar de OpenZeppelin (`Paused`, `Unpaused`, `RoleGranted`, `RoleRevoked`,
  `OwnershipTransferStarted`, `OwnershipTransferred`); no están redeclarados en la interfaz del
  proyecto.
- **Errores propios del contrato:** `InvalidPrice` si el suelo nuevo es 0
  (`packages/contracts/src/HotelNights.sol:308`), `ZeroAddress` si la tesorería es la dirección cero
  (`:336`).
- **Errores de la UI:** `admin.txError.paused` («El sistema está en pausa. Reanúdalo antes de
  ejecutar esta acción.») y `admin.txError.noFunds`
  (`apps/web/messages/es.json:598`, `:599`), más el rechazo de firma y el fallo genérico que aporta
  `classifyTxError` (`apps/web/src/components/admin/adminTxError.ts:55`).

### 4.3 Estructuras de datos y almacenamiento

- **Estado on-chain leído:** `treasury`, `minListingPrice`, `paused`, `owner`, `pendingOwner`.
- **Estado on-chain escrito:** la tabla de roles de AccessControl y la propiedad de `Ownable2Step`.
- **Constantes de despliegue en el cliente:** `contractAddress`
  (`apps/web/src/config/chain.ts:13`), `activeChain.id` (`:80`) y `deploymentBlock` (`:40`).
- **Roles canónicos:** `ALL_ROLE_NAMES` y `ROLES`
  (`packages/shared/src/domain/roles.ts:30`, `:40`). El componente rotula las seis etiquetas en
  `apps/web/src/components/admin/AdminRoles.tsx:22`.
- **Sin persistencia en PostgreSQL** para ninguna de estas acciones.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sesión que no es owner | pantalla de acceso denegado; 401/403 en guard | `apps/web/src/app/admin/sistemas/layout.tsx:20`; `apps/web/src/lib/guard.ts:211` |
| Sesión caducada durante la pantalla | bloque `session-expired-block` | `apps/web/src/components/admin/AdminPanel.tsx:42` |
| Dirección de cuenta no válida | `rolesInvalidAddress`; no se envía tx | `apps/web/src/components/admin/AdminRoles.tsx:92` |
| Revocar un rol sin confirmar | el `TxModal` queda en `review` | `apps/web/src/components/admin/AdminRoles.tsx:101` |
| Wallet sin `PAUSER_ROLE` | revierte `AccessControlUnauthorizedAccount` | `packages/contracts/src/HotelNights.sol:314` |
| Pausar con el sistema ya en pausa | botón «Pausar» deshabilitado | `apps/web/src/components/admin/AdminPause.tsx:78` |
| Reanudar con el sistema activo | botón «Reanudar» deshabilitado | `apps/web/src/components/admin/AdminPause.tsx:87` |
| Acción `whenNotPaused` en pausa | `admin.txError.paused` | `apps/web/src/components/admin/adminTxError.ts:53` |
| Suelo de listado igual a 0 | revierte `InvalidPrice` | `packages/contracts/src/HotelNights.sol:308` |
| Tesorería igual a la dirección cero | revierte `ZeroAddress` | `packages/contracts/src/HotelNights.sol:336` |
| El owner transfiere `owner()` creyendo ceder el control | aviso en la confirmación | `apps/web/messages/es.json:624`, `:630` |

## 6. Pruebas y evidencia

- `apps/web/src/components/admin/adminTxError.test.ts:13` y `:17`: `NoFunds` y `EnforcedPause` se
  mapean a su clave; `:21`: el motivo se detecta aunque venga anidado en `cause`.
- `apps/web/src/components/admin/admin-shell.test.ts:52`: el grupo Sistemas no abre ninguna sección
  del acordeón; `:74`: las migas resuelven `/admin/sistemas/ajustes`.
- `packages/shared/src/architecture-guardian.test.ts` y
  `apps/web/src/lib/wallet-menu-items.test.ts:69` cubren la coherencia de navegación del back-office.
- **No cubierto:** no hay prueba de componente para `SystemContractState`, `AdminRoles` ni
  `AdminPause` (lecturas, formularios, `TxModal` y refresco tras confirmar), ni prueba end-to-end
  que firme `pause()` contra el contrato y compruebe que el estado pasa a «en pausa».

## 7. Pendiente de confirmar

- El Gherkin exige que al confirmar «Pausar» «se firma `pause()` y el estado mostrado pasa a en
  pausa» (`RepoTecnico/incremento_v3/casos_uso_incremento.md:157`). El código firma
  (`apps/web/src/components/admin/AdminPause.tsx:59`) y refresca al confirmar (`:45`), pero no hay
  prueba automática que lo verifique contra una cadena.
- El título del CU incluye «royalty» (`RepoTecnico/Manuales/05-casos-de-uso/00-BRIEF-equipo-manuales.md:60`),
  pero **la página de Contratos no monta ningún panel de royalty**: solo estado, roles y pausa
  (`apps/web/src/app/admin/sistemas/contratos/page.tsx:20`–`:22`). El royalty sigue siendo inmutable
  por construcción (`apps/web/src/components/admin/AdminRoyalty.tsx:6`–`:12`), así que no hay nada
  que gobernar; queda por confirmar si el título del CU debería decirlo.
- El estado sí **muestra** `minListingPrice` y `treasury`
  (`apps/web/src/components/admin/system/SystemContractState.tsx:19`, `:20`), pero **no hay ningún
  control de UI que llame a `setMinListingPrice` ni a `setTreasury`** en toda la aplicación: grepear
  esos nombres solo los encuentra en el ABI
  (`packages/shared/src/abi/hotel-nights.ts:826`, `:839`). No se puede cambiar el suelo ni la
  tesorería desde el back-office; no está confirmado si es intencionado.
- El bloque `AdminRoles` se reutiliza tal cual desde el antiguo `/admin/roles`
  (`apps/web/src/components/admin/AdminRoles.tsx:37`). La página `admin/roles` no se ha revisado en
  este CU, así que no se confirma si sigue siendo un segundo punto de entrada al mismo panel.
- `acceptOwnership` no pasa por confirmación explícita
  (`apps/web/src/components/admin/AdminRoles.tsx:251`), a diferencia de `transferOwnership` (`:108`).
  No hay criterio que fije si aceptar la titularidad debe confirmarse.
