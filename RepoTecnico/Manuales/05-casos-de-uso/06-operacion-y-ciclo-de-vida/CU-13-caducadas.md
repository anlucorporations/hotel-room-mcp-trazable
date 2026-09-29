# CU-13 · Retirar las noches del hotel que ya han caducado — Manual técnico

> Bloque 6 · Operación y ciclo de vida · Actor: BURNER · Requisitos: RF-17

## 1. Ficha y trazabilidad

- **Objetivo.** Identificar las noches del **hotel** cuya fecha ya pasó y que nadie compró, y
  quemarlas (destruir el NFT) en lotes para limpiar el inventario. Las noches de clientes **nunca**
  se queman.
- **Actor primario.** Cuenta con `BURNER_ROLE` (`packages/contracts/src/HotelNights.sol:59`). Actor
  secundario: el **worker** con la hot-wallet `BURNER_WALLET_PRIVATE_KEY`
  (`apps/worker/src/main.ts:290`).
- **Trazabilidad.** RF-17, decisión D-03 (quema programada) y US-09. La conciliación con RNF-10 está
  razonada en `docs/CASOS-DE-USO.md:753`.
- **Precondición.** Existen noches minteadas, no vendidas (`_soldOnce == false`) y con fecha anterior
  a hoy (`packages/contracts/src/HotelNights.sol:501`).
- **Disparador.** La fecha pasa (caducidad lógica automática) o un operador pulsa «Quemar lote» en el
  panel.
- **Postcondición.** Los tokens quemados dejan de existir (`ownerOf` revierte) y el índice off-chain
  los marca como `BURNED` (`packages/shared/src/burner/service.ts:180`).
- **Dónde vive.** UI `/admin/caducadas` (`apps/web/src/app/admin/caducadas/page.tsx:8`); contrato
  `burnExpired` (`packages/contracts/src/HotelNights.sol:283`); worker
  `apps/worker/src/burn-scheduler.ts` + `packages/shared/src/burner/service.ts`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. **Caducidad lógica (automática).** `_isExpired` compara los 8 dígitos bajos del `tokenId` (la
   fecha `AAAAMMDD`) con el «hoy» del contrato (`HotelNights.sol:501`). El `tokenId` se construye
   como `room * ROOM_MULTIPLIER + fecha` (`HotelNights.sol:144`, multiplicador `100_000_000` en
   `HotelNights.sol:77`).
2. **La fecha pasada bloquea compra y reventa.** `buy` revierte `NightExpired`
   (`HotelNights.sol:164`), `list` también (`HotelNights.sol:225`) y `buyResale` igual
   (`HotelNights.sol:247`).
3. **Panel del BURNER.** `/admin/caducadas` monta `AdminPanel` con `requiredRole="BURNER_ROLE"`
   (`apps/web/src/app/admin/caducadas/page.tsx:11`), que es solo gating de UX: la autoridad es el
   contrato (`apps/web/src/components/admin/AdminPanel.tsx:26`).
4. **Escaneo de candidatas.** El botón «Escanear caducadas» activa `useExpiredNights`
   (`apps/web/src/components/admin/AdminExpired.tsx:55`), que lee los eventos `Mint`
   (`useExpiredNights.ts:34`) y `Sale` (`useExpiredNights.ts:37`) por páginas de
   `GETLOGS_MAX_RANGE` (`useExpiredNights.ts:41`), excluye las vendidas
   (`useExpiredNights.ts:98`) y confirma `isExpired` on-chain token a token
   (`useExpiredNights.ts:68`).
5. **Construcción del lote.** Si hay `tokenIds` manuales se usan esos; si no, las candidatas
   escaneadas hasta el máximo (`AdminExpired.tsx:73`). El máximo se lee de `BURN_BATCH_MAX`
   (`AdminExpired.tsx:42`) con respaldo local `50` (`AdminExpired.tsx:22`).
6. **Validación en cliente.** Lote vacío → error `expiredEmptyBatch` (`AdminExpired.tsx:94`); lote
   mayor que el máximo → `expiredTooLarge` (`AdminExpired.tsx:95`).
