# CU-16 · Dar de alta a quien puede tocar el sistema (roles y propiedad) — Manual técnico

> Bloque 1 · Iniciación · Actor: DEFAULT_ADMIN · Requisitos: RF-06, RNF-13, Decisión 20

## 1. Ficha y trazabilidad

- **Objetivo.** Conceder y revocar los roles de `AccessControl` del contrato y ejecutar el relevo
  de la propiedad en dos pasos, dejando el gobierno del sistema en la cuenta correcta.
- **Actor primario.** Cuenta con `DEFAULT_ADMIN_ROLE` (el «super-admin real»). **Secundarios:** el
  destinatario de un rol, el nuevo titular de la propiedad y el EOA desplegador durante el bootstrap.
- **Requisitos que cubre.** RF-06 (gestión de roles) y RNF-13 (autorización por rol); decisión de
  diseño Decisión 20 / ADR-06 (`AccessControl`).
- **Precondición.** La cuenta que firma posee `DEFAULT_ADMIN_ROLE`; en el bootstrap lo tiene el EOA
  desplegador y después el `admin` definitivo.
- **Disparador.** Alta o baja de un operador, o relevo del owner.
- **Postcondición.** La cuenta destinataria pasa a tener (o pierde) el rol on-chain; el evento
  `RoleGranted`/`RoleRevoked` queda registrado. En la propiedad, el contrato queda con un
  `pendingOwner` a la espera de aceptación.
