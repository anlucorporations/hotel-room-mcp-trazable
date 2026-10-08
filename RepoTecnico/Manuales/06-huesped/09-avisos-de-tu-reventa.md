# Avisos cuando tu reventa se mueve

> El huésped se entera de que una noche que tenía en venta se ha vendido: con un cartel de novedades en «Mis reventas» y, si lo activa, con una notificación en el móvil.

## Qué hace el sistema

«Mis reventas» vive en `/mis-noches/mis-reventas` (`apps/web/src/app/mis-noches/mis-reventas/page.tsx:9`). Es una pantalla de cliente: sin cartera conectada o en una red equivocada no muestra nada más que el aviso y la barra de conexión (`apps/web/src/components/my-nights/MyResales.tsx:64`).

Hay dos canales de aviso, y son independientes.

**Canal dentro de la web (aviso in-app).** El sistema lee de la cadena los eventos `Sale` en los que el huésped figura como vendedor (`apps/web/src/components/my-nights/useMyNights.ts:169`), se queda solo con las reventas secundarias (`apps/web/src/components/my-nights/useMyNights.ts:176`) y guarda de cada una el bloque en que se cerró la venta (`apps/web/src/components/my-nights/useMyNights.ts:192`). Guarda también, en el almacenamiento local del navegador, el bloque más alto que el huésped ya había visto, con una clave por dirección (`apps/web/src/components/my-nights/MyResales.tsx:14`, `:39`). Una reventa es «nueva» si su bloque es mayor que ese bloque visto (`apps/web/src/components/my-nights/MyResales.tsx:49`). El contador del cartel es el número de reventas nuevas (`apps/web/src/components/my-nights/MyResales.tsx:96`). Al pulsar `Marcar como vistas`, el sistema escribe en el navegador el bloque de la reventa más reciente (`apps/web/src/components/my-nights/MyResales.tsx:56`, `:60`) y el contador vuelve a cero. Es estado de interfaz, no un dato del huésped.

**Canal al móvil (Web Push).** Es opcional. Al activarlo, el navegador pide permiso de notificaciones (`apps/web/src/components/push/useWebPush.ts:63`). Si el huésped acepta, el sistema pide al servidor la clave pública VAPID (`apps/web/src/components/push/useWebPush.ts:69`; `apps/web/src/app/api/push/vapid/route.ts:14`), registra el service worker `/sw.js` (`apps/web/src/components/push/useWebPush.ts:73`), crea la suscripción del navegador (`apps/web/src/components/push/useWebPush.ts:76`) y manda el endpoint y sus claves a `POST /api/push/subscribe` (`apps/web/src/components/push/useWebPush.ts:82`). El servidor valida que vengan `endpoint`, `keys.p256dh` y `keys.auth` y los guarda (`apps/web/src/app/api/push/subscribe/route.ts:20`, `:27`). La baja hace lo contrario: `POST /api/push/unsubscribe` con el endpoint (`apps/web/src/components/push/useWebPush.ts:103`) y después la desuscripción del navegador (`apps/web/src/components/push/useWebPush.ts:108`).

El envío real lo hace el worker al cerrar una venta: encola primero el correo y después difunde el push (`apps/worker/src/sale-notifier.ts:22`, `:26`). El envío va cifrado y firmado según RFC 8291/8292 (`packages/shared/src/push/web-push.ts:136`, `:105`). El push es **best-effort**: si falla, se registra el fallo y la venta sigue (`apps/worker/src/sale-notifier.ts:36`; `docs/adr/ADR-21-una-cola-y-un-planificador.md:29`). El canal con garantía es el correo, que va al hotel (`apps/worker/src/main.ts:94`).

El aviso no lleva datos personales del huésped: solo el título, la habitación, el tipo de noche y unos identificadores técnicos (`apps/worker/src/sale-notifier.ts:27`; `docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:13`). El envío es general, a todas las suscripciones activas: el código no filtra por vendedor (`packages/shared/src/push/service.ts:84`).

## Recorrido real