7. **Confirmación explícita.** `TxModal` muestra recuento y lista de `tokenIds` antes de firmar
   (`AdminExpired.tsx:188`); al confirmar se envía `send("burnExpired", [ids])`
   (`AdminExpired.tsx:100`) por `useAdminWrite` (`apps/web/src/components/admin/useAdminWrite.ts:33`).
8. **Quema on-chain.** `burnExpired` exige `BURNER_ROLE` (`HotelNights.sol:286`), rechaza lotes
   mayores que `BURN_BATCH_MAX = 50` (`HotelNights.sol:63`, `:290`), recorre el lote, exige que el
   token no esté vendido (`HotelNights.sol:294`) y esté caducado (`HotelNights.sol:295`), borra el
   listado (`HotelNights.sol:297`), quema (`HotelNights.sol:298`) y emite `Burn`
   (`HotelNights.sol:299`).
9. **Quema programada del worker.** `startBurnScheduler` toma un cerrojo por día natural de Madrid
   `hotel:burn:day:<día>` que no se libera si el ciclo se completa
   (`apps/worker/src/burn-scheduler.ts:117`, `:151`). Se ejecuta a las 12:00 local
   (`burn-scheduler.ts:104`, `:168`), con la **hora de la cadena**
   (`burn-scheduler.ts:132`).
10. **Ciclo de quema.** `BurnerService.executeScheduledBurn` comprueba el saldo de la hot-wallet
    (`packages/shared/src/burner/service.ts:118`), obtiene las caducadas no vendidas
    (`service.ts:138`), trocea por `burnBatchMax` (`service.ts:167`), simula cada lote y reintenta
    token a token (`service.ts:250`), firma y espera recibo (`service.ts:298`).

### 2.2 Validaciones

- Rol `BURNER_ROLE` en el contrato (`HotelNights.sol:286`); gating de UX `requiredRole` en
  `AdminPanel` (`AdminPanel.tsx:26`).
- `whenNotPaused` en `burnExpired` (`HotelNights.sol:287`); el panel lee `paused()` y deshabilita el
  botón avisando (`AdminExpired.tsx:48`, `:147`, `:173`).
- Tamaño de lote ≤ `BURN_BATCH_MAX` (`HotelNights.sol:290`) y validación previa en el formulario
  (`AdminExpired.tsx:95`).
- Cada token: no vendido (`AlreadySold`, `HotelNights.sol:294`) y caducado (`NotExpired`,
  `HotelNights.sol:295`). La atomicidad del lote está probada en
  `packages/contracts/test/HotelNights.burn.t.sol:111`.
- Escaneo: si el bloque de despliegue es posterior al head se lanza `SCAN_CONFIG_INVALID`
  (`useExpiredNights.ts:91`); si un `isExpired` falla por red, el resultado se marca `partial`
  (`useExpiredNights.ts:113`) y el panel lo avisa (`AdminExpired.tsx:130`).

### 2.3 Efectos on-chain / persistencia

- `_burn(tokenId)` destruye el NFT y el evento `Burn(tokenId)` queda en el recibo
  (`packages/contracts/src/IHotelNights.sol:38`).
- Off-chain, `BurnerService` marca `BURNED` **solo** los tokens que el recibo confirma
  (`service.ts:180`), reconcilia los descartes que ya no existen on-chain (`service.ts:188`) y
  encola el aviso `BURN_EXECUTED` (`service.ts:198`).
