# CU-37 · Avisar al huésped cuando su reventa se mueve — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Huésped · Requisitos: RF-37, RF-37.1, RNF-30

## 1. Ficha y trazabilidad

- **Objetivo.** Que el huésped se entere de que una de sus noches publicadas se ha vendido: aviso
  dentro de la aplicación y, si lo ha aceptado, notificación push en el móvil.
- **Actor primario.** Huésped con noches publicadas o vendidas
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:285`).
- **Requisitos que cubre.** RF-37 y RF-37.1, con el límite de RNF-30: avisos **sin** recoger ni
  almacenar datos personales (`RepoTecnico/incremento_v2/casos_uso_incremento.md:286`, `:306`).
- **Precondición.** Hay al menos una venta secundaria en la que el usuario figura como vendedor
  (`apps/web/src/components/my-nights/useMyNights.ts:162`).
- **Disparador.** El worker procesa el evento `Sale` on-chain con `saleType = SECONDARY`
  (`apps/worker/src/sale-notifier.ts:21`), o el huésped abre **Mis reventas**.
- **Postcondición.** La venta aparece en **Vendidas** con importe y comprador
  (`apps/web/src/components/my-nights/MyResales.tsx:143`) y, si hay suscripción push activa, el
  navegador muestra la notificación (`apps/web/public/sw.js:23`).
- **Dónde vive.**
  - UI in-app: `apps/web/src/components/my-nights/MyResales.tsx:24` (aviso en `:94`; **Vendidas** en `:125`).
  - Push (cliente): `apps/web/src/components/push/useWebPush.ts:26` y `apps/web/public/sw.js:8`.
  - Suscripción: `apps/web/src/app/api/push/vapid/route.ts:13`,
    `apps/web/src/app/api/push/subscribe/route.ts:16` y
    `apps/web/src/app/api/push/unsubscribe/route.ts:17`.
  - Envío: `apps/worker/src/sale-notifier.ts:14` y `packages/shared/src/push/service.ts:83`.
  - Contrato: solo como **origen** de los eventos `Sale`; el aviso no escribe on-chain.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El huésped entra en **Mis reventas**; la pantalla exige wallet conectada y red correcta
   (`apps/web/src/components/my-nights/MyResales.tsx:64`).
2. `useMyNights` lee los eventos `Sale` **como vendedor** desde el bloque de despliegue, paginando
   por tramos (`apps/web/src/components/my-nights/useMyNights.ts:162`, `:64`).
3. Filtra las ventas secundarias (`:169`) y construye `ResaleSale` con `buyer` y `blockNumber`
   (`:185`); las ordena de más reciente a más antigua (`:189`).
4. El aviso **in-app** compara el bloque de cada venta con el último bloque visto por esa dirección
   (`apps/web/src/components/my-nights/MyResales.tsx:49`), guardado en el navegador bajo la clave
   `hotel-resales-seen:<dirección>` (`MyResales.tsx:14`, `:39`, `:60`).
5. Si hay novedades, aparece el banner `data-testid="resales-news"` con el número de reventas nuevas
   (`apps/web/src/components/my-nights/MyResales.tsx:94`) y el botón **Marcar como vistas** (`:97`).
6. La tabla **Vendidas** muestra noche, precio en ETH y la dirección del comprador recortada
   (`apps/web/src/components/my-nights/MyResales.tsx:143`, `:145`, `:147`).
7. El huésped puede activar **Avisos al móvil** desde la misma pantalla
   (`apps/web/src/components/my-nights/MyResales.tsx:171`).
8. `useWebPush.enable` pide permiso al navegador (`apps/web/src/components/push/useWebPush.ts:63`),
   descarga la clave pública VAPID de `GET /api/push/vapid` (`:69`), registra `/sw.js` (`:73`) y se
   suscribe con `pushManager.subscribe` (`:76`).
9. Envía la suscripción a `POST /api/push/subscribe` con `{ endpoint, keys }` (`:82`).
10. El endpoint valida el cuerpo (`apps/web/src/app/api/push/subscribe/route.ts:20`) y llama a
    `WebPushService.subscribe`, que guarda la suscripción anónima
    (`packages/shared/src/push/service.ts:45`).
11. Cuando el worker procesa una venta, `SaleMailerWithPush.sendSaleEmail` encola primero el correo
    y después difunde el push (`apps/worker/src/sale-notifier.ts:21`, `:26`).
12. `broadcastNotification` recorre **todas** las suscripciones activas, cifra cada mensaje
    (RFC 8291) y lo entrega con VAPID (RFC 8292)
    (`packages/shared/src/push/service.ts:83`, `:96`).
13. El service worker recibe el evento `push` y muestra la notificación con la etiqueta
    `hotel-resale` (`apps/web/public/sw.js:8`, `:20`, `:23`).
14. Al pulsar la notificación se abre la URL del payload; por defecto `/mis-noches/mis-reventas`
    (`apps/web/public/sw.js:19`, `:28`).

### 2.2 Validaciones

- **Suscripción completa.** Sin `endpoint`, `p256dh` o `auth`, la API responde 400
  (`apps/web/src/app/api/push/subscribe/route.ts:20`) y el servicio rechaza datos incompletos
  (`packages/shared/src/push/service.ts:46`).
- **Soporte del navegador.** Sin `serviceWorker` o `PushManager`, el hook queda en `unsupported`
  (`apps/web/src/components/push/useWebPush.ts:38`) y la UI muestra `pushUnsupported`
  (`apps/web/src/components/my-nights/MyResales.tsx:164`).
- **Permiso denegado.** Si el permiso no es `granted`, no se suscribe y se informa
  (`apps/web/src/components/push/useWebPush.ts:64`).
- **Push no configurado.** Sin `VAPID_PUBLIC_KEY`, `GET /api/push/vapid` responde 503 con
  `publicKey: null` (`apps/web/src/app/api/push/vapid/route.ts:15`); el hook lo trata como error
  (`useWebPush.ts:71`).
- **Claves VAPID obligatorias.** `getVapidConfig` falla en cerrado si faltan claves
  (`packages/shared/src/push/service.ts:68`); el worker ni siquiera construye el servicio sin ellas
  (`apps/worker/src/sale-notifier.ts:50`).
- **Baja inmediata.** `disable` avisa al servidor y cancela la suscripción del navegador
  (`useWebPush.ts:103`, `:108`); la purga por 404/410 borra las muertas
  (`packages/shared/src/push/service.ts:108`).
- **Sin datos personales.** El payload solo lleva título, habitación, tipo y venta, más `tokenId` y
  `txHash` (`apps/worker/src/sale-notifier.ts:27`, `:30`); el service worker no guarda nada
  (`apps/web/public/sw.js:6`).

### 2.3 Efectos on-chain / persistencia

- **On-chain:** ninguno propio. La fuente son los eventos `Sale`
  (`packages/contracts/src/IHotelNights.sol:28`), emitidos en `buyResale`
  (`packages/contracts/src/HotelNights.sol:261`).
- **PostgreSQL:** las suscripciones viven en `push_subscriptions` (`endpoint`, `keys_p256dh`,
  `keys_auth`), con `endpoint` único (`packages/shared/src/db/migrator.ts:153`, `:155`).
- **Idempotencia de la suscripción:** `ON CONFLICT (endpoint) DO UPDATE` actualiza las claves en
  lugar de duplicar (`packages/shared/src/db/repositories/nfts.repository.ts:432`).
- **Navegador:** la marca de «última visita» es `localStorage`, estado de interfaz y no un dato del
  huésped (`apps/web/src/components/my-nights/MyResales.tsx:36`).
- **Best-effort:** un fallo del push se registra y **no** bloquea la venta; el canal con garantía es
  el correo (`apps/worker/src/sale-notifier.ts:11`, `:36`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Clave pública VAPID | `GET /api/push/vapid` | `apps/web/src/app/api/push/vapid/route.ts:13` |
| Alta de suscripción | `POST /api/push/subscribe` | `apps/web/src/app/api/push/subscribe/route.ts:16` |
| Baja | `POST` / `DELETE /api/push/unsubscribe` | `apps/web/src/app/api/push/unsubscribe/route.ts:17`, `:21` |
| Hook de suscripción | `useWebPush()` | `apps/web/src/components/push/useWebPush.ts:26` |
| Envío (difusión) | `WebPushService.broadcastNotification(payload)` | `packages/shared/src/push/service.ts:83` |
| Decorador del worker | `SaleMailerWithPush.sendSaleEmail` | `apps/worker/src/sale-notifier.ts:21` |
| Service worker | `self.addEventListener("push", …)` | `apps/web/public/sw.js:8` |

### 4.2 Eventos y errores canónicos

- **Evento on-chain de origen:** `Sale(uint256 indexed tokenId, address indexed seller, address
  indexed buyer, uint256 price, uint8 saleType)`
  (`packages/contracts/src/IHotelNights.sol:28`), con `SaleType.SECONDARY` para la reventa
  (`apps/web/src/components/my-nights/useMyNights.ts:50`).
- **Respuestas de la API de push:** 200 `{ status: "SUBSCRIBED" | "UNSUBSCRIBED" }`
  (`subscribe/route.ts:29`; `unsubscribe/route.ts:38`), 400 `BAD_REQUEST` por cuerpo incompleto
  (`subscribe/route.ts:22`; `unsubscribe/route.ts:31`) y 500 `SUBSCRIPTION_FAILED` /
  `UNSUBSCRIBE_FAILED` (`subscribe/route.ts:37`; `unsubscribe/route.ts:46`).
- **`GET /api/push/vapid`:** 200 `{ publicKey }` o 503 `{ publicKey: null }`
  (`apps/web/src/app/api/push/vapid/route.ts:11`).
- **Purga:** una entrega con 404/410 cuenta como `pruned` y borra la suscripción
  (`packages/shared/src/push/service.ts:108`).

### 4.3 Estructuras de datos y almacenamiento

- `PushNotificationPayload` (`packages/shared/src/push/service.ts:5`): `title`, `body`, `url` y
  `data`.
- `BroadcastResult` (`:18`): `sent`, `failed`, `pruned` y `total`.
- `ResaleSale` (`apps/web/src/components/my-nights/useMyNights.ts:26`): `tokenId`, `room`,
  `dateYYYYMMDD`, `type`, `priceWei`, `buyer` y `blockNumber`.
- Tabla `push_subscriptions` (`packages/shared/src/db/migrator.ts:153`) con índice por `endpoint`
  (`:161`).
- Acceso a datos: `addPushSubscription` (`packages/shared/src/db/repositories/nfts.repository.ts:430`),
  `removePushSubscription` (`:443`) y `getAllPushSubscriptions` (`:450`).
- Payload difundido por el worker: título «Noche vendida», cuerpo con habitación y tipo, `url`
  `/historico` y `data` con `tokenId` y `txHash` (`apps/worker/src/sale-notifier.ts:27`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Navegador sin Web Push | `pushUnsupported` | `apps/web/src/components/push/useWebPush.ts:38`; `MyResales.tsx:164` |
| El usuario deniega el permiso | Estado `denied` + `pushError` | `apps/web/src/components/push/useWebPush.ts:64`; `MyResales.tsx:162` |
| Sin claves VAPID en el servidor | 503 con `publicKey: null` | `apps/web/src/app/api/push/vapid/route.ts:15` |
| Suscripción incompleta | 400 `BAD_REQUEST` | `apps/web/src/app/api/push/subscribe/route.ts:20` |
| Baja sin `endpoint` | 400 `BAD_REQUEST` | `apps/web/src/app/api/push/unsubscribe/route.ts:29` |
| Suscripción caducada en el navegador | `pruned` + borrado | `packages/shared/src/push/service.ts:108` |
| Fallo de entrega del push | `failed` (no bloquea la venta) | `packages/shared/src/push/service.ts:113`; `sale-notifier.ts:36` |
| Sin novedades desde la última visita | No se pinta el banner | `apps/web/src/components/my-nights/MyResales.tsx:94` |
| Falla la lectura on-chain | Mensaje + **Reintentar** | `apps/web/src/components/my-nights/MyResales.tsx:81` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/push/push.test.ts:25`, `:36`: alta sin datos ⇒ 400; alta correcta ⇒ 200.
- `apps/web/src/app/api/push/push.test.ts:55`, `:66`, `:77`: baja sin `endpoint` ⇒ 400; baja por
  POST y por DELETE ⇒ 200.