1. Abre `/mis-noches`. Está en el menú de la cabecera, en el desplegable «Descubre», con el rótulo `Mis noches` (`apps/web/src/components/layout/SiteHeader.tsx:73`; `apps/web/messages/es.json:125`, `:153`).
2. En esa pantalla, arriba del listado, lee «¿Quieres gestionar lo que tienes en venta?» y pulsa el enlace `Ir a Mis reventas` (`apps/web/src/components/my-nights/MyNights.tsx:104`; `apps/web/messages/es.json:361`, `:362`).
3. Si no tienes la cartera conectada o estás en otra red, verás «Conecta tu wallet para gestionar tus reventas.» y la barra de conexión (`apps/web/src/components/my-nights/MyResales.tsx:67`; `apps/web/messages/es.json:1086`).
4. Mientras carga, aparece «Cargando tus reventas…» (`apps/web/src/components/my-nights/MyResales.tsx:76`; `apps/web/messages/es.json:1087`).
5. Si hay reventas nuevas desde tu última visita, arriba del todo sale el cartel de novedades con el texto «Tienes {count} reventa(s) nueva(s) desde tu última visita.» y el botón `Marcar como vistas` (`apps/web/src/components/my-nights/MyResales.tsx:96`, `:98`; `apps/web/messages/es.json:1090`, `:1091`).
6. Pulsa `Marcar como vistas`. El cartel desaparece y el contador queda a cero (`apps/web/src/components/my-nights/MyResales.tsx:56`).
7. En la sección `Publicadas` ves las noches que tienes en venta, con el enlace `Publicar otra noche`; si no hay ninguna, se lee «No tienes ninguna noche publicada ahora mismo.» (`apps/web/src/components/my-nights/MyResales.tsx:103`, `:109`, `:113`; `apps/web/messages/es.json:1092`, `:1093`, `:1094`).
8. Baja a la sección `Vendidas`. Es una tabla con tres columnas: `Noche`, `Precio` y `Comprador` (`apps/web/src/components/my-nights/MyResales.tsx:127`, `:137`, `:138`, `:139`; `apps/web/messages/es.json:1095`, `:1097`, `:1098`, `:1099`). Si aún no has vendido nada, se lee «Todavía no has vendido ninguna noche.» (`apps/web/src/components/my-nights/MyResales.tsx:130`; `apps/web/messages/es.json:1096`).
9. Cada fila muestra la fecha y la habitación, el precio en ETH y la dirección del comprador acortada (`apps/web/src/components/my-nights/MyResales.tsx:145`, `:146`, `:147`).
10. Si te queda saldo de reventas por cobrar, aparece el panel de cobro (`apps/web/src/components/my-nights/MyResales.tsx:156`).
11. Para activar el aviso al móvil, baja al bloque **Avisos al móvil** y pulsa `Activar avisos` (`apps/web/src/components/my-nights/MyResales.tsx:160`, `:171`; `apps/web/messages/es.json:1100`, `:1104`). Mientras trabaja, el botón pone `Procesando…` (`apps/web/src/components/my-nights/MyResales.tsx:172`; `apps/web/messages/es.json:1106`).
12. El navegador te pide permiso de notificaciones. Acepta (`apps/web/src/components/push/useWebPush.ts:63`).
13. El sistema registra tu dispositivo y el botón cambia a `Desactivar avisos` (`apps/web/src/components/my-nights/MyResales.tsx:168`; `apps/web/src/components/push/useWebPush.ts:88`; `apps/web/messages/es.json:1105`).
14. Cuando se venda una noche, el móvil muestra una notificación con el título «Noche vendida» y la habitación y el tipo (`apps/worker/src/sale-notifier.ts:27`, `:28`; `apps/web/public/sw.js:23`).
15. Al pulsar la notificación, el navegador abre `/historico`, la página del histórico de ventas (`apps/worker/src/sale-notifier.ts:29`; `apps/web/public/sw.js:29`).
16. Para dejarlo, vuelve a pulsar el botón, ahora `Desactivar avisos` (`apps/web/src/components/my-nights/MyResales.tsx:167`; `apps/web/src/components/push/useWebPush.ts:103`).

## Piezas de código implicadas

