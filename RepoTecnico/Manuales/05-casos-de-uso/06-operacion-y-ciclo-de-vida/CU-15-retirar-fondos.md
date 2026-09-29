# CU-15 · Pasar el dinero recaudado a la cuenta del hotel — Manual técnico

> Bloque 6 · Operación y ciclo de vida · Actor: TREASURER_ROLE · Requisitos: RNF-15, RNF-13

## 1. Ficha y trazabilidad

- **Objetivo.** Transferir a la dirección de tesorería el **saldo residual** del contrato: todo el
  ETH que no esté reservado para pagar a vendedores de reventa.
- **Actor primario.** Cuenta con `TREASURER_ROLE` (`packages/contracts/src/HotelNights.sol:60`). En
  producción debe ser un multisig (RNF-13), aunque el código solo ve una dirección.
- **Trazabilidad.** RNF-15, RNF-13 y **Decisión 20** (separación de poderes): retirar fondos no lo
  hace el `DEFAULT_ADMIN`, sino un rol distinto (`docs/CASOS-DE-USO.md:831`).
- **Precondición.** Hay saldo retirable y la cuenta tiene `TREASURER_ROLE`.
- **Disparador.** El responsable pulsa «Retirar a tesorería» en `/admin/fondos`.
- **Postcondición.** El ETH residual llega a `treasury` y se emite `Withdrawn`; los pagos pendientes
  de reventa siguen intactos en el contrato.
