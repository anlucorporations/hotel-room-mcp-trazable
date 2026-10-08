# Ver tus noches y su estado

> El huésped consulta en «Mis noches» qué fichas tiene, si están libres o puestas en reventa, y qué saldo puede cobrar.

## Qué hace el sistema

«Mis noches» vive en `/mis-noches` (`apps/web/src/app/mis-noches/page.tsx:8`). Es una pantalla de cliente: necesita la cartera conectada y en la red correcta. Si no lo está, en lugar de la lista aparece el aviso «Conecta tu wallet para ver y gestionar tus noches.» y la barra de conexión (`apps/web/src/components/my-nights/MyNights.tsx:60`; `apps/web/messages/es.json:321`).

Para saber qué noches tiene el huésped, el sistema no se fía de una lista guardada. Hace tres comprobaciones contra la cadena (`apps/web/src/components/my-nights/useMyNights.ts:237`):

1. Busca los eventos de venta en los que el huésped fue el comprador, para tener candidatas (`apps/web/src/components/my-nights/useMyNights.ts:116`).
2. Confirma la propiedad actual de cada candidata con el dueño real de la ficha; así desaparecen las que ya revendió o traspasó (`apps/web/src/components/my-nights/useMyNights.ts:91`, `:131`).
3. Lee el estado de reventa de cada noche que sigue siendo suya (`apps/web/src/components/my-nights/useMyNights.ts:137`).

Además, el sistema lee el saldo pendiente de cobro de sus reventas (`apps/web/src/components/my-nights/useMyNights.ts:199`). Ese saldo no llega solo a la cartera: el contrato lo deja apuntado a nombre del vendedor y él lo retira cuando quiere (`docs/adr/ADR-15-pull-over-push.md:1`).

La pantalla separa las noches en dos pestañas: **Próximas** (desde hoy en adelante) y **Pasadas** (anteriores a hoy). La comparación se hace en UTC, con la misma codificación de fecha que usa la ficha (`apps/web/src/components/my-nights/MyNights.tsx:17`, `:51`).

Cada noche poseída se pinta en una tarjeta con su foto, habitación, tipo y fecha (`apps/web/src/components/my-nights/MyNightCard.tsx:100`). La etiqueta de estado es `Tuya` si no está en venta, y `En reventa` si tiene un listado activo (`apps/web/src/components/my-nights/MyNightCard.tsx:40`, `:112`). Desde esa tarjeta también se emite el resguardo de check-in con su código QR (`apps/web/src/components/my-nights/TicketView.tsx:21`).

Hay una pantalla hermana, `/mis-noches/mis-reventas`, con lo que el huésped tiene publicado y lo que ya ha vendido (`apps/web/src/app/mis-noches/mis-reventas/page.tsx:9`).

## Recorrido real

1. Abre `/mis-noches`. Está en el menú de la cabecera, dentro del desplegable «Descubre», con el rótulo `Mis noches` (`apps/web/src/components/layout/SiteHeader.tsx:73`; `apps/web/messages/es.json:319`).
2. Si no tienes la cartera conectada o estás en otra red, verás «Conecta tu wallet para ver y gestionar tus noches.» y la barra de conexión (`apps/web/src/components/my-nights/MyNights.tsx:60`; `apps/web/messages/es.json:321`).
3. Mientras carga, aparece «Cargando tus noches…» (`apps/web/src/components/my-nights/MyNights.tsx:69`; `apps/web/messages/es.json:322`).
4. Arriba del listado hay un aviso y un enlace: «¿Quieres gestionar lo que tienes en venta?» → `Ir a Mis reventas` (`apps/web/src/components/my-nights/MyNights.tsx:100`; `apps/web/messages/es.json:361`, `:362`).
5. Si tienes dinero de reventas pendiente, aparece el panel **Saldo pendiente** con el aviso «Tienes fondos de reventas listos para cobrar.» y el botón `Cobrar {amount}` (`apps/web/src/components/my-nights/MyNights.tsx:112`; `apps/web/src/components/my-nights/ClaimPanel.tsx:30`; `apps/web/messages/es.json:345`, `:346`, `:347`).
6. Cambia entre `Próximas` y `Pasadas` con el conmutador de dos botones (`apps/web/src/components/my-nights/MyNights.tsx:114`; `apps/web/messages/es.json:329`, `:330`).
7. Cada tarjeta muestra la foto, `Habitación N`, el tipo, la fecha y la etiqueta `Tuya` o `En reventa` (`apps/web/src/components/my-nights/MyNightCard.tsx:103`, `:110`, `:112`; `apps/web/messages/es.json:335`, `:336`).
8. Si la noche está en reventa, debajo de la etiqueta se lee «Precio de reventa: {price}» (`apps/web/src/components/my-nights/MyNightCard.tsx:122`; `apps/web/messages/es.json:337`).
9. En cada tarjeta hay un bloque **Resguardo de check-in** con el botón `Ver mi resguardo QR` (`apps/web/src/components/my-nights/TicketView.tsx:28`; `apps/web/messages/es.json:365`, `:367`).
10. Si no tienes ninguna noche, el aviso es «Todavía no posees ninguna noche.» con un botón `Explorar noches` (`apps/web/src/components/my-nights/MyNights.tsx:147`, `:154`; `apps/web/messages/es.json:325`).
11. En la pestaña `Pasadas`, cada tarjeta ofrece además el formulario para reseñar la noche (`apps/web/src/components/my-nights/MyNights.tsx:168`; `apps/web/src/components/my-nights/MyNightCard.tsx:209`).
12. En `/mis-noches/mis-reventas` ves dos secciones: `Publicadas` y `Vendidas`, con la noche, el precio y el comprador acortado (`apps/web/src/components/my-nights/MyResales.tsx:103`, `:125`, `:143`; `apps/web/messages/es.json:1092`, `:1095`, `:1097`).