- **Dónde vive.**
  - UI: `apps/web/src/app/admin/roles/page.tsx:8` (ruta `/admin/roles`) y
    `apps/web/src/components/admin/AdminRoles.tsx:44`.
  - Contrato: `packages/contracts/src/HotelNights.sol:56` (roles), `:116` (constructor) y la API
    heredada de `AccessControl` y `Ownable2Step` (`:46`).
  - Bootstrap de despliegue: `packages/contracts/src/HotelNightsBootstrap.sol:14` y
    `packages/contracts/script/Deploy.s.sol:105`.
  - No hay endpoint propio de API ni worker implicado: la escritura va directa del navegador al
    contrato con wagmi (`apps/web/src/components/admin/useAdminWrite.ts:33`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. El operador abre `/admin/roles`. El layout comprueba la sesión de aplicación antes de pintar
   (`apps/web/src/app/admin/layout.tsx:22`); sin sesión válida aparece la pantalla de acceso.
2. El panel se declara gateado por `DEFAULT_ADMIN_ROLE` (`apps/web/src/app/admin/roles/page.tsx:11`).
   El gating de UI es solo UX: si la sesión no tiene el rol, `AdminPanel` muestra un aviso
   (`apps/web/src/components/admin/AdminPanel.tsx:26`).
3. El operador elige el rol en el desplegable (los 6 roles de `ALL_ROLE_NAMES`,
   `packages/shared/src/domain/roles.ts:40`) y escribe la cuenta `0x…`
   (`apps/web/src/components/admin/AdminRoles.tsx:147`).
4. **Conceder** no es destructivo y firma directo: `send("grantRole", [ROLES[roleName], account])`
   (`AdminRoles.tsx:94`). **Revocar** exige confirmación explícita en el `TxModal`
   (`AdminRoles.tsx:101` y `:114`), igual que `transferOwnership` (`:108`).
5. La escritura se envía al contrato con el ABI compartido y `contractAddress`
   (`apps/web/src/components/admin/useAdminWrite.ts:35`). El contrato comprueba el rol y emite el
   evento de AccessControl; el estado de la transacción se sigue con `deriveTxStatus`
   (`useAdminWrite.ts:42`).
6. **Ceder el control real.** La UI separa «Super-admin real (control on-chain)» de «Propiedad
   (informativa)» (`AdminRoles.tsx:129` y `:199`; textos en `apps/web/messages/es.json:619` y `:621`).
   El relevo real es conceder `DEFAULT_ADMIN_ROLE` al nuevo responsable y que el antiguo renuncie.
7. **Relevo de propiedad (informativo).** Con el formulario de transferencia se llama
   `transferOwnership(account)` (`AdminRoles.tsx:117`); el designado acepta con
   `acceptOwnership()` (`AdminRoles.tsx:251`). La UI relee `owner()` y `pendingOwner()` al confirmar
   (`AdminRoles.tsx:47`, `:52` y `:74`).

### 2.2 Validaciones

- **Formato de dirección.** La cuenta debe superar `isAddress` antes de firmar; si no, se muestra el
  error del formulario sin enviar nada (`AdminRoles.tsx:92`, `:100` y `:107`). Los errores de roles y
  de propiedad están separados (`AdminRoles.tsx:63`).
- **Autorización on-chain.** Solo quien tiene `DEFAULT_ADMIN_ROLE` puede `grantRole`/`revokeRole`;
  el resto revierte con `AccessControlUnauthorizedAccount`
  (`packages/contracts/test/HotelNights.roles.t.sol:65`).
- **Propiedad en dos pasos.** `acceptOwnership` solo lo puede ejecutar la cuenta designada
  (`packages/contracts/test/HotelNights.ownership.t.sol:41`); `transferOwnership` solo el owner
  actual (`HotelNights.ownership.t.sol:50`).
- **Guard de pausa.** Las funciones de gobierno de roles siguen disponibles con el contrato pausado
  (`packages/contracts/test/HotelNights.admin.t.sol:98`).

### 2.3 Efectos on-chain / persistencia

- `grantRole`/`revokeRole` actualizan la tabla de `AccessControl` y emiten `RoleGranted`/`RoleRevoked`
  (eventos de OpenZeppelin, no declarados en `IHotelNights.sol`).
- `transferOwnership` deja `pendingOwner` y emite `OwnershipTransferStarted`; `acceptOwnership`
  fija `owner` y emite `OwnershipTransferred`.
- Hallazgo de diseño (MAJOR#1, `HotelNights.sol:34`): **ninguna función de negocio usa
  `onlyOwner`**. Transferir la propiedad **no** cede el control real; el test lo fija en
  `HotelNights.ownership.t.sol:81` y el camino correcto en `:107`.
- No hay persistencia en base de datos en este CU: todo el efecto es on-chain.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `grantRole(bytes32,address)` / `revokeRole(bytes32,address)` | `HotelNights.sol` vía `AccessControl` (`:50`) | Exigen `DEFAULT_ADMIN_ROLE` |
| `renounceRole(bytes32,address)` | idem | Usado en el handover real y en el deploy (`Deploy.s.sol:130`) |
| `transferOwnership(address)` / `acceptOwnership()` | `Ownable2Step` (`HotelNights.sol:53`) | Dos pasos; informativo |
| `owner()` / `pendingOwner()` | `Ownable2Step` | Lecturas que pinta la UI (`AdminRoles.tsx:47`) |
| `hasRole(bytes32,address)` | `AccessControl` | Fuente de la verdad de autorización |
| `HotelNightsBootstrap.grantRolesTo` | `HotelNightsBootstrap.sol:14` | Concede los 6 roles de una vez |
| `grantRole` en el deploy | `Deploy.s.sol:106` | Alta de los 5 roles operativos |
| `grantRole`+`renounceRole` del admin | `Deploy.s.sol:129` | Handover del EOA desplegador |

- No hay endpoints HTTP propios de este CU. La gestión de usuarios de la plataforma (contraseña,
  TOTP, alta y baja) vive en `/api/admin/system/users` (`apps/web/src/app/api/admin/system/users/route.ts:44`)
  y corresponde a **CU-42**, no a este manual.

### 4.2 Eventos y errores canónicos

- Emitidos por OpenZeppelin al usar este CU: `RoleGranted`, `RoleRevoked`, `OwnershipTransferStarted`,
  `OwnershipTransferred`.
- Errores: `AccessControlUnauthorizedAccount(account, role)` al firmar sin rol
  (`HotelNights.roles.t.sol:72`) y `OwnableUnauthorizedAccount(account)` en la propiedad
  (`HotelNights.ownership.t.sol:44` y `:52`).
- **No existen** en el código `RoyaltyUpdated` ni `RoyaltyOutOfRange` (ver CU-12):
  `grep` sobre `packages/` y `apps/` no los encuentra.

### 4.3 Estructuras de datos y almacenamiento

- Los 6 roles y sus ids `keccak256("<NOMBRE>")` se declaran una sola vez en
  `packages/shared/src/domain/roles.ts:30`; `DEFAULT_ADMIN_ROLE` es `bytes32(0)` (`:12`).
- El contrato declara las constantes de rol en `HotelNights.sol:56`.
- El rol que controla el acceso **a la aplicación** es otro conjunto: `admin_users.role` admite
  `DEFAULT_ADMIN_ROLE | RECEPTION_ROLE | HOUSEKEEPING | MAINTENANCE`
  (`packages/shared/src/db/migrator.ts:113` y `packages/shared/src/domain/roles.ts:53`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Cuenta sin `DEFAULT_ADMIN_ROLE` concede o revoca | `AccessControlUnauthorizedAccount` | `HotelNights.roles.t.sol:65` |
| Cuenta distinta de la designada acepta la propiedad | `OwnableUnauthorizedAccount` | `HotelNights.ownership.t.sol:41` |
| Quien no es owner inicia la transferencia | `OwnableUnauthorizedAccount` | `HotelNights.ownership.t.sol:50` |
| Dirección mal formada en el formulario | Error de campo, sin transacción | `AdminRoles.tsx:92` |
| Se transfiere la propiedad creyendo ceder el control | Silencio: el nuevo `owner()` no puede administrar | `HotelNights.ownership.t.sol:81` |
| Sesión sin `DEFAULT_ADMIN_ROLE` abre el panel | Aviso de UI (no bloqueo real) | `AdminPanel.tsx:26` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.ownership.t.sol:28` — transferencia en dos pasos;
  `:41` aceptación por cuenta no designada; `:59` grant+revoke; `:68` grant sin admin;
  `:81` la propiedad no mueve el control real; `:107` handover real por `DEFAULT_ADMIN_ROLE`.
- `packages/contracts/test/HotelNights.roles.t.sol:33` — el desplegador arranca como único admin;
  `:40` bootstrap de los 6 roles y revocación del EOA; `:56` ids de rol = `keccak256`; `:65` no-admin
  no puede conceder.
- `packages/contracts/test/HotelNights.admin.t.sol:98` — la pausa no bloquea la gestión de roles.
- `apps/web/src/lib/admin-auth-guardian.test.ts:51` — fija que `/admin/roles` no lee datos en el
  servidor y debe gatear si algún día lo hace.
- **No cubierto:** no hay test de componente para `AdminRoles.tsx` (no existe ningún fichero
  `*.test.tsx` que monte `AdminRoles`); el camino `acceptOwnership` desde la UI no está probado
  de punta a punta.

## 7. Pendiente de confirmar

- **Doble vía de autorización.** El código mezcla dos planos: la sesión de aplicación
  (`admin_users.role`, `packages/shared/src/db/migrator.ts:113`) y los roles on-chain que impone el
  contrato al firmar (`HotelNights.sol:36`). El brief del CU-16 describe el plano on-chain; falta
  confirmar con negocio si el alta de un operador debe crear **siempre** las dos cosas.
- **`owner()` informativo.** `HotelNights.sol:43` dice que «la UI aclara su carácter informativo en
  otra ola de trabajo»; el panel ya lo separa visualmente (`AdminRoles.tsx:199`). Confirmar si la
  propiedad llega a retirarse del producto o se queda como etiqueta.
- **Solapamiento con CU-42.** `/admin/sistemas/usuarios` y `AdminRoles` gestionan cosas distintas
  (cuentas de plataforma vs. roles on-chain). Confirmar el reparto definitivo entre ambos CUs.
- **Sin test de UI.** No hay evidencia automatizada del formulario de roles ni del modal de
  confirmación; conviene decidir si entra en el alcance de pruebas.