- `packages/shared/src/push/push.test.ts:40`, `:54`, `:60`: registra una suscripción anónima
  opt-in, rechaza datos incompletos y elimina la suscripción.
- `packages/shared/src/push/push.test.ts:67`: sin suscriptores no hay envíos ni contadores
  inventados.
- `packages/shared/src/push/push.test.ts:78`: una entrega fallida cuenta como fallo.
- `packages/shared/src/push/web-push.test.ts:136`: entrega real a un servicio de push local, que
  descifra el contenido.
- `packages/shared/src/push/web-push.test.ts:199`, `:219`: una suscripción caducada (410) se purga y
  `broadcastNotification` cuenta entregas y purgas.
- **No cubierto:** no hay prueba del decorador `SaleMailerWithPush`
  (`apps/worker/src/sale-notifier.ts:14`), ni de `useWebPush`, ni del service worker
  `apps/web/public/sw.js`, ni del aviso in-app de `MyResales` (bloque visto y banner de novedades).
  La pantalla `/mis-noches/mis-reventas` no está en la auditoría de accesibilidad.

## 7. Pendiente de confirmar

- El escenario «Push anónimo» dice que, al venderse **su** noche, el sistema entrega una notificación
  push al huésped (`RepoTecnico/incremento_v2/casos_uso_incremento.md:297`). Lo implementado es una
  **difusión a todos los suscriptores**: `broadcastNotification` recorre toda la tabla
  `push_subscriptions` (`packages/shared/src/push/service.ts:84`, `:96`), sin filtrar por vendedor.
  El aviso es anónimo y sin PII (cumple RNF-30), pero **no está dirigido** al titular de la noche.
  Falta confirmar si el envío segmentado por dirección entra en un incremento posterior.