## Piezas de código implicadas

- Página: `apps/web/src/app/mis-noches/page.tsx:8`, `:17`.
- Pantalla de reventas del huésped: `apps/web/src/app/mis-noches/mis-reventas/page.tsx:9`, `:18`.
- Lista y pestañas: `apps/web/src/components/my-nights/MyNights.tsx:36`, `:39`, `:51`, `:60`, `:69`, `:77`, `:100`, `:112`, `:114`, `:147`, `:168`.
- Descubrimiento de noches: `apps/web/src/components/my-nights/useMyNights.ts:91`, `:110`, `:116`, `:131`, `:137`, `:199`, `:221`, `:240`.
- Tarjeta de una noche propia: `apps/web/src/components/my-nights/MyNightCard.tsx:21`, `:40`, `:103`, `:112`, `:119`, `:122`, `:209`, `:215`.
- Cobro del saldo pendiente: `apps/web/src/components/my-nights/ClaimPanel.tsx:13`, `:30`, `:38`; `apps/web/src/components/my-nights/useClaim.ts:24`, `:28`.
- Resguardo de check-in: `apps/web/src/components/my-nights/TicketView.tsx:21`, `:28`, `:42`, `:61`; `apps/web/src/components/my-nights/useTicket.ts:44`, `:94`.
- Mis reventas: `apps/web/src/components/my-nights/MyResales.tsx:24`, `:44`, `:94`, `:103`, `:125`, `:156`.
- Errores de reventa traducidos: `apps/web/src/components/my-nights/resaleErrorMessage.ts:7`, `:60`.
- Lecturas del contrato: `packages/contracts/src/HotelNights.sol:414`, `:419`, `:429`, `:434`.
- Entrada desde la cabecera: `apps/web/src/components/layout/SiteHeader.tsx:73`.

## Datos y estados

- **Campos de una noche propia** (`OwnedNight`): identificador, habitación, fecha, tipo, precio del listado si está en venta y portada opcional (`apps/web/src/components/my-nights/useMyNights.ts:16`).
- **Datos de la pantalla** (`MyNightsData`): lista de noches, saldo pendiente en wei y lista de reventas vendidas (`apps/web/src/components/my-nights/useMyNights.ts:44`).
- **Estados visibles de la tarjeta:** `Tuya` cuando no hay listado; `En reventa` cuando el listado está activo (`apps/web/src/components/my-nights/MyNightCard.tsx:40`, `:112`; `apps/web/messages/es.json:335`, `:336`).
- **Pestañas:** `Próximas` y `Pasadas`, filtradas por fecha UTC (`apps/web/src/components/my-nights/MyNights.tsx:51`; `apps/web/messages/es.json:329`, `:330`).
- **Estados de carga:** cargando, error con `Reintentar`, vacío (`apps/web/src/components/my-nights/MyNights.tsx:69`, `:77`, `:147`).
- **Mensajes reales:**
  - «Conecta tu wallet para ver y gestionar tus noches.» (`apps/web/messages/es.json:321`).
  - «Cargando tus noches…» (`apps/web/messages/es.json:322`).
  - «No se pudieron cargar tus noches. Inténtalo de nuevo.» + `Reintentar` (`apps/web/messages/es.json:323`, `:324`).
  - «Todavía no posees ninguna noche.» (`apps/web/messages/es.json:325`).
  - «No tienes noches próximas.» / «No tienes noches pasadas.» (`apps/web/messages/es.json:326`, `:327`).
  - «Explorar noches» (`apps/web/messages/es.json:332`).
  - «Saldo pendiente» + «Tienes fondos de reventas listos para cobrar.» + «Cobrar {amount}» (`apps/web/messages/es.json:345`, `:346`, `:347`).
  - «No se pudo completar la operación. Revisa la red y vuelve a intentarlo.» (`apps/web/messages/es.json:351`).
  - «Resguardo de check-in» + «Genera el resguardo de esta noche para enseñarlo en recepción. Te pediremos una firma para comprobar que la noche es tuya.» (`apps/web/messages/es.json:365`, `:366`).
  - «Conecta tu cartera para obtener el resguardo.» y «Firma cancelada en tu cartera.» (`apps/web/src/components/my-nights/useTicket.ts:64`, `:116`).
  - «No se pudo emitir el resguardo. Inténtalo de nuevo.» (`apps/web/src/components/my-nights/useTicket.ts:34`).
  - En `Mis reventas`: «Tienes {count} reventa(s) nueva(s) desde tu última visita.» + `Marcar como vistas` (`apps/web/messages/es.json:1090`, `:1091`); «No tienes ninguna noche publicada ahora mismo.» (`apps/web/messages/es.json:1093`); «Todavía no has vendido ninguna noche.» (`apps/web/messages/es.json:1096`).
