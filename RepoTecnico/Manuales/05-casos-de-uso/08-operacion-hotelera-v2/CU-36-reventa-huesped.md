# CU-36 · Que el huésped publique, cambie o retire su reventa — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Huésped · Requisitos: RF-36, RF-36.1

## 1. Ficha y trazabilidad

- **Objetivo.** Que la persona que tiene una noche tokenizada la ponga en venta, cambie el precio o
  la retire, desde una pantalla propia y con el estado real de la cadena.
- **Actor primario.** Huésped con la wallet conectada
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:245`).
- **Requisitos que cubre.** RF-36 y RF-36.1
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:246`). RF-36.1 exige reutilizar `useListNight`
  como punto único de verdad de `list`/`unlist` y leer las reventas desde `listingOf`
  (`casos_uso_incremento.md:278`, `:279`).
- **Precondición.** El huésped posee la noche y no está consumida
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:245`). El contrato lo refuerza: solo se
  revende si hubo venta primaria y no hay check-in
  (`packages/contracts/src/HotelNights.sol:217`, `:220`).
- **Disparador.** Pulsar **Listar** / **Guardar nuevo precio** / **Cancelar reventa**
  (`apps/web/src/components/my-nights/MyNightCard.tsx:144`, `:177`).
- **Postcondición.** La transacción `list` o `unlist` queda confirmada
  (`packages/contracts/src/HotelNights.sol:227`, `:236`) y la pantalla vuelve a leer `listingOf`.
- **Dónde vive.**
  - UI de gestión: `apps/web/src/app/mis-noches/mis-reventas/page.tsx:9` →
    `apps/web/src/components/my-nights/MyResales.tsx:24`.
  - Tarjeta con las acciones: `apps/web/src/components/my-nights/MyNightCard.tsx:21`.
  - Escritura on-chain: `apps/web/src/components/my-nights/useListNight.ts:22`.
  - Lectura on-chain: `apps/web/src/components/my-nights/useMyNights.ts:103`.
  - Contrato: `packages/contracts/src/HotelNights.sol:214` (`list`) y `:232` (`unlist`).
  - Endpoints HTTP: **ninguno**. Todo el camino de escritura es wallet + RPC.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El huésped conecta la wallet (CU-17). Desde **Mis noches** hay un enlace a **Mis reventas**
   (`apps/web/src/components/my-nights/MyNights.tsx:103`, `:104`).
2. La página `/mis-noches/mis-reventas` monta `MyResales`
   (`apps/web/src/app/mis-noches/mis-reventas/page.tsx:18`).
3. `MyResales` exige wallet conectada y red correcta; si no, muestra el aviso y la barra de cartera
   (`apps/web/src/components/my-nights/MyResales.tsx:64`, `:68`).
4. `useMyNights` descubre lo que el usuario posee: eventos `Sale` como comprador → `ownerOf` para
   confirmar propiedad (`apps/web/src/components/my-nights/useMyNights.ts:110`, `:125`) y
   `listingOf` para el estado de reventa (`:131`, `:136`).
5. Solo las noches con `listing.active === true` se marcan con precio
   (`apps/web/src/components/my-nights/useMyNights.ts:148`, `:154`).
6. `MyResales` separa lo **publicado** (`listingPriceWei !== null`,
   `apps/web/src/components/my-nights/MyResales.tsx:44`) de lo **vendido** (`data.resales`, `:48`).
7. La sección **Publicadas** pinta cada noche con `MyNightCard`
   (`apps/web/src/components/my-nights/MyResales.tsx:116`).
8. Para publicar o cambiar el precio, el huésped escribe un precio en ETH
   (`apps/web/src/components/my-nights/MyNightCard.tsx:128`). La validación de cliente exige un
   número mayor que cero (`:64`, `:66`).
9. `onList` llama a `list(night.tokenId, parseEther(priceEth))`
   (`apps/web/src/components/my-nights/MyNightCard.tsx:72`).
10. `useListNight.list` escribe en el contrato canónico con `functionName: "list"` y argumentos
    `[BigInt(tokenId), priceWei]` (`apps/web/src/components/my-nights/useListNight.ts:27`, `:30`).
11. El contrato comprueba propiedad, estado, precio y caducidad, guarda el `Listing`, y emite
    `Listed` (`packages/contracts/src/HotelNights.sol:215`, `:227`, `:228`). Si la noche ya estaba
    listada, **sobrescribe** el precio: editar es volver a llamar a `list`.
12. Al confirmarse la transacción, la tarjeta cierra el formulario y refresca los datos
    (`apps/web/src/components/my-nights/MyNightCard.tsx:50`, `:53`); la relectura de `listingOf`
    actualiza **Publicadas** (`useMyNights.ts:131`).
13. Para retirar, el botón **Cancelar reventa** llama a `unlist(tokenId)`
    (`apps/web/src/components/my-nights/MyNightCard.tsx:77`;
    `apps/web/src/components/my-nights/useListNight.ts:35`).
14. `unlist` borra el `Listing` y emite `Unlisted`
    (`packages/contracts/src/HotelNights.sol:236`, `:237`); la noche desaparece de **Publicadas** al
    refrescar.

### 2.2 Validaciones

- **Propiedad.** `list` y `unlist` exigen `_ownerOf(tokenId) == msg.sender`; si no, `NotOwner`
  (`packages/contracts/src/HotelNights.sol:215`, `:233`).
- **Noche consumida.** Con check-in hecho, `list` revierte con `NightNotResellable`
  (`packages/contracts/src/HotelNights.sol:217`); el mensaje traducido está en
  `apps/web/src/components/my-nights/resaleErrorMessage.ts:16` y
  `apps/web/messages/es.json:350`.
- **Venta primaria previa.** Una noche que nunca se vendió no entra por la vía secundaria:
  `NightNotResellable` (`packages/contracts/src/HotelNights.sol:220`).
- **Precio > 0.** `price == 0` revierte con `InvalidPrice`
  (`packages/contracts/src/HotelNights.sol:221`).
- **Suelo anti-evasión.** `price < minListingPrice` revierte con `PriceBelowMinimum`
  (`packages/contracts/src/HotelNights.sol:224`). El suelo arranca en una constante
  (`:89`) y solo `DEFAULT_ADMIN_ROLE` puede cambiarlo (`:309`).
- **Noche caducada.** `_isExpired(tokenId)` ⇒ `NightExpired`
  (`packages/contracts/src/HotelNights.sol:225`).
- **Retirar algo no listado.** `unlist` revierte con `NotListed`
  (`packages/contracts/src/HotelNights.sol:234`).
- **Precio en la UI.** Sin precio o con `<= 0` no se firma nada
  (`apps/web/src/components/my-nights/MyNightCard.tsx:65`).
- **Traducción de errores.** `resaleErrorMessage` reconoce `NotOwner`, `InvalidPrice`,
  `NightExpired`, `NotListed`, `PriceBelowMinimum` y `NightNotResellable`, y cae al mensaje genérico
  de rechazo o fallo (`apps/web/src/components/my-nights/resaleErrorMessage.ts:7`, `:62`).

### 2.3 Efectos on-chain / persistencia

- **On-chain (obligatorio).** `list(uint256 tokenId, uint256 price)` y `unlist(uint256 tokenId)`
  (`packages/contracts/src/HotelNights.sol:214`, `:232`), sin control de acceso por rol: manda la
  propiedad del token.
- **Estado.** `_listings[tokenId] = Listing({price, active: true})` al listar
  (`packages/contracts/src/HotelNights.sol:227`) y `delete _listings[tokenId]` al retirar (`:236`).
- **Eventos.** `Listed(tokenId, seller, price)` (`:228`) y `Unlisted(tokenId)` (`:237`), declarados
  en `packages/contracts/src/IHotelNights.sol:36`, `:37`.
- **Fuente de verdad.** La UI no guarda copia local del listado: lee `listingOf`
  (`apps/web/src/components/my-nights/useMyNights.ts:136`). La caché de TanStack Query se refresca
  tras cada transacción confirmada (`apps/web/src/components/my-nights/MyNightCard.tsx:49`).
- **Off-chain:** nada. No hay endpoint ni tabla para la reventa del huésped; el descubrimiento se
  hace con `getLogs` paginado (`apps/web/src/components/my-nights/useMyNights.ts:58`, `:64`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Listar / cambiar precio | `list(uint256 tokenId, uint256 price)` | `packages/contracts/src/HotelNights.sol:214` |
| Retirar | `unlist(uint256 tokenId)` | `packages/contracts/src/HotelNights.sol:232` |
| Leer estado de reventa | `listingOf(uint256 tokenId)` | `packages/contracts/src/HotelNights.sol:429` |
| Suelo de reventa | `minListingPrice()` | `packages/contracts/src/HotelNights.sol:89` |
| Hook de lectura | `useMyNights(address)` | `apps/web/src/components/my-nights/useMyNights.ts:207` |
| Pantalla | `/mis-noches/mis-reventas` | `apps/web/src/app/mis-noches/mis-reventas/page.tsx:9` |

No hay endpoints HTTP propios de este caso de uso.

### 4.2 Eventos y errores canónicos

- **Eventos:** `Listed(uint256 indexed tokenId, address indexed seller, uint256 price)` y
  `Unlisted(uint256 indexed tokenId)` (`packages/contracts/src/IHotelNights.sol:36`, `:37`).
- **Errores:** `NotOwner` (`packages/contracts/src/IHotelNights.sol:69`), `InvalidPrice` (`:64`),
  `NightExpired` (`:67`), `NotListed` (`:71`), `PriceBelowMinimum` (`:85`) y `NightNotResellable`
  (`:77`).
- **Mapeo a mensajes:** `apps/web/src/components/my-nights/resaleErrorMessage.ts:7` y textos en
  `apps/web/messages/es.json:344`.
- **Rechazo de firma o fallo de red:** cae a `txError.rejected` / `txError.failed`
  (`apps/web/src/components/my-nights/resaleErrorMessage.ts:63`).

### 4.3 Estructuras de datos y almacenamiento

- `OwnedNight` (`apps/web/src/components/my-nights/useMyNights.ts:16`): `tokenId`, `room`,
  `dateYYYYMMDD`, `type` y `listingPriceWei` (`null` si no está en venta).
- `ResaleSale` (`:26`): datos de una reventa ya cerrada, con `buyer` y `blockNumber`.
- `UseListNightResult` (`apps/web/src/components/my-nights/useListNight.ts:8`): `list`, `unlist`,
  `reset`, `status`, `hash` y `error`.
- `Listing` en el contrato: `{ price, active }`
  (`packages/contracts/src/HotelNights.sol:227`), leído por `listingOf` (`:429`).
- Estados de interfaz **Publicadas** / **Vendidas**: derivados de `listingOf` y de los eventos
  `Sale` como vendedor (`apps/web/src/components/my-nights/useMyNights.ts:148`, `:162`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin wallet conectada o red incorrecta | Aviso + `WalletBar` | `apps/web/src/components/my-nights/MyResales.tsx:64` |
| Precio vacío o `<= 0` en la UI | `invalidPrice` (`list-error-…`) | `apps/web/src/components/my-nights/MyNightCard.tsx:65`, `:139` |
| No es el propietario | `NotOwner` → `resaleError.NotOwner` | `packages/contracts/src/HotelNights.sol:215` |
| Precio 0 firmado igualmente | `InvalidPrice` | `packages/contracts/src/HotelNights.sol:221` |
| Precio por debajo del suelo | `PriceBelowMinimum` | `packages/contracts/src/HotelNights.sol:224` |
| Noche ya consumida (check-in) | `NightNotResellable` | `packages/contracts/src/HotelNights.sol:217` |
| Noche sin venta primaria | `NightNotResellable` | `packages/contracts/src/HotelNights.sol:220` |
| Noche caducada | `NightExpired` | `packages/contracts/src/HotelNights.sol:225` |
| El usuario cancela la firma | `txError.rejected` | `apps/web/src/components/my-nights/resaleErrorMessage.ts:63` |
| Error de transacción en pantalla | `data-testid="list-tx-error-…"` | `apps/web/src/components/my-nights/MyNightCard.tsx:190` |
| Falla la lectura on-chain | Mensaje + **Reintentar** | `apps/web/src/components/my-nights/MyResales.tsx:81`, `:85` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.resale.t.sol:122`: listar y retirar.
- `packages/contracts/test/HotelNights.resale.t.sol:138`: listar sin ser propietario revierte.
- `packages/contracts/test/HotelNights.resale.t.sol:144`: precio 0 revierte.
- `packages/contracts/test/HotelNights.resale.t.sol:156`: por debajo del suelo revierte.
- `packages/contracts/test/HotelNights.resale.t.sol:166`: en el suelo exacto funciona.
- `packages/contracts/test/HotelNights.resale.t.sol:220`: noche caducada revierte.
- `packages/contracts/test/HotelNights.resale.t.sol:228`: exige venta primaria previa.
- `packages/contracts/test/HotelNights.resale.t.sol:266`: volver a listar sobrescribe el precio.
- `packages/contracts/test/HotelNights.resale.t.sol:311`: retirar algo no listado revierte.
- `apps/web/e2e/a11y.spec.ts:31`: `/reventa` entra en la auditoría de accesibilidad (es el mercado
  de compra, CU-07, no la pantalla de gestión).