- Página de la pantalla: `apps/web/src/app/mis-noches/mis-reventas/page.tsx:9`, `:15`, `:18`.
- Pantalla y aviso in-app: `apps/web/src/components/my-nights/MyResales.tsx:14`, `:17`, `:24`, `:29`, `:39`, `:49`, `:54`, `:60`, `:67`, `:76`, `:84`, `:94`, `:96`, `:98`, `:103`, `:113`, `:127`, `:133`, `:145`, `:156`, `:158`, `:160`, `:162`, `:164`, `:167`, `:171`.
- Lectura on-chain de las reventas vendidas: `apps/web/src/components/my-nights/useMyNights.ts:33`, `:41`, `:49`, `:169`, `:176`, `:182`, `:192`, `:196`.
- Enlace de entrada desde «Mis noches»: `apps/web/src/components/my-nights/MyNights.tsx:104`; `apps/web/src/components/layout/SiteHeader.tsx:73`.
- Cliente de Web Push: `apps/web/src/components/push/useWebPush.ts:14`, `:17`, `:38`, `:42`, `:47`, `:63`, `:69`, `:71`, `:73`, `:76`, `:82`, `:87`, `:100`, `:103`, `:108`.
- Service worker: `apps/web/public/sw.js:8`, `:16`, `:19`, `:23`, `:26`, `:29`.
- Rutas de API: `apps/web/src/app/api/push/vapid/route.ts:13`, `:14`, `:17`; `apps/web/src/app/api/push/subscribe/route.ts:16`, `:20`, `:22`, `:27`, `:31`; `apps/web/src/app/api/push/unsubscribe/route.ts:17`, `:21`, `:31`, `:36`, `:40`.
- Servicio de envío y cifrado: `packages/shared/src/push/service.ts:5`, `:45`, `:55`, `:68`, `:83`, `:84`, `:108`, `:110`; `packages/shared/src/push/web-push.ts:105`, `:136`, `:203`, `:223`, `:239`.
- Disparo desde el worker: `apps/worker/src/sale-notifier.ts:14`, `:22`, `:26`, `:27`, `:28`, `:29`, `:36`, `:49`; `apps/worker/src/main.ts:93`.
- Persistencia de suscripciones: `packages/shared/src/db/repositories/nfts.repository.ts:476`, `:489`, `:496`; `packages/shared/src/db/migrator.ts:153`, `:161`.
- Rótulos de la pantalla: `apps/web/messages/es.json:1083`, `:1084`, `:1085`, `:1086`, `:1087`, `:1088`, `:1089`, `:1090`, `:1091`, `:1092`, `:1093`, `:1094`, `:1095`, `:1096`, `:1097`, `:1098`, `:1099`, `:1100`, `:1101`, `:1102`, `:1103`, `:1104`, `:1105`, `:1106`.

## Datos y estados

