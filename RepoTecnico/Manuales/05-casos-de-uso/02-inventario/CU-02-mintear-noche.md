# CU-02 · Poner una noche a la venta (crear la ficha digital) — Manual técnico

> Bloque 2 · Inventario · Actor: MINTER · Requisitos: RF-01, RF-05, RF-18a, RF-18b, RF-19, RNF-14

## 1. Ficha y trazabilidad

- **Objetivo.** Crear el NFT de una noche (habitación × fecha) en el inventario del hotel, con su
  precio de venta primaria y su `tokenURI`, dejándola `DISPONIBLE` en el catálogo.
- **Actor primario.** El operador con rol MINTER. **Secundarios:** el admin de plataforma que
  autoriza la ruta de API, la wallet que firma la transacción y el worker que confirma el anclaje.
- **Requisitos que cubre.** RF-01 (alta de noche), RF-05 (precio de venta), RF-18a (habitación del
  maestro), RF-18b (fecha civil), RF-19 (`tokenURI`), RNF-14 (trazabilidad del minteo).
- **Precondición.** Sesión de back-office válida con el rol que exige cada capa (§2.2 y §7);
  catálogo maestro cargado (50 habitaciones, `packages/shared/src/domain/room-master.ts:13`); las
  imágenes de los tres tipos pineadas en IPFS (`packages/shared/src/domain/ipfs.ts:21`).
- **Disparador.** El operador rellena el formulario de `/admin/mint` y confirma su TOTP.
- **Postcondición.** Existe el NFT `tokenId = room·10^8 + AAAAMMDD` propiedad de la tesorería
  (`packages/contracts/src/HotelNights.sol:148`), se ha emitido `Mint` (`:151`) y hay una fila en
  `nfts` con estado `AVAILABLE` (`packages/shared/src/db/schema.sql:15`).
- **Dónde vive.**
  - UI: `apps/web/src/app/admin/mint/page.tsx:8` (ruta `/admin/mint`) y
    `apps/web/src/components/admin/AdminMint.tsx:44`.
  - Hook de firma: `apps/web/src/components/admin/useMintNight.ts:17` y `:21`.
  - Endpoint: `apps/web/src/app/api/admin/mint/route.ts:54` (`POST /api/admin/mint`).
  - Contrato: `packages/contracts/src/HotelNights.sol:132`; validación de fecha en
    `packages/contracts/src/libraries/DateLib.sol:42`.
  - Derivación del id: `packages/shared/src/domain/token-id.ts:63` (espejo on-chain en
    `HotelNights.sol:144`).
  - Worker: ingesta del evento `Mint` en `apps/worker/src/chain-source.ts:144` y
    `packages/shared/src/events/listener.ts:288`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El operador abre `/admin/mint`. El panel se declara gateado por `MINTER_ROLE`
   (`apps/web/src/app/admin/mint/page.tsx:11`); si la sesión no tiene el rol, `AdminPanel` muestra
   un aviso en lugar de la acción (`apps/web/src/components/admin/AdminPanel.tsx:26`).
2. El formulario pide habitación, fecha y precio en ETH (`AdminMint.tsx:199`, `:214` y `:246`), con un
   modo de lote de 1 a 50 noches (`:227` y `:112`). Antes de ofrecer la acción se lee `paused()` del
   contrato (`:69`): en pausa el botón queda deshabilitado (`:274`) con su aviso (`:264`).
3. Al enviar, `handleFormSubmit` valida habitación con `isRoomInMaster` (`:87`), fecha con
   `isValidCalendarDate` (`:88` y `:34`) y tipo con `roomTypeOf` (`:90`); si algo falla, muestra el
   error de campo y no se abre nada más (`:87`–`:91`).
4. Con el formulario válido se abre el modal de re-confirmación MFA y se exige un TOTP de 6 dígitos
   (`AdminMint.tsx:96` y `:101`).
5. `executeMintWithMfa` construye los items (habitación, tipo del maestro, fecha, precio en wei)
   (`:110`–`:141`) y llama a `POST /api/admin/mint?allowUnanchored=true` con `confirmTotpCode` en el
   cuerpo (`:147`–`:153`).
6. La ruta comprueba sesión y rol (`apps/web/src/app/api/admin/mint/route.ts:55`), verifica el TOTP
   contra la semilla cifrada del operador (`:93`), acota el lote a 50 (`:102`), valida el vocabulario
   del tipo (`:115`) y descarta las noches retenidas por reservas activas (`:135`).
