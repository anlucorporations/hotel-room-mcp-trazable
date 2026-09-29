# CU-14 · Parar el sistema en una emergencia y volver a arrancarlo — Manual técnico

> Bloque 6 · Operación y ciclo de vida · Actor: PAUSER · Requisitos: RNF-15, RNF-13

## 1. Ficha y trazabilidad

- **Objetivo.** Congelar las operaciones de riesgo (comprar, revender, mintear, quemar y hacer
  check-in) ante un incidente o mantenimiento, y reanudarlas después.
- **Actor primario.** Cuenta con `PAUSER_ROLE` (`packages/contracts/src/HotelNights.sol:58`).
- **Trazabilidad.** RNF-15 (continuidad/operación) y RNF-13 (gobierno por roles). Alcance de la
  pausa razonado en `docs/CASOS-DE-USO.md:771`.
- **Precondición.** Sesión de back-office con rol PAUSER; sistema activo (o en pausa, para reanudar).
- **Disparador.** Un incidente detectado o una ventana de mantenimiento.
- **Postcondición.** Con el sistema en pausa, las funciones `whenNotPaused` revierten con
  `EnforcedPause`; la retirada de fondos y la gestión de roles siguen disponibles como remediación.
- **Dónde vive.** UI `/admin/pausa` (`apps/web/src/app/admin/pausa/page.tsx:8`); contrato `pause` /
  `unpause` (`HotelNights.sol:314`, `:319`); estado `paused()` de OpenZeppelin `Pausable`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. **Entrada al panel.** `/admin/pausa` monta `AdminPanel` con `requiredRole="PAUSER_ROLE"`
   (`apps/web/src/app/admin/pausa/page.tsx:11`). El gating es de UX; la autoridad es el contrato
   (`apps/web/src/components/admin/AdminPanel.tsx:26`).
2. **Lectura del estado.** `AdminPause` lee `paused()` on-chain
   (`apps/web/src/components/admin/AdminPause.tsx:31`) y muestra «ACTIVO» o «EN PAUSA»
   (`AdminPause.tsx:64`).
3. **Elección de acción.** El botón «Pausar» (variante danger) se deshabilita si ya está en pausa;
   «Reanudar» se deshabilita si no lo está (`AdminPause.tsx:75`, `:84`).
4. **Confirmación explícita.** La acción queda `pending` (`AdminPause.tsx:79`, `:88`) y el `TxModal`
   muestra el aviso correspondiente antes de firmar (`AdminPause.tsx:106`).
5. **Firma.** Al confirmar se envía `send(pending, [])`, es decir `pause` o `unpause`
   (`AdminPause.tsx:59`), por `useAdminWrite` contra `contractAddress`
   (`apps/web/src/components/admin/useAdminWrite.ts:33`).
6. **Ejecución on-chain.** `pause()` exige `PAUSER_ROLE` y llama a `_pause()`
   (`HotelNights.sol:314`); `unpause()` igual con `_unpause()` (`HotelNights.sol:319`). OpenZeppelin
   emite `Paused` / `Unpaused`.
7. **Refresco.** Tras confirmar, se vuelve a leer `paused()` (`AdminPause.tsx:45`).

### 2.2 Validaciones

- Rol: ambas funciones llevan `onlyRole(PAUSER_ROLE)` (`HotelNights.sol:314`, `:319`); sin él,
  `AccessControlUnauthorizedAccount`.
- Estado coherente en UI: no se ofrece pausar dos veces ni reanudar si no está pausado
  (`AdminPause.tsx:78`, `:87`).
- Alcance real de la pausa (funciones con `whenNotPaused`): `mint` (`HotelNights.sol:136`), `buy`
  (`:156`), `markCheckedIn` (`:202`), `buyResale` (`:241`) y `burnExpired` (`:287`).
- **Permitidas durante la pausa** (sin `whenNotPaused`): `list` (`HotelNights.sol:214`), `unlist`
  (`:232`), `claim` (`:270`), `withdraw` (`:324`), `setMinListingPrice` (`:305`), `setTreasury`
  (`:335`) y `registerRoom` (`:346`).
- Vistas de compra: catálogo y reventa leen `paused()` y retiran el botón cuando procede
  (`apps/web/src/lib/paused-guardian.test.ts:35`, `:41`); el aviso distingue «en pausa» de «no se
  pudo comprobar» (`paused-guardian.test.ts:60`). Recepción diagnostica el revert como
  `CONTRATO_EN_PAUSA` (`paused-guardian.test.ts:89`).

### 2.3 Efectos on-chain / persistencia

- Cambia la bandera `_paused` de `Pausable` y se emiten `Paused` / `Unpaused`. No hay escritura en
  base de datos ni cambio de propietarios.
