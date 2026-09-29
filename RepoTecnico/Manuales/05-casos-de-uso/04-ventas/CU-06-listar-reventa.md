# CU-06 · Poner mi noche en reventa (y quitarla) — Manual técnico

> Bloque 4 · Ventas · Actor: Propietario · Requisitos: RF-07, RNF-10

## 1. Ficha y trazabilidad

- **Objetivo.** Que quien ya posee una noche la publique en el mercado secundario con un precio
  propio, pueda cambiarlo y pueda retirarla; el contrato marca el listado y lo comunica con
  eventos.
- **Actor primario.** Propietario de la noche (revendedor). **Secundario:** el comprador secundario
  (CU-07) y el hotel, que cobra su royalty cuando la reventa se cierra.
- **Requisitos que cubre.** RF-07 (reventa entre clientes) y RNF-10 (royalty forzado: el suelo de
  reventa evita eludirlo). Decisiones D-06 (royalty inmutable y `minListingPrice`) y D-05
  (una noche consumida en recepción no vuelve al mercado).
- **Precondición.** Wallet conectada y propietaria del NFT; la noche tuvo venta primaria
  (`soldOnce == true`), no está consumida (`checkedIn == false`) y no ha expirado.
- **Disparador.** El propietario rellena el precio y pulsa **Listar**, o pulsa **Cambiar precio** o
  **Cancelar reventa** sobre una noche ya listada.
- **Postcondición.** Listar/cambiar precio deja `_listings[tokenId] = { price, active: true }` y
  emite `Listed`; cancelar borra el listado y emite `Unlisted` (la noche vuelve a estar solo en
  poder del cliente).
