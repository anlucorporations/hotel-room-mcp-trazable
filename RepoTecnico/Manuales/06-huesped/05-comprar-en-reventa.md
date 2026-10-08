# Comprar una noche que otro cliente revende

> El huésped compra en el mercado secundario una noche que ya era de otra persona, con la misma revisión y la misma firma que en la compra al hotel.

## Qué hace el sistema

El mercado de reventa vive en `/reventa` y es una pantalla pública y dinámica: relee los listados en cada visita (`apps/web/src/app/reventa/page.tsx:7`, `:14`). La página lanza dos lecturas en paralelo y las resuelve por separado: los listados y el estado de pausa del contrato (`apps/web/src/app/reventa/page.tsx:19`).

La lista de reventa se lee **siempre de la cadena**, porque el estado autoritativo de un listado es el propio contrato (`apps/web/src/lib/nights.ts:392`). El sistema parte de los eventos `Listed`, y para cada candidata comprueba tres cosas: que el listado siga activo, que la noche no se haya consumido con un check-in y que su fecha siga dentro de la ventana de 90 días (`apps/web/src/lib/nights.ts:397`, `:403`, `:409`, `:410`, `:422`).

Si había listados que leer y **ninguna** lectura respondió, el sistema no devuelve una lista vacía: lanza un error para que la pantalla muestre su estado degradado. Una lista vacía sería una mentira que ocultaría noches comprables (`apps/web/src/lib/nights.ts:447`).

La compra reutiliza el mismo componente que la venta del hotel: la tarjeta de noche y su botón (`apps/web/src/components/resale/ResaleMarketClient.tsx:19`). Lo único que cambia es el calldata que se construye. Si la noche es de reventa, la función es `buyResale`; si es del hotel, `buy` (`packages/shared/src/domain/purchase-tx.ts:35`).

En la revisión, el sistema lee el precio del **listado** en lugar del precio de tarifa del hotel (`apps/web/src/components/buy/usePurchaseReview.ts:66`, `:75`, `:92`). La ventana de revisión y la firma funcionan igual que en la compra primaria (`apps/web/messages/es.json:200`).

En la cadena, la compra de reventa exige que el listado esté activo, que la noche no se haya consumido, que no esté expirada y que el importe sea exactamente el precio del listado (`packages/contracts/src/HotelNights.sol:241`, `:243`, `:246`, `:247`, `:248`). Después cierra el listado, reparte el dinero y transfiere la ficha (`packages/contracts/src/HotelNights.sol:257`, `:259`, `:260`, `:266`).

El reparto es el siguiente: el hotel se queda su comisión por royalty y el resto queda acreditado al vendedor. La comisión es del **5 %** en habitaciones simples y dobles, y del **10 %** en suites; es inmutable y se deriva del tipo de habitación (`packages/shared/src/constants.ts:40`; `packages/contracts/src/HotelNights.sol:449`, `:512`; `docs/adr/ADR-18-royalty-por-tipo-inmutable.md:1`). El comprador paga el precio que anunció el vendedor (`packages/contracts/src/HotelNights.sol:248`). El dinero del vendedor no se le envía al instante: queda apuntado a su nombre para que lo cobre cuando quiera (`docs/adr/ADR-15-pull-over-push.md:1`).

## Recorrido real