- Las lecturas (catálogo, histórico, dashboard) no se ven afectadas: siguen funcionando.
- El botón de quema en `/admin/caducadas` avisa y se deshabilita si el sistema está en pausa
  (`apps/web/src/components/admin/AdminExpired.tsx:147`, `:173`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Ubicación |
|----------|-----------|
| `pause()` | `packages/contracts/src/HotelNights.sol:314` |
| `unpause()` | `packages/contracts/src/HotelNights.sol:319` |
| `paused()` (vista) | heredada de OpenZeppelin `Pausable`; en el ABI `packages/shared/src/abi/hotel-nights.ts:547` |
| Lectura de `paused()` en UI | `apps/web/src/components/admin/AdminPause.tsx:31` |
| Envío de pausa/reanudación | `apps/web/src/components/admin/AdminPause.tsx:59` |

No existe endpoint HTTP propio de este CU: la firma se hace en el navegador con wagmi.

### 4.2 Eventos y errores canónicos

- Eventos `Paused(address account)` y `Unpaused(address account)` de OpenZeppelin, declarados en el
  ABI (`packages/shared/src/abi/hotel-nights.ts:1262`, `:1532`).
- Error `EnforcedPause()` (OpenZeppelin `Pausable`) en toda función `whenNotPaused`.
- Error `AccessControlUnauthorizedAccount(account, PAUSER_ROLE)` sin rol
  (`HotelNights.sol:314`, `:319`).
- Traducción a mensaje: `EnforcedPause → paused` (`apps/web/src/components/admin/adminTxError.ts:12`,
  `:53`).

### 4.3 Estructuras de datos y almacenamiento

- Bandera `_paused` heredada de `Pausable` (`HotelNights.sol:136` y siguientes la consultan vía
  modificador). No hay almacenamiento propio del CU.
- `contractAddress` como destino único de las escrituras (`apps/web/src/components/admin/useAdminWrite.ts:35`).
- Mensajes en el catálogo i18n `admin`: `pauseTitle`, `pauseActive`, `pausePaused`
  (`apps/web/messages/es.json:558`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Pausar sin `PAUSER_ROLE` | `AccessControlUnauthorizedAccount` | `HotelNights.sol:314` |
| Reanudar sin `PAUSER_ROLE` | `AccessControlUnauthorizedAccount` | `HotelNights.sol:319` |
| Comprar en pausa | `EnforcedPause` | `HotelNights.sol:156` |
| Comprar reventa en pausa | `EnforcedPause` | `HotelNights.sol:241` |
| Mintear en pausa | `EnforcedPause` | `HotelNights.sol:136` |
| Quemar en pausa | `EnforcedPause` | `HotelNights.sol:287` |
| Check-in en pausa | `EnforcedPause` | `HotelNights.sol:202` |
| Retirar fondos en pausa | permitido (remediación) | `HotelNights.sol:324` |
| Listar/retirar reventa en pausa | permitido (no lleva `whenNotPaused`) | `HotelNights.sol:214`, `:232` |
| Revert de pausa en check-in | `CONTRATO_EN_PAUSA` (503) | `paused-guardian.test.ts:89` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.admin.t.sol`: `test_PauseBlocksBuyThenUnpauseRestores:78`,
  `test_PauseBlocksMint:91`, `test_PauseAllowsWithdrawAndRoleManagement:98`,
  `test_PauseRequiresRole:107`.
- `packages/contracts/test/HotelNights.burn.t.sol:174` (`test_BurnBlockedWhenPaused`).
- Guardián de pausa en la web: `apps/web/src/lib/paused-guardian.test.ts:35`, `:41`, `:60`, `:71`,
  `:89`, `:101`.
- Traducción del error: `apps/web/src/components/admin/adminTxError.test.ts:17`
  (`EnforcedPause → paused`).
- **No cubierto:** no hay test de componente que monte `AdminPause.tsx` ni ningún test que verifique
  la reanudación de `Listed`/`buyResale` end-to-end desde la UI.

## 7. Pendiente de confirmar

- **`list` y `unlist` no están pausadas.** Durante una pausa, un propietario puede publicar o retirar
  un listado; solo se bloquea **comprar** la reventa (`buyResale`, `HotelNights.sol:241`). La tabla
  de `docs/CASOS-DE-USO.md:773` habla de «reventa bloqueada», lo que puede leerse como que listar
  también lo está. Conviene aclarar la redacción.
- La fuente `docs/CASOS-DE-USO.md:768` dice que la pausa bloquea «compra y reventa»; el código añade
  `mint`, `markCheckedIn` y `burnExpired` (`HotelNights.sol:136`, `:202`, `:287`).
- No hay evento propio del proyecto ni registro on-chain de **quién** pausó más allá del `account`
  de `Paused` de OpenZeppelin; no se ha localizado panel de histórico de pausas.
- No se ha localizado endpoint ni comprobación que impida pausar con operaciones en vuelo.
