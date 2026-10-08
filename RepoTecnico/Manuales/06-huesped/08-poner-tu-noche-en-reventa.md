# Poner tu noche en reventa, cambiar el precio o retirarla

> El huésped publica en venta una noche que ya es suya, le cambia el precio cuando quiere y la retira del mercado firmando desde su propia cartera.

## Qué hace el sistema

La gestión de la reventa tiene dos pantallas de cliente. **Mis noches** (`/mis-noches`) lista todas las noches del huésped y permite publicarlas (`apps/web/src/app/mis-noches/page.tsx:8`). **Mis reventas** (`/mis-noches/mis-reventas`) reúne solo lo que está publicado y lo que ya se vendió (`apps/web/src/app/mis-noches/mis-reventas/page.tsx:9`). Ambas cuelgan de `PublicShell` y usan la misma tarjeta `MyNightCard`, que es donde vive el formulario de precio (`apps/web/src/components/my-nights/MyResales.tsx:118`; `apps/web/src/components/my-nights/MyNightCard.tsx:21`).

Ninguna de las dos pantallas guarda una copia del estado. Cada vez que se cargan leen la cadena. La lectura la hace `useMyNights`, que primero comprueba si hay cartera conectada y en la red correcta; si no, ni siquiera consulta (`apps/web/src/components/my-nights/MyNights.tsx:39`, `:60`; `apps/web/src/components/my-nights/MyResales.tsx:27`, `:64`). La consulta sigue tres pasos contra el contrato canónico `HotelNights` (`apps/web/src/components/my-nights/useMyNights.ts:110`):

1. Busca los eventos de venta en los que el huésped fue el comprador, para tener candidatas (`apps/web/src/components/my-nights/useMyNights.ts:117`).
2. Confirma la propiedad actual de cada candidata con `ownerOf`, de modo que las noches ya revendidas o traspasadas desaparecen de la lista (`apps/web/src/components/my-nights/useMyNights.ts:132`). `ownerOf` lo hereda el contrato del estándar ERC-721 que extiende (`packages/contracts/src/HotelNights.sol:48`).
3. Lee el estado de reventa de cada noche poseída con `listingOf`, que devuelve `price` y `active` (`apps/web/src/components/my-nights/useMyNights.ts:138`; `packages/contracts/src/HotelNights.sol:429`).

Una noche se considera «en reventa» solo si el listado está activo; entonces se guarda su precio en wei y, si no, el precio queda a `null` (`apps/web/src/components/my-nights/useMyNights.ts:155`, `:161`). La pantalla **Mis reventas** filtra por ese campo: la sección **Publicadas** son las noches con precio de listado distinto de `null` (`apps/web/src/components/my-nights/MyResales.tsx:44`). La sección **Vendidas** sale de los eventos `Sale` en los que el huésped fue el vendedor y cuyo tipo de venta es la secundaria (`apps/web/src/components/my-nights/useMyNights.ts:169`, `:176`).

Las escrituras van por el hook `useListNight`, que envía llamadas al contrato `HotelNights` con `writeContract` de wagmi (`apps/web/src/components/my-nights/useListNight.ts:22`):

- `list(tokenId, price)` para publicar o para sobrescribir el precio (`apps/web/src/components/my-nights/useListNight.ts:26`).
- `unlist(tokenId)` para retirar la noche del mercado (`apps/web/src/components/my-nights/useListNight.ts:35`).

Antes de enviar nada, el formulario valida en el navegador: si el precio no es un número mayor que cero, no se llama a la cartera y se marca el campo como inválido (`apps/web/src/components/my-nights/MyNightCard.tsx:65`). Si el precio pasa la validación, se convierte de ETH a wei con `parseEther` y se manda al contrato (`apps/web/src/components/my-nights/MyNightCard.tsx:72`). El contrato repite todas las comprobaciones por su cuenta (`packages/contracts/src/HotelNights.sol:214`):

- Quien lista tiene que ser el dueño actual de la ficha (`packages/contracts/src/HotelNights.sol:215`).
- Una noche ya consumida en recepción no vuelve al mercado (`packages/contracts/src/HotelNights.sol:217`).
- Solo se revende una noche que ya tuvo venta primaria; el inventario del hotel no entra por aquí (`packages/contracts/src/HotelNights.sol:220`).
- El precio no puede ser cero ni quedar por debajo del suelo `minListingPrice` (`packages/contracts/src/HotelNights.sol:221`, `:224`).
- La noche no puede estar caducada (`packages/contracts/src/HotelNights.sol:225`).