1. Abre `/reventa` desde el menú de la cabecera: está en el desplegable «Descubre» (`apps/web/src/components/layout/SiteHeader.tsx:72`).
2. Verás el título «Mercado de reventa» y la explicación de que son noches que otras personas ya compraron (`apps/web/src/app/reventa/page.tsx:31`; `apps/web/messages/es.json:199`, `:200`).
3. Arriba hay un contador: «{count} noches en reventa» (`apps/web/src/components/resale/ResaleMarketClient.tsx:64`; `apps/web/messages/es.json:201`).
4. Cada tarjeta lleva la etiqueta coral `Reventa`, junto a la foto, la habitación, el tipo, la fecha y el precio que puso el vendedor (`apps/web/src/components/NightCard.tsx:28`; `apps/web/src/components/NightCard.tsx:106`).
5. Pulsa `Reservar reventa` en la que te guste (`apps/web/src/components/buy/BuyButton.tsx:123`; `apps/web/messages/es.json:269`).
6. Conecta la cartera y cambia de red si hace falta, igual que en el catálogo (`apps/web/src/components/buy/BuyButton.tsx:95`).
7. Se abre la ventana **Revisar tu reserva**, con las cinco líneas de siempre: `Habitación`, `Noche`, `Importe`, `Token` y `Contrato` (`apps/web/src/components/buy/PurchaseReviewDetails.tsx:18`).
8. Espera a que el sistema lea el precio del listado en la cadena (`apps/web/src/components/buy/usePurchaseReview.ts:96`).
9. Pulsa `Confirmar y firmar` y firma en tu cartera (`apps/web/src/components/buy/BuyButton.tsx:258`).
10. Verás «¡Noche reservada!», el recibo y el botón `Ver en Mis noches` (`apps/web/messages/es.json:302`; `apps/web/src/components/buy/BuyButton.tsx:265`).
11. En `/mis-noches` la noche aparece con la etiqueta `Tuya` (`apps/web/src/components/my-nights/MyNightCard.tsx:115`).

## Piezas de código implicadas

- Página del mercado: `apps/web/src/app/reventa/page.tsx:7`, `:14`, `:19`, `:36`, `:38`.
- Lectura de listados: `apps/web/src/lib/nights.ts:392`, `:397`, `:403`, `:409`, `:422`, `:447`, `:453`.
- Rejilla y estado vacío: `apps/web/src/components/resale/ResaleMarketClient.tsx:19`, `:29`, `:60`, `:64`, `:67`.
- Etiqueta de reventa: `apps/web/src/components/NightCard.tsx:28`.
- Botón y etiqueta `Reservar reventa`: `apps/web/src/components/buy/BuyButton.tsx:117`, `:123`.
- Revisión con precio del listado: `apps/web/src/components/buy/usePurchaseReview.ts:66`, `:75`, `:92`.
- Función `buyResale`: `packages/shared/src/domain/purchase-tx.ts:35`.
- Compra en el contrato: `packages/contracts/src/HotelNights.sol:241`, `:243`, `:248`, `:253`, `:257`, `:261`, `:266`.
- Royalty: `packages/contracts/src/HotelNights.sol:449`, `:456`, `:512`; `packages/shared/src/constants.ts:40`.
- Errores del contrato: `packages/contracts/src/IHotelNights.sol:67`, `:70`, `:71`, `:77`.
- Destino canónico: `apps/web/src/config/chain.ts:13`.

## Datos y estados

- **Campos de una noche en reventa** (`NightView`): identificador, habitación, fecha, tipo, precio en wei, tipo de venta `SECONDARY` y portada (`apps/web/src/lib/nights.ts:41`, `:437`).
- **Listado** (`Listing`): precio y si está activo (`packages/contracts/src/IHotelNights.sol:127`; `apps/web/src/lib/nights.ts:409`).
- **Comisión del hotel:** 5 % en simple y doble, 10 % en suite (`packages/shared/src/constants.ts:40`).
- **Quién recibe qué:** el vendedor cobra el precio menos la comisión; el hotel cobra la comisión; ambos quedan acreditados en el contrato (`packages/contracts/src/HotelNights.sol:253`, `:254`, `:259`, `:260`).
- **Mensajes reales:**
  - «Mercado de reventa» y «Noches que otras personas ya compraron y ahora revenden. La compra se firma igual que en el catálogo: revisas el precio on-chain antes de confirmar.» (`apps/web/messages/es.json:199`, `:200`).
  - «Sin noches en reventa» / «{count} noches en reventa» (`apps/web/messages/es.json:201`).
  - «Ahora mismo no hay noches en reventa» + «Cuando alguien ponga su noche a la venta aparecerá aquí. Mientras tanto, consulta las noches disponibles del hotel en el catálogo.» + botón `Ver noches disponibles` (`apps/web/messages/es.json:202`, `:203`, `:204`).
  - «No se pudo cargar el mercado de reventa. Revisa tu conexión e inténtalo de nuevo.» (`apps/web/messages/es.json:205`).
  - «Reservar reventa» (`apps/web/messages/es.json:269`).