- **Una reventa vendida** (`ResaleSale`): identificador de la noche, habitación, fecha, tipo, precio en wei, comprador y número de bloque (`apps/web/src/components/my-nights/useMyNights.ts:33`). El bloque es la marca que decide si la reventa es nueva (`apps/web/src/components/my-nights/useMyNights.ts:41`).
- **Datos de la pantalla** (`MyNightsData`): noches poseídas, saldo pendiente en wei y lista de reventas vendidas, más recientes primero (`apps/web/src/components/my-nights/useMyNights.ts:44`).
- **Una noche poseída** (`OwnedNight`): si su `listingPriceWei` no es nulo, está publicada (`apps/web/src/components/my-nights/useMyNights.ts:16`, `:22`).
- **Estados del aviso al móvil** (`WebPushState`): `unsupported`, `default`, `denied` y `subscribed` (`apps/web/src/components/push/useWebPush.ts:14`). La pantalla decide con ellos si enseña el texto de no soportado, el botón de activar o el de desactivar (`apps/web/src/components/my-nights/MyResales.tsx:164`, `:166`, `:170`).
- **Carga del aviso de venta** (`PushNotificationPayload`): título, cuerpo, URL y datos (`packages/shared/src/push/service.ts:5`). En la venta real: título «Noche vendida», cuerpo con la habitación, el tipo y `venta secundaria` o `venta primaria` (`apps/worker/src/sale-notifier.ts:27`, `:28`) y URL `/historico` (`apps/worker/src/sale-notifier.ts:29`).
- **Suscripción guardada** (`push_subscriptions`): endpoint único, `keys_p256dh`, `keys_auth` y fecha de alta (`packages/shared/src/db/migrator.ts:153`). No hay ninguna columna con nombre, correo o teléfono del huésped.
- **Marca de visto**: clave `hotel-resales-seen:<dirección>` en el almacenamiento local del navegador (`apps/web/src/components/my-nights/MyResales.tsx:14`, `:39`).
- **Estados de carga de la pantalla:** cargando, error con `Reintentar`, vacío de publicadas, vacío de vendidas (`apps/web/src/components/my-nights/MyResales.tsx:76`, `:84`, `:113`, `:130`).
- **Mensajes reales de la pantalla:**
  - «Mis reventas» y «Gestiona las noches que has puesto en venta y consulta las que ya has vendido.» (`apps/web/messages/es.json:1084`, `:1085`).
  - «Conecta tu wallet para gestionar tus reventas.» (`apps/web/messages/es.json:1086`).
  - «Cargando tus reventas…» (`apps/web/messages/es.json:1087`).
  - «No se pudieron cargar tus reventas. Inténtalo de nuevo.» + «Reintentar» (`apps/web/messages/es.json:1088`, `:1089`).
  - «Tienes {count} reventa(s) nueva(s) desde tu última visita.» + «Marcar como vistas» (`apps/web/messages/es.json:1090`, `:1091`).
  - «Publicadas» + «Publicar otra noche» + «No tienes ninguna noche publicada ahora mismo.» (`apps/web/messages/es.json:1092`, `:1093`, `:1094`).
  - «Vendidas» + «Todavía no has vendido ninguna noche.» + «Noche» + «Precio» + «Comprador» (`apps/web/messages/es.json:1095`, `:1096`, `:1097`, `:1098`, `:1099`).
  - «Avisos al móvil» + «Recibe un aviso cuando se venda alguna de tus noches. Es anónimo y puedes desactivarlo cuando quieras.» (`apps/web/messages/es.json:1100`, `:1101`).
  - «No se pudieron activar los avisos.» (el error que ve el huésped cuando la activación falla) (`apps/web/messages/es.json:1102`).
  - «Tu navegador no admite avisos push.» (`apps/web/messages/es.json:1103`).
  - «Activar avisos» + «Desactivar avisos» + «Procesando…» (`apps/web/messages/es.json:1104`, `:1105`, `:1106`).
- **Mensajes reales de la API** (los ve el sistema, no el huésped; la pantalla enseña el texto genérico anterior): «Payload de suscripción push incompleto» y «Suscripción a notificaciones Web Push registrada exitosamente» (`apps/web/src/app/api/push/subscribe/route.ts:22`, `:31`); «Endpoint requerido para cancelar suscripción» y «Suscripción a notificaciones cancelada exitosamente» (`apps/web/src/app/api/push/unsubscribe/route.ts:31`, `:40`); «Las notificaciones push no están configuradas.» (`apps/web/src/app/api/push/vapid/route.ts:17`).
- **Los rótulos viven en el espacio `myResales`** de `apps/web/messages/es.json`; no existe un espacio `push` aparte (`apps/web/messages/es.json:1083`).

## Casos límite y errores