7. Persiste cada noche con `upsertNFT`: `token_id` como `roomNumber` + `AAAAMMDD` concatenados
   (`route.ts:183`), estado `AVAILABLE`, propietario inicial el del hotel y secreto de check-in
   cifrado (`:184`–`:202`).
8. Si los items no traen `txHashMint` y no se autorizó el pendiente, responde **422**
   `ONCHAIN_ANCHOR_REQUIRED` (`route.ts:156`–`:171`). Con `allowUnanchored=true` la fila queda como
   PENDIENTE DE ANCLAJE con el hash centinela cero (`:199`–`:200`) y responde **202** (`:220`).
9. De vuelta en el navegador, `AdminMint` compone la metadata (`AdminMint.tsx:172`) y firma el
    minteo real con wagmi (`:176` → `useMintNight.ts:22`, `functionName: "mint"`).
10. El contrato ejecuta `mint(uint256 room, uint256 dateYYYYMMDD, uint256 price, string metadataURI)`
    (`HotelNights.sol:132`, exigiendo `MINTER_ROLE` en `:135` y `whenNotPaused` en `:136`): comprueba
    registro de habitación (`:139`), rango de fecha (`:140`), precio (`:141`), fecha pasada (`:142`) y
    unicidad (`:145`); deriva el `tokenId` (`:144`), guarda precio (`:147`), mintea a la tesorería
    (`:148`), fija el `tokenURI` (`:149`) y emite `Mint` (`:151`).
11. El worker lee el evento `Mint` por RPC (`apps/worker/src/chain-source.ts:144`) y reescribe la fila
    con `onChainAnchored: true` y el hash real de la transacción
    (`packages/shared/src/events/listener.ts:288`–`:295`).

### 2.2 Validaciones

- **Habitación en el maestro (off-chain).** `isRoomInMaster` acepta 101–130 y 201–220
  (`packages/shared/src/domain/room-master.ts:32`, rangos en `:13`–`:14`). El tipo se deriva por
  rango: 101–115 simple, 116–130 doble, 201–220 suite (`:22`–`:26`).
- **Fecha de calendario (off-chain).** `isValidCalendarDate` rechaza 30-feb o 29-feb no bisiesto
  (`packages/shared/src/domain/token-id.ts:52`), antes de construir el `tokenId`; el formulario lo
  aplica en `AdminMint.tsx:29`–`:35`.
- **Rango de fecha (off-chain).** `isDateInRange` exige 8 dígitos, mes 1–12 y día 1–31
  (`token-id.ts:40`), la misma regla que el contrato (`HotelNights.sol:140` → `DateLib.sol:42`).
- **Unicidad y precio.** `_ownerOf(tokenId) != address(0)` revierte con `DuplicateNight`
  (`HotelNights.sol:145`) y `price == 0` con `InvalidPrice` (`:141`).
- **Fecha pasada.** Se compara con `_todayYYYYMMDD()` (`HotelNights.sol:142` y `:497`), calculada en
  **UTC** por `DateLib` (`DateLib.sol:15`), no en `Europe/Madrid`.
- **Autorización.** El contrato exige `MINTER_ROLE` (`HotelNights.sol:135`); la ruta de API exige
  `DEFAULT_ADMIN_ROLE` (`route.ts:55`); el panel de UI se gatea por `MINTER_ROLE`
  (`page.tsx:11`). Son tres puertas distintas (§7).
- **Doble control.** El TOTP se valida contra `admin_users.totp_secret_enc` del operador autenticado
  (`route.ts:93`); sin código, **403** `MFA_REQUIRED` (`:75`); código erróneo, **403** `INVALID_MFA`
  (`:93`).

### 2.3 Efectos on-chain / persistencia

- El NFT se mintea a la **tesorería** (inventario del hotel, ADR-16): `_mint(treasury, tokenId)` en
  `HotelNights.sol:148`; el test lo confirma en `packages/contracts/test/HotelNights.mint.t.sol:48`.
- Se fija `_price[tokenId]` (`HotelNights.sol:147`) y el `tokenURI` en el mismo bloque del minteo
  (`:149`), tal y como exige la interfaz (`packages/contracts/src/IHotelNights.sol:99`).
- Evento `Mint(tokenId, room, dateYYYYMMDD, roomType, price)` declarado en
  `packages/contracts/src/IHotelNights.sol:21` y emitido en `HotelNights.sol:151`.