- **Dónde vive.**
  - Pantalla: `apps/web/src/app/mis-noches/page.tsx:8` (ruta `/mis-noches`).
  - Listado de noches propias: `apps/web/src/components/my-nights/MyNights.tsx:36`.
  - Tarjeta con acciones: `apps/web/src/components/my-nights/MyNightCard.tsx:21`.
  - Firma: `apps/web/src/components/my-nights/useListNight.ts:22`.
  - Lectura del listado: `apps/web/src/components/my-nights/useMyNights.ts:131`–`:140`.
  - Contrato: `packages/contracts/src/HotelNights.sol:214` (`list`) y `:232` (`unlist`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. La ruta `/mis-noches` es dinámica (`mis-noches/page.tsx:6`) y monta `MyNights`; sin wallet
   conectada o con red incorrecta solo se muestra la barra de onboarding
   (`MyNights.tsx:60`–`:67`).
2. `useMyNights` descubre las noches del usuario: escanea eventos `Sale` filtrando por `buyer`
   (`useMyNights.ts:109`–`:114`), confirma propiedad con `ownerOf` (`:124`–`:128`) y lee el estado de
   cada listado con `listingOf` (`:131`–`:140`). `listingPriceWei` es `null` si `active` es falso
   (`:148`–`:154`).
3. `MyNightCard` muestra el badge «En reventa» o «Tuya» (`MyNightCard.tsx:106`–`:110`) y, si la
   noche no está listada, el formulario de precio; si lo está, muestra el precio vigente y los
   botones **Cambiar precio** / **Cancelar reventa** (`:116`–`:120` y `:165`–`:188`).
4. Al enviar el formulario, `onList` valida en cliente `value > 0`
   (`MyNightCard.tsx:62`–`:73`), descarta el error anterior con `reset()` y llama a
   `list(tokenId, parseEther(priceEth))` (`:70`–`:72`).
5. `useListNight` firma `list(uint256,uint256)` contra el contrato canónico
   (`useListNight.ts:26`–`:33`). Cambiar precio reutiliza **la misma** función `list`
   (`MyNightCard.tsx:122`–`:164`): el contrato sobreescribe el `Listing` y reemite `Listed`.
6. **Cancelar reventa** llama a `unlist(tokenId)` (`MyNightCard.tsx:75`–`:78` y
   `useListNight.ts:35`–`:42`).
7. En el contrato, `list` comprueba propiedad (`HotelNights.sol:215`), que la noche no esté
   consumida (`:217`), que ya se vendiera una vez (`:220`), que el precio no sea 0 (`:221`), que
   alcance el suelo `minListingPrice` (`:224`) y que no esté expirada (`:225`); después guarda
   `Listing({ price, active: true })` (`:227`) y emite `Listed(tokenId, msg.sender, price)` (`:228`).
8. `unlist` exige propiedad (`HotelNights.sol:233`) y listado activo (`:234`), borra la entrada
   (`:236`) y emite `Unlisted(tokenId)` (`:237`).
9. Al confirmarse la transacción, la tarjeta sale del modo edición y refresca los datos
   (`MyNightCard.tsx:49`–`:54`); el refresco relee `listingOf` y `ownerOf`.

### 2.2 Validaciones

- **Propiedad.** `_ownerOf(tokenId) != msg.sender` revierte con `NotOwner()` tanto en `list`
  (`HotelNights.sol:215`) como en `unlist` (`:233`).
- **Precio 0.** `price == 0` revierte con `InvalidPrice()` (`HotelNights.sol:221`); en cliente el
  formulario exige `value > 0` y muestra «Introduce un precio mayor que 0.»
  (`MyNightCard.tsx:64`–`:68` y `:139`–`:143`).
- **Suelo anti-elusión (RNF-10).** `price < minListingPrice` revierte con
  `PriceBelowMinimum(price, minimum)` (`HotelNights.sol:224`). El valor por defecto es
  `DEFAULT_MIN_LISTING_PRICE = 0.01 ether` (`HotelNights.sol:67` y `:89`) y solo
  `DEFAULT_ADMIN_ROLE` puede cambiarlo con `setMinListingPrice` (`:305`–`:311`).
- **Noche consumida.** Si `_checkedIn[tokenId]`, revierte con `NightNotResellable(tokenId)`
  (`HotelNights.sol:217`), porque el listado debe salir de `EN_PODER_CLIENTE` (comentario en
  `:218`–`:220`).
- **Inventario del hotel.** Si la noche nunca se vendió (`!_soldOnce[tokenId]`) tampoco se puede
  listar: revierte `NightNotResellable` (`HotelNights.sol:220`).
- **Expiración.** `_isExpired` revierte con `NightExpired(tokenId)` (`HotelNights.sol:225`).
- **Cancelar lo que no está listado.** `!_listings[tokenId].active` revierte con `NotListed(tokenId)`
  (`HotelNights.sol:234`).
- **Cliente.** `resaleErrorMessage` traduce los reverts a mensajes concretos
  `myNights.resaleError.*` y cae a `txError.rejected`/`txError.failed` si no reconoce el error
  (`apps/web/src/components/my-nights/resaleErrorMessage.ts:7`–`:17` y `:60`–`:63`).

### 2.3 Efectos on-chain / persistencia

- **Escrituras.** `_listings[tokenId]` en `list` (`HotelNights.sol:227`) y su borrado en `unlist`
  (`:236`). No se mueve ningún NFT ni ETH: listar es solo una anotación de precio.
- **Eventos.** `Listed(tokenId, seller, price)` (`HotelNights.sol:228`, declarado en
  `IHotelNights.sol:36`) y `Unlisted(tokenId)` (`:237`, declarado en `:37`). Re-listar reemite
  `Listed` con el precio nuevo (`test_RelistOverwritesPrice`,
  `packages/contracts/test/HotelNights.resale.t.sol:266`).
- **Fuente autoritativa.** El mercado secundario lee `listingOf` on-chain en cada request
  (`apps/web/src/lib/nights.ts:236`–`:243`); no hay caché intermedia del listado.
- **Persistencia off-chain.** Ninguna: el estado del listado es del contrato.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `list(uint256,uint256)` | `packages/contracts/src/HotelNights.sol:214`; `IHotelNights.sol:133` | Listar y cambiar precio |
| `unlist(uint256)` | `HotelNights.sol:232`; `IHotelNights.sol:136` | Cancelar el listado |
| `listingOf(uint256)` | `HotelNights.sol:429`; `IHotelNights.sol:145` | Devuelve el `Listing` |
| `minListingPrice()` | `HotelNights.sol:89`; `IHotelNights.sol:207` | Suelo vigente de reventa |
| `setMinListingPrice(uint256)` | `HotelNights.sol:305` | Solo `DEFAULT_ADMIN_ROLE` |
| `soldOnce(uint256)` | `HotelNights.sol:414` | Requisito para poder listar |
| `isCheckedIn(uint256)` | `HotelNights.sol:419` | Bloquea listar una noche consumida |
| `useListNight()` | `apps/web/src/components/my-nights/useListNight.ts:22` | Punto único de firma de `list`/`unlist` |
| `useMyNights(address)` | `useMyNights.ts:207` | Descubre noches y su `listingPriceWei` |
| `/mis-noches` | `apps/web/src/app/mis-noches/page.tsx:8` | No es endpoint JSON; RSC + cliente |

No existe endpoint HTTP para listar: la operación es cliente → contrato.

### 4.2 Eventos y errores canónicos

- `Listed(uint256 indexed tokenId, address indexed seller, uint256 price)` (`IHotelNights.sol:36`)
  y `Unlisted(uint256 indexed tokenId)` (`IHotelNights.sol:37`).
- Errores: `NotOwner()` (`IHotelNights.sol:69`), `InvalidPrice()` (`:64`), `NightExpired(uint256)`
  (`:67`), `NotListed(uint256)` (`:71`), `PriceBelowMinimum(uint256,uint256)` (`:85`) y
  `NightNotResellable(uint256)` (`:77`).
- Nota: `list`/`unlist` **no** llevan `whenNotPaused` ni `nonReentrant` (`HotelNights.sol:214` y
  `:232`), a diferencia de `buy`/`buyResale`.

### 4.3 Estructuras de datos y almacenamiento

- `struct Listing { uint256 price; bool active; }` (`IHotelNights.sol:127`–`:130`), guardado en el
  mapping privado `_listings` (`HotelNights.sol:106`).
- `OwnedNight = { tokenId, room, dateYYYYMMDD, type, listingPriceWei }`
  (`useMyNights.ts:16`–`:23`); `listingPriceWei` es `string | null`, en wei, para no perder
  precisión (`:154`).
- `minListingPrice` es la única configuración gobernable del flujo (`HotelNights.sol:89`); el tipo
  de habitación afecta al royalty (CU-07) pero no al listado.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| No es el propietario (06a) | `NotOwner()` | `HotelNights.sol:215` y `:233` |
| Precio 0 (06b) | `InvalidPrice()` | `HotelNights.sol:221`; UI en `MyNightCard.tsx:64` |
| Noche expirada (06c) | `NightExpired(tokenId)` | `HotelNights.sol:225` |
| Cancelar sin listado (06d) | `NotListed(tokenId)` | `HotelNights.sol:234` |
| Rechazo de firma (06e) | `txError.rejected`, sin cambio on-chain | `resaleErrorMessage.ts:63` |
| Precio por debajo del suelo | `PriceBelowMinimum(price, minimum)` | `HotelNights.sol:224` |
| Noche consumida en recepción | `NightNotResellable(tokenId)` | `HotelNights.sol:217` |
| Noche del hotel sin vender | `NightNotResellable(tokenId)` | `HotelNights.sol:220` |
| Cambiar el precio de una noche listada | Reemite `Listed` con el precio nuevo | `HotelNights.sol:227`–`:228` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.resale.t.sol:122` (listar/cancelar), `:138` (no propietario),
  `:144` (precio 0), `:156` (bajo el suelo), `:166` (en el suelo), `:172`/`:182`/`:191`/`:202`
  (gobierno del suelo), `:220` (expirada), `:228` (exige `soldOnce`), `:245` (la primaria limpia
  listados rancios), `:266` (re-listar sobreescribe precio) y `:311` (`NotListed` al cancelar dos
  veces).
- Web: `apps/web/src/components/my-nights/resaleErrorMessage.test.ts:13`–`:51` cubre los seis
  errores de reventa y los dos fallbacks.
- Plan: `docs/PLAN-DE-PRUEBAS.md:104`–`:113` (TC-CT-030…TC-CT-036).
- **No cubierto.** No hay test unitario de `MyNightCard` ni de `useListNight`, ni E2E de
  listar/cancelar en `apps/web/e2e/`; TC-E2E-022 (rechazo de firma) está en el plan pero no
  implementado. El suelo `minListingPrice` no se prueba desde la UI.

## 7. Pendiente de confirmar

- **Suelo visible.** La UI no muestra `minListingPrice` antes de firmar: el usuario solo descubre el
  límite si el contrato revierte (`resaleErrorMessage.ts:15`). El único lector del valor es el
  back-office (`apps/web/src/components/admin/system/SystemContractState.tsx:20`). Confirmar si el
  manual debe indicar el mínimo vigente.
- **Pausa del sistema.** `list`/`unlist` no llevan `whenNotPaused` (`HotelNights.sol:214` y `:232`),
  así que se puede listar con el contrato en pausa aunque no se pueda comprar. Confirmar si es el
  comportamiento deseado.
- **Vocabulario `EN_PODER_CLIENTE`.** El fuente usa ese estado (`docs/CASOS-DE-USO.md:376`), pero en
  el contrato no hay enum: se deriva de `soldOnce` + propiedad + `listingOf`. Confirmar el término
  canónico.
- **Doble interfaz de reventa.** `/mis-noches` (`MyNightCard`) y `/mis-noches/mis-reventas`
  (`MyResales.tsx:24`, CU-36/CU-37 del incremento v2) ofrecen las mismas acciones reutilizando
  `MyNightCard` (`MyResales.tsx:116`–`:120`); confirmar cuál debe documentar CU-06.
- **Test del mínimo al alza.** `test_PreviouslyValidPriceRevertsAfterRaise`
  (`HotelNights.resale.t.sol:202`) cubre el caso de un precio que deja de ser válido tras subir el
  suelo; confirmar si el manual debe advertirlo al usuario.