- **Errores de reventa que puede ver:** «No eres la propietaria de esta noche.», «El precio debe ser mayor que 0.», «La noche ha expirado y no puede listarse.», «Esta noche no está en reventa.», «El precio está por debajo del mínimo de reventa que fija el hotel.» y «Esta noche ya se consumió en recepción y no puede revenderse.» (`apps/web/messages/es.json:354`, `:355`, `:356`, `:357`, `:358`, `:359`).
- **Consulta de la cadena:** propiedad con el dueño real (`apps/web/src/components/my-nights/useMyNights.ts:100`), listado (`apps/web/src/components/my-nights/useMyNights.ts:143`; `packages/contracts/src/HotelNights.sol:429`) y saldo pendiente (`apps/web/src/components/my-nights/useMyNights.ts:202`; `packages/contracts/src/HotelNights.sol:434`).

## Casos límite y errores

- **Sin cartera o en red equivocada.** No se muestra la lista: aparece el aviso y la barra para conectarse (`apps/web/src/components/my-nights/MyNights.tsx:60`).
- **Fallo al cargar.** Mensaje de error con botón `Reintentar`, que vuelve a ejecutar la consulta (`apps/web/src/components/my-nights/MyNights.tsx:77`, `:84`).
- **Sin noches.** Tres vacíos distintos según la pestaña y según si tiene alguna noche o ninguna (`apps/web/src/components/my-nights/MyNights.tsx:96`, `:147`).
- **Noche revendida o traspasada.** Si el huésped ya no es el dueño real, la noche desaparece de la lista aunque aparezca como comprador en el historial de eventos (`apps/web/src/components/my-nights/useMyNights.ts:91`).
- **Ficha quemada.** Si la consulta del dueño revierte porque la ficha ya no existe, se trata como «no es tuya» y no rompe la pantalla (`apps/web/src/components/my-nights/useMyNights.ts:104`).
- **Foto ausente.** Si una habitación no tiene foto, la tarjeta usa su imagen de tipo; la llamada de fotos falla en blando y nunca tumba la lista (`apps/web/src/components/my-nights/useMyNights.ts:221`).
- **Contrato en pausa y resguardo.** El resguardo se emite pidiendo una firma acotada en el tiempo y un nonce de un solo uso; si la firma se cancela, se dice tal cual (`apps/web/src/components/my-nights/useTicket.ts:39`, `:71`, `:116`).
- **Cobro fallido.** El saldo no se pierde: sigue apuntado a nombre del vendedor y se puede reintentar (`apps/web/src/components/my-nights/useClaim.ts:24`; `docs/adr/ADR-15-pull-over-push.md:1`).
- **Reventa ya consumida.** Una noche usada en recepción no puede revenderse ni volver a listarse (`packages/contracts/src/HotelNights.sol:217`; `apps/web/messages/es.json:359`).
- **Red de pruebas.** Todo funciona sobre una red de pruebas; no es venta al público todavía (`docs/manual-comprador.md:257`).

## Referencias

- CU-40 · El menú de la cartera y del usuario (`docs/Manuales/05-casos-de-uso/09-back-office-y-gobierno-v3/CU-40-menu-wallet.md:1`).
- CU-06 · Poner mi noche en reventa (y quitarla) (`docs/Manuales/05-casos-de-uso/04-ventas/CU-06-listar-reventa.md:1`).
- CU-36 · Que el huésped publique, cambie o retire su reventa (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-36-reventa-huesped.md:1`).
- CU-37 · Avisar al huésped cuando su reventa se mueve (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-37-avisos-reventa.md:1`).
- Guía del comprador, apartados 5, 6 y 7 (`docs/manual-comprador.md:139`, `:156`, `:190`).
- ADR-05 · Check-in anclado on-chain y resguardo de un solo uso (`docs/adr/ADR-05-check-in-on-chain.md:1`).
- ADR-09 · El bloque de despliegue es la fuente única del escaneo (`docs/adr/ADR-09-bloque-despliegue-fuente-unica.md:1`).
- ADR-15 · Pull over push (`docs/adr/ADR-15-pull-over-push.md:1`).
- SRS §9 (catálogo de casos de uso) (`docs/SRS.md:342`).