- **El navegador no admite avisos.** Si no hay `serviceWorker` ni `PushManager`, el estado es `unsupported` y en lugar del botón se lee «Tu navegador no admite avisos push.» (`apps/web/src/components/push/useWebPush.ts:38`; `apps/web/src/components/my-nights/MyResales.tsx:164`; `apps/web/messages/es.json:1103`).
- **Permiso denegado.** Si el permiso está denegado, el estado es `denied` (`apps/web/src/components/push/useWebPush.ts:42`). Al intentar activar, si el permiso no se concede, el cliente lanza el error `denied` y no se suscribe nada (`apps/web/src/components/push/useWebPush.ts:66`). En pantalla solo se ve «No se pudieron activar los avisos.» (`apps/web/src/components/my-nights/MyResales.tsx:162`; `apps/web/messages/es.json:1102`). Hay que cambiarlo en los ajustes del navegador.
- **El servidor no tiene las claves VAPID.** Si falta `VAPID_PUBLIC_KEY`, `/api/push/vapid` responde 503 con `{ publicKey: null }` y el mensaje «Las notificaciones push no están configuradas.» (`apps/web/src/app/api/push/vapid/route.ts:15`, `:17`). El cliente lanza `no-key` y el botón vuelve a `Activar avisos` con el aviso de error, porque el botón no se deshabilita por configuración del servidor, solo por navegador no soportado (`apps/web/src/components/push/useWebPush.ts:71`). En el worker, sin las tres claves VAPID no se envía nada y se anota el motivo en el registro (`apps/worker/src/sale-notifier.ts:50`, `:54`).
- **Fallo al registrar la suscripción.** Si `POST /api/push/subscribe` no responde con éxito, el cliente lanza `subscribe-failed` y el estado no pasa a `subscribed` (`apps/web/src/components/push/useWebPush.ts:87`).
- **Claves VAPID mal formadas.** El servidor falla en cerrado: si la privada no mide 32 bytes o la pública no mide 65, el envío lanza un error en lugar de usar un literal por defecto (`packages/shared/src/push/service.ts:68`; `packages/shared/src/push/web-push.ts:69`, `:82`).
- **La entrega falla o la suscripción ya no existe.** El envío no lanza: devuelve el resultado (`packages/shared/src/push/web-push.ts:203`). Si el servicio de push contesta 404 o 410, la suscripción se marca como desaparecida y se borra de la base (`packages/shared/src/push/web-push.ts:239`; `packages/shared/src/push/service.ts:110`). El resto de fallos se cuentan y se registran, sin bloquear la venta (`packages/shared/src/push/service.ts:114`; `apps/worker/src/sale-notifier.ts:36`).
- **El aviso al móvil llega por una venta que no es tuya.** El envío es general, a todas las suscripciones activas; no filtra por vendedor (`packages/shared/src/push/service.ts:84`). El cartel de la web, en cambio, sale solo de tus reventas (`apps/web/src/components/my-nights/useMyNights.ts:169`).
- **La notificación abre otra página.** La venta apunta a `/historico`, no a `Mis reventas` (`apps/worker/src/sale-notifier.ts:29`). El service worker solo usa `/mis-noches/mis-reventas` cuando el aviso no trae URL (`apps/web/public/sw.js:19`).
- **La marca de visto es por navegador.** El bloque visto se guarda en el almacenamiento local de ese navegador y por dirección (`apps/web/src/components/my-nights/MyResales.tsx:39`). Si cambias de dispositivo, no hay marca guardada: el valor inicial es cero y todas las reventas del historial cuentan como nuevas (`apps/web/src/components/my-nights/MyResales.tsx:29`, `:40`, `:50`).
- **Fallo al cargar la lista.** Se muestra «No se pudieron cargar tus reventas. Inténtalo de nuevo.» con el botón `Reintentar`, que vuelve a lanzar la consulta (`apps/web/src/components/my-nights/MyResales.tsx:84`, `:85`).
- **Sin cartera o en red equivocada.** No se carga la lista: aparece «Conecta tu wallet para gestionar tus reventas.» y la barra de conexión (`apps/web/src/components/my-nights/MyResales.tsx:64`, `:67`).
- **Baja con una suscripción ya perdida.** La baja solo actúa si el navegador todavía tiene una suscripción; si no la hay, deja el estado en `default` sin llamar a la API (`apps/web/src/components/push/useWebPush.ts:100`, `:102`, `:110`).

## Referencias

- CU-37 · Avisar al huésped cuando su reventa se mueve (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-37-avisos-reventa.md:1`).
- RF-37 y RF-37.1 · avisos in-app y Web Push anónimo (`RepoTecnico/incremento_v2/requerimientos_incremento.md:54`, `:55`).
- RNF-30 · privacidad y PII-free (`RepoTecnico/incremento_v2/requerimientos_incremento.md:63`).
- D-36 · avisos in-app más Web Push anónimo, sin recoger correo (`RepoTecnico/incremento_v2/requerimientos_incremento.md:20`).
- SRS §9, catálogo de casos de uso, fila de CU-37 (`docs/SRS.md:373`).
- SRS, rutas públicas de push (`docs/SRS.md:205`).
- ADR-21 · Una cola única de correo y un planificador en el worker; el push es best-effort y nunca bloquea una venta (`docs/adr/ADR-21-una-cola-y-un-planificador.md:29`).
- ADR-24 · Minimización de PII: las suscripciones de push son opt-in con baja y purga de las caducadas (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:13`).
- ADR-03 · PostgreSQL como única persistencia, incluida la tabla de suscripciones (`docs/adr/ADR-03-postgresql-unica-persistencia.md:1`).
- ADR-09 · El bloque de despliegue es la fuente única del escaneo (`docs/adr/ADR-09-bloque-despliegue-fuente-unica.md:1`).