El suelo de reventa arranca en `DEFAULT_MIN_LISTING_PRICE = 0.01 ether` y es gobernable por administración, nunca cero (`packages/contracts/src/HotelNights.sol:67`, `:89`; `docs/adr/ADR-19-suelo-de-precio-de-listado.md:13`). El royalty no se configura: se deriva del tipo de habitación al consultar, un 5 % en simple y doble y un 10 % en suite, y lo cobra la tesorería (`packages/contracts/src/HotelNights.sol:70`, `:71`, `:449`; `docs/adr/ADR-18-royalty-por-tipo-inmutable.md:13`).

El estado de la transacción lo deriva `deriveTxStatus` de las señales de wagmi: firma, pendiente, confirmada o revertida (`apps/web/src/components/tx/txStatus.ts:12`). Al confirmarse una operación, la tarjeta refresca los datos y vuelve a leer `listingOf`/`ownerOf` (`apps/web/src/components/my-nights/MyNightCard.tsx:49`; `apps/web/src/components/my-nights/MyResales.tsx:32`). Si falla, `resaleErrorMessage` busca el nombre del error de contrato dentro del texto del error y lo traduce; si no lo reconoce, cae al mensaje genérico de firma cancelada o de fallo (`apps/web/src/components/my-nights/resaleErrorMessage.ts:51`, `:60`).

Todo esto ocurre sobre una red de pruebas local: Anvil en `http://127.0.0.1:8545`, `chainId 81234` (`docs/SRS.md:332`). No es una venta al público.

## Recorrido real