- **No cubierto:** no hay prueba de componente de `MyResales` ni de `MyNightCard`, ni prueba del
  hook `useListNight` con la wallet simulada. La pantalla `/mis-noches/mis-reventas` no está en la
  auditoría de accesibilidad.

## 7. Pendiente de confirmar

- El documento exige que, si el precio está por debajo del suelo, «la interfaz muestra el mensaje de
  error traducido» (`RepoTecnico/incremento_v2/casos_uso_incremento.md:273`). El mapeo existe
  (`apps/web/src/components/my-nights/resaleErrorMessage.ts:15`), pero detecta el error por
  **texto** del mensaje de viem, no por selector (`:51`); si el proveedor cambia el formato del
  revert, el mensaje específico puede no aparecer.
- RF-36.1 pide reutilizar `useListNight` para todas las acciones
  (`casos_uso_incremento.md:278`). Se cumple en `MyNightCard`
  (`apps/web/src/components/my-nights/MyNightCard.tsx:32`), única tarjeta que lista y retira. No
  hay otro punto de escritura en la web (solo el ABI y el mercado de compra).
- La edición del precio es un `list` nuevo, no una función `updateListing`: el contrato no tiene
  una función de actualización separada (`packages/contracts/src/HotelNights.sol:214`).
- «Mis reventas» agrupa **Publicadas** y **Vendidas**, pero no hay pantalla ni endpoint para
  reclamar el saldo desde ahí en el mismo flujo: el cobro vive en `ClaimPanel`
  (`apps/web/src/components/my-nights/MyResales.tsx:156`), que pertenece a CU-15.
- No existe límite visible de reventas simultáneas ni aviso al hotel cuando el huésped lista; el
  worker solo se entera cuando hay venta (`apps/worker/src/sale-notifier.ts:21`).