- Persistencia off-chain en la tabla `nfts`: `token_id` (PK `VARCHAR(66)`), `room_number`,
  `room_type`, `check_in_date`, `base_price_wei`, `status`, `current_owner`, `check_in_secret_enc` y
  `tx_hash_mint` (`packages/shared/src/db/schema.sql:9`–`:22`). La columna `on_chain_anchored` se
  añade por migración (`packages/shared/src/db/migrator.ts:32`).
- El centinela de «sin anclar» es el hash cero (`UNANCHORED_TX_HASH`,
  `packages/shared/src/db/repositories/nfts.repository.ts:39`), nunca un hash inventado
  (`route.ts:199`–`:200`).
- Las filas sin anclar quedan **excluidas del catálogo** hasta que el worker las promueve
  (`route.ts:51`–`:52`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `mint(uint256,uint256,uint256,string)` | `HotelNights.sol:132` | `MINTER_ROLE` + `whenNotPaused`; devuelve `tokenId` |
| `priceOf(uint256)` | `IHotelNights.sol:110` | Precio primario fijado en el minteo |
| `tokenURI(uint256)` | ERC-721 (`HotelNights.sol:149`) | Resoluble desde el bloque del minteo |
| `paused()` | `AdminMint.tsx:69` | Lectura previa para no ofrecer una tx que revertiría |
| `POST /api/admin/mint` | `route.ts:54` | Rol `DEFAULT_ADMIN_ROLE` + TOTP; persiste la fila |
| `isRoomInMaster` / `roomTypeOf` | `room-master.ts:32` y `:37` | Maestro off-chain (50 habitaciones) |
| `isValidCalendarDate` / `encodeTokenId` | `token-id.ts:52` y `:63` | Calendario real y `tokenId` canónico |
| `buildNightMetadata` | `packages/shared/src/domain/ipfs.ts:72` | Metadata ERC-721 sin PII |

### 4.2 Eventos y errores canónicos

- Evento emitido: `Mint` (`IHotelNights.sol:21`).
- Errores del contrato: `RoomNotRegistered(uint256)` (`IHotelNights.sol:55`), `InvalidDate()` (`:65`),
  `InvalidPrice()` (`:64`), `PastDate()` (`:66`), `DuplicateNight(uint256)` (`:53`),
  `AccessControlUnauthorizedAccount` (OpenZeppelin) y `EnforcedPause` (Pausable).
- Errores de la API: `MFA_REQUIRED` y `INVALID_MFA` (403), `BAD_REQUEST` (400),
  `BATCH_SIZE_EXCEEDED` (400), `ONCHAIN_ANCHOR_REQUIRED` (422), `RESERVED_NIGHTS` (409),
  `MINT_FAILED` (500), `UNAUTHORIZED`/`FORBIDDEN` (401/403) — `route.ts:55`–`:230`.
- **Ojo:** el documento fuente escribe `RoomNotInMaster` (`docs/CASOS-DE-USO.md:204`), pero el código
  declara `RoomNotRegistered` (`IHotelNights.sol:55`); el comentario de `room-master.ts:9` conserva el
  nombre antiguo. Ver §7.

### 4.3 Estructuras de datos y almacenamiento

- `tokenId = room · 10^8 + AAAAMMDD` (Decisión 3): `ROOM_MULTIPLIER = 100_000_000`
  (`HotelNights.sol:77`) y `encodeTokenId` (`token-id.ts:63`). Ejemplo: hab. 102, 2026-06-15 →
  `10220260615` (`HotelNights.mint.t.sol:22`).
- El tipo del maestro viaja a la BD en mayúsculas: `RoomTypeDb = "SIMPLE" | "DOBLE" | "SUITE"`
  (`room-master.ts:50` y `:59`); la ruta rechaza cualquier valor fuera de ese vocabulario
  (`route.ts:115`).
- `check_in_secret_enc` se cifra por noche en el servidor (`route.ts:184`–`:185`).
- La metadata se compone con `name`, `description`, `image` (`ipfs://CID` del tipo) y tres atributos
  (`ipfs.ts:72`–`:87`); los CIDs de las tres imágenes están en `ipfs.ts:21`–`:25`.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Habitación fuera del maestro (999) | `RoomNotRegistered(999)` | `HotelNights.sol:139`; test `HotelNights.mint.t.sol:61` |
| Fecha de calendario imposible (2026-02-30) | Error de formulario `invalidDate`, sin tx | `token-id.ts:52` + `AdminMint.tsx:88` |
| Mes 13 / día 0 o 32 | `InvalidDate()` on-chain | `DateLib.sol:42`; test `HotelNights.mint.t.sol:80` |
| Precio 0 | `InvalidPrice()` | `HotelNights.sol:141`; test `:68` |
| Fecha anterior a hoy | `PastDate()` | `HotelNights.sol:142`; test `:74` |
| Noche ya minteada | `DuplicateNight(tokenId)` | `HotelNights.sol:145`; test `:54` |
| Firmante sin `MINTER_ROLE` | `AccessControlUnauthorizedAccount` | `HotelNights.sol:135`; test `:86` |
| Contrato en pausa | `EnforcedPause`; botón deshabilitado | `AdminMint.tsx:274`; `adminTxError.ts:12` |
| Falta el TOTP | 403 `MFA_REQUIRED` | `route.ts:75`; test `admin.test.ts:101` |
| TOTP incorrecto | 403 `INVALID_MFA` | `route.ts:93`; test `admin.test.ts:113` |
| Lote de más de 50 noches | 400 `BATCH_SIZE_EXCEEDED` | `route.ts:102`; test `admin.test.ts:132` |
| Item sin `txHashMint` y sin `allowUnanchored` | 422 `ONCHAIN_ANCHOR_REQUIRED` | `route.ts:160`; test `:145` |
| Todas las noches del lote están reservadas | 409 `RESERVED_NIGHTS` | `route.ts:142`; test `:217` |
| Tipo de habitación fuera de vocabulario | 400 `BAD_REQUEST` | `route.ts:115` |
| El operador rechaza la firma en la wallet | Estado `rejected`, sin cambio on-chain | `adminTxError.ts:56` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.mint.t.sol:40` — minteo correcto (emite `Mint`, dueño
  tesorería, `tokenURI` y precio); `:54` duplicado; `:61` habitación no registrada; `:68` precio
  inválido; `:74` fecha pasada; `:80` mes 13; `:86` falta de rol; `:97` tipo por rango.
- `packages/shared/src/domain/token-id.test.ts:12` — `tokenId` canónico; `:38` rango; `:53` bisiesto;
  `:57` 30-feb; `:63` guardas de `encodeTokenId`.
- `apps/web/src/app/api/admin/admin.test.ts:85` — 401 sin sesión; `:92` 403 sin rol admin; `:101` y
  `:113` TOTP; `:126` lote vacío; `:132` lote > 50; `:145` 422 sin anclaje; `:156` 202 pendiente con
  hash centinela; `:183` 200 anclado; `:202` omisión de reservadas; `:217` 409 todas reservadas.
- **No cubierto:** no hay test de componente para `AdminMint.tsx` ni prueba end-to-end del formulario
  con wallet; el camino «mintear → worker confirma anclaje» tampoco tiene test de integración.

## 7. Pendiente de confirmar

- **Nombre del error de habitación.** El fuente y `room-master.ts:9` dicen `RoomNotInMaster`; el
  contrato declara `RoomNotRegistered` (`IHotelNights.sol:55`, `HotelNights.sol:139`). Confirmar el
  nombre canónico.
- **Qué rol se exige de verdad.** UI por `MINTER_ROLE` (`page.tsx:11`), API por `DEFAULT_ADMIN_ROLE`
  (`route.ts:55`) y contrato por `MINTER_ROLE` (`HotelNights.sol:135`). Confirmar si el operador debe
  ser admin de plataforma o si la ruta debería admitir MINTER.
- **`tokenURI` frente a IPFS.** El fuente dice «`tokenURI` (IPFS)», pero el navegador envía un
  `data:application/json` con la imagen `ipfs://CID` dentro (`AdminMint.tsx:172`–`:176`, `ipfs.ts:80`).
  Confirmar si la metadata debe publicarse en IPFS en lugar de viajar en la transacción.
- **Zona horaria.** `PastDate` se evalúa en UTC (`DateLib.sol:15`, `HotelNights.sol:497`) y el
  calendario se valida en local (`AdminMint.tsx:29`). Confirmar el margen respecto a `Europe/Madrid`
  (ADR-08) y el modo lote, que suma días con `Date` local (`AdminMint.tsx:123`–`:130`).
- **Alcance del lote.** CU-02 describe una noche; la implementación admite lotes de hasta 50
  (US-16, `AdminMint.tsx:112`). Confirmar si el lote pertenece a este CU o a otro manual.
- **Reconciliación del pendiente de anclaje.** El cliente persiste la fila **antes** de que la wallet
  firme (`AdminMint.tsx:147`): si el operador rechaza, queda un PENDING_ANCHOR sin limpieza visible.
- **Pinning gestionado.** El pinning con Pinata sigue pendiente de credenciales (`ipfs.ts:13`–`:18`).