1. Abre `/mis-noches` con la cartera conectada y en la red correcta. Si falta cualquiera de las dos cosas, en lugar de la lista aparece «Conecta tu wallet para ver y gestionar tus noches.» con la barra de conexión (`apps/web/src/components/my-nights/MyNights.tsx:60`; `apps/web/messages/es.json:321`).
2. Mientras carga se lee «Cargando tus noches…» (`apps/web/src/components/my-nights/MyNights.tsx:69`; `apps/web/messages/es.json:322`).
3. En la cabecera del listado hay un acceso a la pantalla de reventas: el aviso «¿Quieres gestionar lo que tienes en venta?» y el enlace `Ir a Mis reventas` (`apps/web/src/components/my-nights/MyNights.tsx:100`, `:103`; `apps/web/messages/es.json:361`, `:362`).
4. En **Mis noches** puedes publicar ya mismo: en una noche sin listar verás la etiqueta `Tuya`, el campo `Precio de reventa (ETH)` y el botón `Listar` (`apps/web/src/components/my-nights/MyNightCard.tsx:115`, `:133`, `:157`; `apps/web/messages/es.json:336`, `:338`, `:339`).
5. Escribe una cifra mayor que cero en ETH y pulsa `Listar`. Si dejas el campo vacío o pones cero, el sistema no llama a la cartera: marca el campo y muestra «Introduce un precio mayor que 0.» (`apps/web/src/components/my-nights/MyNightCard.tsx:65`, `:146`; `apps/web/messages/es.json:344`).
6. Se abre el modal de la operación y tu cartera te pide firmar. Mientras firmas se lee «Confirma en tu wallet» y el aviso «Revisa y firma la transacción en MetaMask.» (`apps/web/src/components/buy/TxModal.tsx:175`, `:180`; `apps/web/messages/es.json:300`, `:306`).
7. Enviada la operación, el modal pasa a «Reservando tu noche…» con «Esperando confirmación en la red…» y el recibo de la transacción (`apps/web/src/components/buy/TxModal.tsx:175`, `:248`; `apps/web/messages/es.json:301`, `:307`). Este texto es genérico del ciclo de transacción y no habla de reventa.
8. Al confirmarse, la tarjeta refresca sola. La etiqueta cambia a `En reventa` y debajo aparece `Precio de reventa: {price}` (`apps/web/src/components/my-nights/MyNightCard.tsx:112`, `:122`; `apps/web/messages/es.json:335`, `:337`).
9. Para ver la versión de gestión, entra en **Mis reventas** con el enlace del paso 3. La cabecera de la página es `Mis reventas` con el subtítulo «Gestiona las noches que has puesto en venta y consulta las que ya has vendido.» (`apps/web/src/app/mis-noches/mis-reventas/page.tsx:15`, `:16`; `apps/web/messages/es.json:1084`, `:1085`).
10. Dentro verás dos secciones con esos rótulos: `Publicadas` y `Vendidas` (`apps/web/src/components/my-nights/MyResales.tsx:106`, `:127`; `apps/web/messages/es.json:1092`, `:1095`). En `Publicadas` se listan tus noches con listado activo; si no hay ninguna, se lee «No tienes ninguna noche publicada ahora mismo.» (`apps/web/src/components/my-nights/MyResales.tsx:113`; `apps/web/messages/es.json:1093`).
11. En `Vendidas` hay una tabla con las columnas `Noche`, `Precio` y `Comprador`; si aún no has vendido nada, se lee «Todavía no has vendido ninguna noche.» (`apps/web/src/components/my-nights/MyResales.tsx:137`, `:138`, `:139`, `:130`; `apps/web/messages/es.json:1097`, `:1098`, `:1099`, `:1096`).
12. Sobre la sección `Publicadas` hay un enlace `Publicar otra noche` que devuelve a **Mis noches** (`apps/web/src/components/my-nights/MyResales.tsx:108`; `apps/web/messages/es.json:1094`).
13. Para cambiar el precio de una noche publicada, pulsa `Cambiar precio` en su tarjeta. El campo arranca vacío y hay que escribir la cifra nueva completa (`apps/web/src/components/my-nights/MyNightCard.tsx:80`, `:82`, `:181`; `apps/web/messages/es.json:340`).
14. Escribe el precio nuevo y pulsa `Guardar nuevo precio`. Te vuelve a pedir firma: es otra transacción, la misma llamada `list` que sobrescribe el listado anterior (`apps/web/src/components/my-nights/MyNightCard.tsx:157`, `:72`; `apps/web/messages/es.json:341`). Si te arrepientes antes de firmar, `Cancelar` cierra el formulario sin enviar nada (`apps/web/src/components/my-nights/MyNightCard.tsx:167`; `apps/web/messages/es.json:342`).
15. Para retirar la noche del mercado, pulsa `Cancelar reventa` y firma. La llamada es `unlist` (`apps/web/src/components/my-nights/MyNightCard.tsx:188`, `:75`; `apps/web/messages/es.json:343`).
16. Al confirmarse, la tarjeta refresca y la noche desaparece de `Publicadas`, porque su listado deja de estar activo (`apps/web/src/components/my-nights/MyResales.tsx:44`).
17. Si tienes saldo pendiente de reventas ya vendidas, aparece el panel **Saldo pendiente** con «Tienes fondos de reventas listos para cobrar.» y el botón `Cobrar {amount}` (`apps/web/src/components/my-nights/MyResales.tsx:156`; `apps/web/messages/es.json:345`, `:346`, `:347`).
18. Al final de la pantalla está el bloque de avisos `Avisos al móvil`, con `Activar avisos` o `Desactivar avisos` y el aviso «Recibe un aviso cuando se venda alguna de tus noches. Es anónimo y puedes desactivarlo cuando quieras.» (`apps/web/src/components/my-nights/MyResales.tsx:160`, `:167`, `:171`; `apps/web/messages/es.json:1100`, `:1101`, `:1105`, `:1104`).

## Piezas de código implicadas

**Pantallas y rutas**

- Página de mis noches: `apps/web/src/app/mis-noches/page.tsx:8`, `:17`.
- Página de mis reventas, marcada como dinámica: `apps/web/src/app/mis-noches/mis-reventas/page.tsx:6`, `:9`, `:18`.
- Pantalla de lista y pestañas: `apps/web/src/components/my-nights/MyNights.tsx:36`, `:39`, `:51`, `:60`, `:69`, `:77`, `:100`, `:147`, `:168`.
- Pantalla de reventas: `apps/web/src/components/my-nights/MyResales.tsx:24`, `:27`, `:44`, `:64`, `:73`, `:81`, `:106`, `:113`, `:118`, `:127`, `:156`.
- Entrada a mis reventas desde mis noches: `apps/web/src/components/my-nights/MyNights.tsx:103`.

**Escrituras de reventa**