- **Errores del contrato al comprar en reventa:** `NotListed` (el listado ya no está), `NightNotResellable` (la noche se consumió), `NightExpired` (la fecha pasó) e `IncorrectPayment` (el importe no es el del listado) (`packages/contracts/src/IHotelNights.sol:71`, `:77`, `:67`, `:70`).
- **Suelo de precio de listado.** El hotel puede fijar un precio mínimo para publicar una reventa; afecta al vendedor, no al comprador (`docs/adr/ADR-19-suelo-de-precio-de-listado.md:1`).

## Casos límite y errores

- **No hay noches en reventa.** Estado vacío con explicación y enlace al catálogo (`apps/web/src/components/resale/ResaleMarketClient.tsx:29`).
- **No se pudo cargar el mercado.** Estado degradado con `Reintentar` y mensaje propio del mercado (`apps/web/src/app/reventa/page.tsx:36`).
- **Listado retirado o vendido entre la lectura y la firma.** La revisión no queda verificada y no se firma; el sistema avisa de que el precio cambió y pide volver a abrir la reserva (`apps/web/messages/es.json:286`).
- **Noche consumida en recepción después de listarse.** El mercado la descarta antes de ofrecerla, y la cadena la rechaza con `NightNotResellable` si llegara a firmarse (`apps/web/src/lib/nights.ts:410`; `packages/contracts/src/IHotelNights.sol:77`).
- **Noche caducada.** Se descarta por la ventana de fechas y la cadena devuelve `NightExpired` (`apps/web/src/lib/nights.ts:422`; `packages/contracts/src/IHotelNights.sol:67`).
- **Importe distinto del listado.** La cadena rechaza la operación con `IncorrectPayment`; el comprador paga exactamente el precio anunciado (`packages/contracts/src/HotelNights.sol:248`; `packages/contracts/src/IHotelNights.sol:70`).
- **Fallo de lectura de la cadena.** Si ninguna lectura de listados responde, el mercado va a estado degradado en vez de decir que no hay reventa (`apps/web/src/lib/nights.ts:447`).
- **Contrato en pausa.** La compra de reventa también lleva la condición de no pausado; se muestra el aviso de pausa y se retira el botón (`packages/contracts/src/HotelNights.sol:241`; `apps/web/src/components/resale/ResaleMarketClient.tsx:60`).
- **El vendedor no cobra al instante.** Su parte queda apuntada y la retira él cuando quiere, desde `/mis-noches` (`docs/adr/ADR-15-pull-over-push.md:1`).
- **Red de pruebas.** La compra funciona sobre una red de pruebas; no es venta al público todavía (`docs/manual-comprador.md:257`).

## Referencias

- CU-07 · Comprar una noche que otro cliente revende (`docs/Manuales/05-casos-de-uso/04-ventas/CU-07-compra-secundaria.md:1`).
- CU-06 · Poner mi noche en reventa (y quitarla) (`docs/Manuales/05-casos-de-uso/04-ventas/CU-06-listar-reventa.md:1`).
- CU-05 · Comprar una noche al hotel (`docs/Manuales/05-casos-de-uso/04-ventas/CU-05-compra-primaria.md:1`).
- Guía del comprador, apartados 3 y 6 (`docs/manual-comprador.md:63`, `:156`).
- ADR-11 · Nunca se firma una transacción no verificada (`docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md:1`).
- ADR-15 · Pull over push (`docs/adr/ADR-15-pull-over-push.md:1`).
- ADR-18 · Royalty por tipo de habitación, inmutable (`docs/adr/ADR-18-royalty-por-tipo-inmutable.md:1`).
- ADR-19 · Suelo de precio de listado, gobernable y nunca nulo (`docs/adr/ADR-19-suelo-de-precio-de-listado.md:1`).
- SRS §7 (interfaz y accesibilidad) y §9 (catálogo de casos de uso) (`docs/SRS.md:306`, `:342`).