- **Dónde vive.** UI `/admin/fondos` (`apps/web/src/app/admin/fondos/page.tsx:8`); contrato
  `withdraw` (`HotelNights.sol:324`); estado pendiente en `_pending` / `_totalPending`
  (`HotelNights.sol:107`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. **Entrada al panel.** `/admin/fondos` monta `AdminPanel` con `requiredRole="TREASURER_ROLE"`
   (`apps/web/src/app/admin/fondos/page.tsx:11`). Es gating de UX; el contrato manda
   (`apps/web/src/components/admin/AdminPanel.tsx:26`).
2. **Lectura del estado.** El componente lee el balance bruto del contrato con `useBalance`
   (`apps/web/src/components/admin/AdminFunds.tsx:34`), la dirección destino con `treasury()`
   (`AdminFunds.tsx:35`) y lo reservado con `totalPending()` (`AdminFunds.tsx:40`).
3. **Cálculo del residual.** `withdrawableWei = balance − totalPending` (`AdminFunds.tsx:61`); si es
   0, el botón se deshabilita (`AdminFunds.tsx:67`, `:135`) para no provocar un revert `NoFunds`.
4. **Confirmación explícita.** Pulsar «Retirar» abre el `TxModal` en fase `review`
   (`AdminFunds.tsx:78`), que muestra el importe retirable (`AdminFunds.tsx:156`). Al confirmar se
   envía `send("withdraw", [])` (`AdminFunds.tsx:86`).
5. **Escritura con wagmi.** `useAdminWrite` firma `withdraw` contra `contractAddress`
   (`apps/web/src/components/admin/useAdminWrite.ts:33`) y espera el recibo
   (`useAdminWrite.ts:31`).
6. **Ejecución on-chain.** `withdraw` exige `TREASURER_ROLE` y `nonReentrant`
   (`HotelNights.sol:324`), calcula `address(this).balance - _totalPending`
   (`HotelNights.sol:326`), revierte con `NoFunds` si es 0 (`HotelNights.sol:327`), envía el importe
   a `treasury` (`HotelNights.sol:329`), revierte `EthTransferFailed` si el receptor falla
   (`HotelNights.sol:330`) y emite `Withdrawn(treasury, amount)` (`HotelNights.sol:331`).
7. **Refresco.** Tras confirmar, se refrescan balance y pendiente (`AdminFunds.tsx:71`).

### 2.2 Validaciones

- Rol: `onlyRole(TREASURER_ROLE)` (`HotelNights.sol:324`). Sin él, `AccessControlUnauthorizedAccount`.
- Hay fondos: `amount == 0 → NoFunds` (`HotelNights.sol:327`). En UI se anticipa deshabilitando el
  botón (`AdminFunds.tsx:135`) y avisando (`AdminFunds.tsx:128`).
- Reentrada: `nonReentrant` (`HotelNights.sol:324`). Probado en
  `packages/contracts/test/HotelNights.admin.t.sol:164`.
- **La pausa NO bloquea la retirada.** `withdraw` no lleva `whenNotPaused`; el panel lo dice de forma
  informativa y no la bloquea (`AdminFunds.tsx:122`). Es una decisión deliberada de remediación
  (`test_PauseAllowsWithdrawAndRoleManagement`, `HotelNights.admin.t.sol:98`).
- El receptor `treasury` debe poder recibir ETH; un contrato que revierta en `receive` provoca
  `EthTransferFailed` (`HotelNights.sol:330`).

### 2.3 Efectos on-chain / persistencia

- Transferencia de ETH del contrato a `treasury` y evento `Withdrawn`
  (`packages/contracts/src/IHotelNights.sol:39`).
- **No** se toca `_pending`: los fondos de reventas siguen reservados a sus dueños
  (`HotelNights.sol:107`). La prueba `test_WithdrawProtectsPullFunds`
  (`HotelNights.admin.t.sol:145`) verifica que solo sale el residual.
- Los vendedores cobran lo suyo aparte con `claim()` (`HotelNights.sol:270`), que también revierte
  `NoFunds` si no tienen saldo (`HotelNights.sol:272`).
- No hay persistencia en base de datos en este CU: el estado es puramente on-chain.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Ubicación |
|----------|-----------|
| `withdraw()` | `packages/contracts/src/HotelNights.sol:324` |
| `treasury()` (vista) | variable pública en `packages/contracts/src/HotelNights.sol:86` |
| `totalPending()` (vista) | `packages/contracts/src/HotelNights.sol:439` (declarada en `IHotelNights.sol:153`) |
| `claim()` de un vendedor | `packages/contracts/src/HotelNights.sol:270` |
| Lectura de balance/pendiente en UI | `apps/web/src/components/admin/AdminFunds.tsx:34`, `:40` |
| Envío de la retirada | `apps/web/src/components/admin/AdminFunds.tsx:86` |

No existe endpoint HTTP para retirar: la transacción se firma en el navegador. `setTreasury` (que
cambia el destino) es de `DEFAULT_ADMIN_ROLE` (`HotelNights.sol:335`) y pertenece a CU-16.

### 4.2 Eventos y errores canónicos

- Evento `Withdrawn(address indexed treasury, uint256 amount)` —
  `packages/contracts/src/IHotelNights.sol:39`; `TreasuryUpdated` se emite al cambiar destino
  (`HotelNights.sol:341`).
- Errores: `NoFunds()` (`IHotelNights.sol:89`), `EthTransferFailed()`
  (`HotelNights.sol:330`), `ReentrancyGuardReentrantCall` (OpenZeppelin) y
  `AccessControlUnauthorizedAccount` (`HotelNights.sol:324`).
- Mapeo de error a mensaje en UI: `NoFunds → noFunds`
  (`apps/web/src/components/admin/adminTxError.ts:39`, `:51`).

### 4.3 Estructuras de datos y almacenamiento

- `mapping(address => uint256) _pending` — pagos pull por cuenta (ADR-15), `HotelNights.sol:107`.
- `uint256 _totalPending` — suma de lo reservado; es lo que protege `withdraw`
  (`HotelNights.sol:108`).
- `treasury` — dirección destino, fijada en el constructor (`HotelNights.sol:126`).
- `_credit` acredita al vendedor y al receptor del royalty en la reventa
  (`HotelNights.sol:259`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Sin `TREASURER_ROLE` | `AccessControlUnauthorizedAccount` | `HotelNights.sol:324` |
| Residual 0 (todo reservado) | `NoFunds` | `HotelNights.sol:327` |
| Reentrada del receptor | revert de `nonReentrant` → `EthTransferFailed` | `HotelNights.sol:324`, `:330` |
| `treasury` rechaza el ETH | `EthTransferFailed` | `HotelNights.sol:330` |
| Botón pulsado sin residual | deshabilitado en UI | `AdminFunds.tsx:135` |
| Pausa activa | informativa, la retirada sigue permitida | `AdminFunds.tsx:122`, `HotelNights.sol:324` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.admin.t.sol`: `test_WithdrawResidualToTreasury:119`,
  `test_WithdrawNoFundsReverts:128`, `test_WithdrawRequiresRole:133`,
  `test_WithdrawProtectsPullFunds:145`, `test_WithdrawReentrancyIsBlocked:164`.
- Pausa y remediación: `test_PauseAllowsWithdrawAndRoleManagement` (`HotelNights.admin.t.sol:98`).
- UI: `apps/web/src/components/admin/adminTxError.test.ts:13` (`NoFunds`) y
  `apps/web/src/lib/paused-guardian.test.ts:101` (la retirada no se bloquea por pausa).
- **No cubierto:** no hay test de componente que monte `AdminFunds.tsx` ni test que verifique el
  cálculo `balance − totalPending` de la vista.

## 7. Pendiente de confirmar

- RNF-13 exige multisig en producción (`docs/CASOS-DE-USO.md:827`), pero en el código `treasury` es
  una única dirección (`HotelNights.sol:126`): el multisig es una decisión de despliegue, no algo que
  el contrato garantice.
- La interfaz muestra el **balance bruto** y calcula el residual en cliente; el propio texto de la UI
  reconoce que «el total reservado no es un valor único on-chain» (`apps/web/messages/es.json:568`).
  Conviene confirmar si se espera un getter de residual retirable.
- No se ha localizado pantalla de histórico de retiradas (solo el evento `Withdrawn`).