- Hook de listar y retirar: `apps/web/src/components/my-nights/useListNight.ts:22`, `:26`, `:31`, `:35`, `:40`.
- Funciones de escritura del contrato: `list` (`packages/contracts/src/HotelNights.sol:214`) y `unlist` (`packages/contracts/src/HotelNights.sol:232`).
- Formulario de precio y validación en cliente: `apps/web/src/components/my-nights/MyNightCard.tsx:33`, `:41`, `:65`, `:72`, `:80`.
- Botones reales: `apps/web/src/components/my-nights/MyNightCard.tsx:150` (`Listar` / `Guardar nuevo precio`), `:160` (`Cancelar` del formulario), `:173` (`Cambiar precio`), `:183` (`Cancelar reventa`).
- Estado de la operación: `apps/web/src/components/tx/txStatus.ts:12`; modal: `apps/web/src/components/buy/TxModal.tsx:175`, `:181`, `:247`.

**Lecturas de la cadena**

- Descubrimiento de noches y listados: `apps/web/src/components/my-nights/useMyNights.ts:91`, `:110`, `:117`, `:132`, `:138`, `:155`, `:169`, `:199`.
- Tipos de datos: `apps/web/src/components/my-nights/useMyNights.ts:16`, `:33`, `:44`.
- Dirección del contrato y bloque de despliegue: `apps/web/src/config/chain.ts:13`, `:40`.
- Vistas del contrato: `listingOf` (`packages/contracts/src/HotelNights.sol:429`), `pendingWithdrawals` (`packages/contracts/src/HotelNights.sol:434`), `royaltyInfo` (`packages/contracts/src/HotelNights.sol:449`).
- Eventos que se consumen: `Listed` (`packages/shared/src/abi/hotel-nights.ts:1136`), `Sale` (`packages/shared/src/abi/hotel-nights.ts:1438`), `Unlisted` (`packages/shared/src/abi/hotel-nights.ts:1519`).

**Traducción de errores**

- Detección del nombre del revert: `apps/web/src/components/my-nights/resaleErrorMessage.ts:7`, `:37`, `:49`, `:60`.
- Clasificación del rechazo de firma: `apps/web/src/components/tx/txError.ts:18`, `:26`.

**Textos**

- Claves de las pantallas: `apps/web/messages/es.json:318` (`myNights`), `:1083` (`myResales`).
- Errores de reventa: `apps/web/messages/es.json:353`.
- Errores genéricos de transacción usados por la tarjeta: `apps/web/messages/es.json:349`.

## Datos y estados

- **Una noche propia** (`OwnedNight`): identificador de la ficha, número de habitación, fecha, tipo, precio del listado en wei o `null` si no está en venta, y portada opcional (`apps/web/src/components/my-nights/useMyNights.ts:16`).
- **Una reventa cerrada** (`ResaleSale`): identificador, habitación, fecha, tipo, precio en wei, comprador y bloque de la venta (`apps/web/src/components/my-nights/useMyNights.ts:33`).
- **Datos de la pantalla** (`MyNightsData`): noches, saldo pendiente en wei y lista de reventas vendidas (`apps/web/src/components/my-nights/useMyNights.ts:44`).
- **Listado en el contrato** (`Listing`): precio y bandera `active` (`packages/contracts/src/IHotelNights.sol:127`).
- **Estados visibles de la noche:** `Tuya` si no hay listado activo, `En reventa` si lo hay (`apps/web/src/components/my-nights/MyNightCard.tsx:112`, `:115`; `apps/web/messages/es.json:335`, `:336`).
- **Estados de la operación** (`TxStatus`): `idle`, `signing`, `pending`, `confirmed`, `reverted` (`apps/web/src/components/tx/txStatus.ts:2`).
- **Clave de error de reventa** (`ResaleErrorKey`): `resaleError.NotOwner`, `resaleError.InvalidPrice`, `resaleError.NightExpired`, `resaleError.NotListed`, `resaleError.PriceBelowMinimum`, `resaleError.NightNotResellable`, o bien `txError.rejected` / `txError.failed` (`apps/web/src/components/my-nights/resaleErrorMessage.ts:7`, `:22`).
- **Campos del formulario:** precio en ETH introducido por el huésped, error de precio, si se está editando el precio de una noche ya listada y el estado de ocupado de la firma (`apps/web/src/components/my-nights/MyNightCard.tsx:33`, `:34`, `:37`, `:39`).
- **Suelo de reventa:** `minListingPrice`, por defecto 0,01 ETH en la red local (`packages/contracts/src/HotelNights.sol:67`, `:89`; `docs/SRS.md:131`). La pantalla no lo muestra; la única vista que lo enseña es la de administración (`apps/web/src/components/admin/system/SystemContractState.tsx:20`).
- **Mensajes reales de la pantalla Mi reventas:**
  - «Conecta tu wallet para gestionar tus reventas.» (`apps/web/messages/es.json:1086`).
  - «Cargando tus reventas…» (`apps/web/messages/es.json:1087`).
  - «No se pudieron cargar tus reventas. Inténtalo de nuevo.» y `Reintentar` (`apps/web/messages/es.json:1088`, `:1089`).
  - «Tienes {count} reventa(s) nueva(s) desde tu última visita.» y `Marcar como vistas` (`apps/web/messages/es.json:1090`, `:1091`).
  - «No se pudo completar la operación. Revisa la red y vuelve a intentarlo.» (fallo genérico de la tarjeta, `apps/web/messages/es.json:351`).