- Sin clave de quema configurada, el planificador no arranca y lo advierte
  (`apps/worker/src/main.ts:290`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Ubicación |
|----------|-----------|
| `burnExpired(uint256[])` | `packages/contracts/src/HotelNights.sol:283` |
| `burnBatchMax()` (getter) | `packages/contracts/src/IHotelNights.sol:210` |
| `isExpired(uint256)` (vista) | `packages/contracts/src/IHotelNights.sol:124` |
| Lectura `BURN_BATCH_MAX` | `apps/web/src/components/admin/AdminExpired.tsx:42` |
| Envío de la quema | `apps/web/src/components/admin/AdminExpired.tsx:100` |
| Quema programada | `packages/shared/src/burner/service.ts:101` |

No existe endpoint HTTP propio de este CU: la escritura se firma desde el navegador con wagmi.

### 4.2 Eventos y errores canónicos

- Evento `Burn(uint256 indexed tokenId)` — `packages/contracts/src/IHotelNights.sol:38`.
- Errores: `NightExpired` (`IHotelNights.sol:67`), `NotExpired` (`:86`), `AlreadySold` (`:87`),
  `BatchTooLarge(uint256 size, uint256 max)` (`:88`).
- `EnforcedPause` (OpenZeppelin `Pausable`) si el sistema está pausado (`HotelNights.sol:287`).
- `AccessControlUnauthorizedAccount` si falta `BURNER_ROLE` (`HotelNights.sol:286`).

### 4.3 Estructuras de datos y almacenamiento

- `Mapping _listings` (se borra al quemar) — `HotelNights.sol:106`, `:297`.
- `_soldOnce` decide si la noche es del hotel o de un cliente — `HotelNights.sol:294`.
- Índice off-chain: `nftsRepo.updateNFTStatus(id, "BURNED")` (`service.ts:180`).
- Cerrojos Redis: `hotel:burn:day:<día>` (`burn-scheduler.ts:118`) y `hotel:burn:cycle:<día>`
  (`burn-scheduler.ts:137`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Comprar una noche caducada | `NightExpired` | `HotelNights.sol:164` |
| Listar una noche caducada | `NightExpired` | `HotelNights.sol:225` |
| Comprar reventa caducada | `NightExpired` | `HotelNights.sol:247` |
| Quemar sin rol BURNER | `AccessControlUnauthorizedAccount` | `HotelNights.sol:286` |
| Lote > 50 tokens | `BatchTooLarge(size, 50)` | `HotelNights.sol:290` |
| Token vendido en el lote | `AlreadySold` | `HotelNights.sol:294` |
| Token no caducado en el lote | `NotExpired` | `HotelNights.sol:295` |
| Quemar con el sistema en pausa | `EnforcedPause` | `HotelNights.sol:287` |
| Lote vacío / demasiado grande en UI | `expiredEmptyBatch` / `expiredTooLarge` | `AdminExpired.tsx:94`, `:95` |
| Escaneo con config inválida | `SCAN_CONFIG_INVALID` | `useExpiredNights.ts:91` |
| Saldo insuficiente de la hot-wallet | `INSUFFICIENT_GAS` + alerta | `service.ts:120` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.burn.t.sol`: quema de una caducada (`:40`), `NotExpired`
  (`:56`), `AlreadySold` (`:64`), lote de tres (`:84`), rollback atómico (`:111`), listado inactivo
  (`:132`), `BatchTooLarge` (`:152`), rol obligatorio (`:161`) y bloqueo en pausa (`:174`).
- Caducidad bloqueando operaciones: `HotelNights.buy.t.sol:110` (`test_BuyExpiredReverts`),
  `HotelNights.resale.t.sol:220` (`test_ListExpiredReverts`) y `:401`
  (`test_BuyResaleExpiredReverts`).
- Worker: `apps/worker/src/burn-scheduler.test.ts:68` (cerrojo diario), `:91` (reintento),
  `:118` (zona horaria) y `:134` (hora de la cadena).
- **No cubierto:** no hay test de componente para `AdminExpired.tsx` ni para `useExpiredNights.ts`;
  el escaneo por eventos solo tiene evidencia indirecta.

## 7. Pendiente de confirmar

- La fuente `docs/CASOS-DE-USO.md:710` llama `burn` a la operación; el código real la expone como
  **`burnExpired`** (`HotelNights.sol:283`).
- La fuente cita `TZ_REF` como referencia horaria. El contrato usa un umbral **UTC** derivado de
  `block.timestamp`; la fecha civil en `Europe/Madrid` es off-chain por ADR-08
  (`packages/contracts/src/libraries/DateLib.sol:8`). La caducidad puede desviarse unas horas
  respecto a Madrid.
- `BurnerService` calcula el «hoy» con `getUTCFullYear/Month/Date`
  (`packages/shared/src/burner/service.ts:369`), no con la zona del hotel; el planificador le pasa la
  hora de la cadena, así que el desfase depende del bloque.
- No se ha localizado una pantalla ni endpoint que liste el histórico de quemas para el operador.