- El payload del push apunta a `/historico` (`apps/worker/src/sale-notifier.ts:29`), mientras que el
  service worker usa `/mis-noches/mis-reventas` por defecto (`apps/web/public/sw.js:19`): como el
  payload trae `url`, la notificación abre `/historico`, no la pantalla de reventas.
- El aviso in-app depende de `localStorage` por navegador
  (`apps/web/src/components/my-nights/MyResales.tsx:39`): si el huésped cambia de dispositivo o
  borra el almacenamiento, el contador de novedades se reinicia. No hay marca de «visto» en el
  servidor.
- El cuerpo del push incluye el número de habitación y el tipo
  (`apps/worker/src/sale-notifier.ts:28`). No es un dato personal del huésped, pero es información
  del hotel que recibe cualquier suscriptor; conviene confirmar que es aceptable para el negocio.
- No hay plazo de caducidad ni limpieza de suscripciones antiguas: solo se purgan las que el
  navegador rechaza con 404/410 (`packages/shared/src/push/service.ts:108`).
- El documento pide que la venta se vea con «el importe y el comprador»
  (`casos_uso_incremento.md:294`); la tabla muestra la dirección del comprador recortada a 8
  caracteres (`apps/web/src/components/my-nights/MyResales.tsx:147`), no un nombre.