- **Mensajes reales de errores de reventa** (`apps/web/messages/es.json:353`):
  - «No eres la propietaria de esta noche.» (`:354`).
  - «El precio debe ser mayor que 0.» (`:355`).
  - «La noche ha expirado y no puede listarse.» (`:356`).
  - «Esta noche no está en reventa.» (`:357`).
  - «El precio está por debajo del mínimo de reventa que fija el hotel.» (`:358`).
  - «Esta noche ya se consumió en recepción y no puede revenderse.» (`:359`).
  - «Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.» (`:350`).

## Casos límite y errores

- **Sin cartera o en red equivocada.** Las dos pantallas cortan antes de consultar: muestran el aviso y la barra de conexión, sin lista (`apps/web/src/components/my-nights/MyResales.tsx:64`; `apps/web/src/components/my-nights/MyNights.tsx:60`).
- **Precio vacío, cero o no numérico.** La validación del navegador exige un número mayor que cero; si no pasa, no se envía la transacción y se muestra «Introduce un precio mayor que 0.» (`apps/web/src/components/my-nights/MyNightCard.tsx:65`, `:146`).
- **Precio con demasiados decimales.** La conversión a wei con `parseEther` rechaza las cifras con más de 18 decimales lanzando una excepción antes de llegar a la cartera; el código no captura ese caso (`apps/web/src/components/my-nights/MyNightCard.tsx:72`). Caso **pendiente de confirmar** en cuanto al texto exacto que ve el huésped.
- **No eres el propietario.** El contrato revierte con `NotOwner` y la tarjeta lo traduce a «No eres la propietaria de esta noche.» (`packages/contracts/src/HotelNights.sol:215`; `apps/web/messages/es.json:354`).
- **Precio por debajo del suelo.** El contrato revierte con `PriceBelowMinimum` y se lee «El precio está por debajo del mínimo de reventa que fija el hotel.» (`packages/contracts/src/HotelNights.sol:224`; `apps/web/messages/es.json:358`).
- **Precio cero en el contrato.** Aunque el navegador ya lo filtra, el contrato revierte con `InvalidPrice` y el mensaje es «El precio debe ser mayor que 0.» (`packages/contracts/src/HotelNights.sol:221`; `apps/web/messages/es.json:355`).
- **Noche caducada.** Si la fecha de la noche ya pasó, el contrato revierte con `NightExpired` y se lee «La noche ha expirado y no puede listarse.» (`packages/contracts/src/HotelNights.sol:225`, `:501`; `apps/web/messages/es.json:356`).
- **Noche ya consumida en recepción.** El check-in marca la noche y el contrato revierte con `NightNotResellable`; el mensaje es «Esta noche ya se consumió en recepción y no puede revenderse.» (`packages/contracts/src/HotelNights.sol:217`; `apps/web/messages/es.json:359`).
- **Noche que nunca se vendió.** Una ficha que sigue siendo inventario del hotel tampoco entra por la reventa: el contrato revierte con el mismo `NightNotResellable` (`packages/contracts/src/HotelNights.sol:220`).
- **Retirar algo que no está publicado.** `unlist` revierte con `NotListed` y se lee «Esta noche no está en reventa.» (`packages/contracts/src/HotelNights.sol:234`; `apps/web/messages/es.json:357`).
- **Firma cancelada.** Si cierras la ventana de la cartera, el mensaje es «Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.» y el formulario sigue disponible (`apps/web/src/components/tx/txError.ts:18`; `apps/web/messages/es.json:350`).
- **Fallo de la transacción.** Cualquier otro fallo cae en «No se pudo completar la operación. Revisa la red y vuelve a intentarlo.» (`apps/web/src/components/my-nights/resaleErrorMessage.ts:63`; `apps/web/messages/es.json:351`).
- **Error que no se reconoce.** Si el texto del error no contiene ninguno de los seis nombres de revert buscados, se usa el mensaje genérico; el detalle real no se muestra al huésped (`apps/web/src/components/my-nights/resaleErrorMessage.ts:51`).
- **Fallo al cargar la lista.** Aparece «No se pudieron cargar tus reventas. Inténtalo de nuevo.» con el botón `Reintentar`, que repite la consulta (`apps/web/src/components/my-nights/MyResales.tsx:81`, `:85`; `apps/web/messages/es.json:1088`, `:1089`).
- **Noche revendida o traspasada.** Aunque el huésped figure como comprador en el historial, si `ownerOf` ya no es su dirección la noche desaparece de la lista (`apps/web/src/components/my-nights/useMyNights.ts:91`, `:104`).
- **Ficha quemada.** Si la consulta del dueño revierte porque la ficha ya no existe, se trata como «no es tuya» y no rompe la pantalla (`apps/web/src/components/my-nights/useMyNights.ts:104`).
- **Cambio de precio.** No hay una función distinta para cambiar el precio: se vuelve a llamar a `list` con el mismo identificador y la cifra nueva, y el listado anterior se sobrescribe (`apps/web/src/components/my-nights/MyNightCard.tsx:71`, `:72`). El campo se abre vacío, así que hay que teclear el precio completo (`apps/web/src/components/my-nights/MyNightCard.tsx:82`).
- **Suelo subido después de listar.** Un listado ya creado por debajo del suelo nuevo sigue vivo; el suelo solo se evalúa al listar (`docs/adr/ADR-19-suelo-de-precio-de-listado.md:20`).
- **Contrato en pausa.** `list` y `unlist` no llevan `whenNotPaused`: la pausa no bloquea estas dos escrituras (`packages/contracts/src/HotelNights.sol:214`, `:232`). La compra de una reventa sí queda bloqueada por la pausa (`packages/contracts/src/HotelNights.sol:241`; `docs/SRS.md:151`).
- **Foto ausente.** Si la habitación no tiene foto, la tarjeta usa su imagen de tipo; la llamada de fotos falla en blando y nunca tumba la lista (`apps/web/src/components/my-nights/useMyNights.ts:221`; `apps/web/src/app/api/public/rooms/covers/route.ts:51`).
- **Red de pruebas.** El suelo, el royalty y las operaciones descritas se ejecutan sobre una red local de pruebas; no es venta al público (`docs/SRS.md:332`).

## Referencias

- CU-06 · Poner mi noche en reventa (y quitarla) (`docs/Manuales/05-casos-de-uso/04-ventas/CU-06-listar-reventa.md:1`).
- CU-36 · Que el huésped publique, cambie o retire su reventa (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-36-reventa-huesped.md:1`).
- CU-37 · Avisar al huésped cuando su reventa se mueve (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-37-avisos-reventa.md:1`).
- SRS §3.2 · Royalty y suelo de listado (`docs/SRS.md:129`).
- SRS §3.3 · Errores de dominio de la reventa (`docs/SRS.md:142`).
- SRS §9 · Catálogo de casos de uso, CU-06 y CU-36 (`docs/SRS.md:354`, `:372`).
- ADR-05 · Check-in anclado on-chain y resguardo de un solo uso (`docs/adr/ADR-05-check-in-on-chain.md:1`).
- ADR-09 · El bloque de despliegue es la fuente única del escaneo (`docs/adr/ADR-09-bloque-despliegue-fuente-unica.md:1`).
- ADR-11 · Nunca se firma una transacción no verificada (`docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md:1`).
- ADR-15 · Cobros por pull (`claim`) en lugar de envío directo (`docs/adr/ADR-15-pull-over-push.md:1`).
- ADR-16 · Una sola venta primaria por noche (`soldOnce`) (`docs/adr/ADR-16-venta-primaria-unica.md:1`).
- ADR-18 · Royalty por tipo de habitación, inmutable (`docs/adr/ADR-18-royalty-por-tipo-inmutable.md:1`).
- ADR-19 · Suelo de precio de listado, gobernable y nunca nulo (`docs/adr/ADR-19-suelo-de-precio-de-listado.md:1`).
