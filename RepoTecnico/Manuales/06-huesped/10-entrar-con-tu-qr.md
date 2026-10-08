# Dar entrada con tu resguardo QR

> El huésped emite el resguardo QR de su noche en «Mis noches», lo enseña en recepción y el personal registra la entrada; él no toca el panel.

## Qué hace el sistema

El resguardo tiene dos mitades y las fabrica el servidor, no el móvil. La primera es el **JWS**: un texto firmado en formato compacto, con algoritmo `HS256`, que lleva dentro el identificador de la noche (`tokenId`), la habitación, la fecha de entrada, el tipo, la cartera del titular (`guestWallet`) y un identificador único de un solo uso (`jti`) (`packages/shared/src/passes/jws.ts:7`, `:20`, `:41`, `:45`). La segunda es la **imagen del QR**, que codifica la dirección `…/checkin#ticket=<JWS>` (`apps/web/src/app/api/qr/[tokenId]/route.ts:68`, `:74`).

Nada de eso se emite sin demostrar que la noche es del huésped. La pantalla pide una **firma EIP-712** en la cartera (`apps/web/src/components/my-nights/useTicket.ts:82`). El mensaje firmado lleva el `tokenId`, un `nonce` de un solo uso que entrega el servidor y una caducidad calculada en el cliente (`apps/web/src/components/my-nights/ticketSignature.ts:26`, `:41`). La petición viaja con esas cuatro cabeceras y el servidor falla en cerrado: sin ellas responde **401**; si la firma caducó, tiene más vigencia de la admitida, es inválida o el `nonce` ya se usó, también **401** (`apps/web/src/lib/ticket-ownership.ts:77`, `:88`, `:94`, `:145`). Quién es el dueño lo decide la **cadena** con `ownerOf`, no el índice interno (`apps/web/src/lib/ticket-ownership.ts:164`). Si la cadena no responde, la respuesta es **503** y no se emite nada (`apps/web/src/lib/ticket-ownership.ts:101`).

El resguardo vale **7 días** desde su emisión (`apps/web/src/app/api/qr/[tokenId]/route.ts:54`). La pantalla `/checkin` no llama a ninguna API: lee el resguardo del **fragmento** de la URL (`#ticket=…`), que el navegador no envía al servidor, y dibuja el QR en el propio cliente (`apps/web/src/app/checkin/page.tsx:45`, `:52`). Por eso ese enlace se puede abrir sin la cartera conectada: la página es pública y no pide sesión (`apps/web/src/app/checkin/page.tsx:64`). Los datos que pinta los saca decodificando el texto **sin verificar la firma**, solo para mostrar (`apps/web/src/app/checkin/page.tsx:19`).

Quien canjea el resguardo es **recepción**, no el huésped. En el panel del día, la pestaña **Check-in** abre un formulario donde se pega el texto del JWS o la URL entera; si el valor trae `#ticket=`, el formulario se queda solo con el JWS (`apps/web/src/components/reception/CheckInPanel.tsx:66`, `:222`). El envío llama a `POST /api/reception/checkin`, que exige sesión con rol `RECEPTION_ROLE` (`apps/web/src/app/api/reception/checkin/route.ts:101`).

El servicio de recepción hace las comprobaciones en este orden (`packages/shared/src/reception/service.ts:238`):

1. Verifica la firma del JWS y que el tipo sea de resguardo de check-in (`packages/shared/src/passes/jws.ts:58`, `:61`).
2. Exige que el identificador de la noche sea numérico (`packages/shared/src/reception/service.ts:254`).
3. **Consume el `jti`** en Redis: el mismo resguardo no entra dos veces, ni con dos peticiones a la vez (`packages/shared/src/reception/service.ts:262`).
4. Toma un **cerrojo por noche** para que dos puestos no confirmen la misma noche en paralelo (`packages/shared/src/reception/service.ts:273`).
5. Lee el titular **real** con `ownerOf` en la cadena y lo compara con la cartera que firmó el resguardo (`packages/shared/src/reception/service.ts:293`, `:306`).
6. Comprueba que la noche no esté ya consumida ni quemada (`packages/shared/src/reception/service.ts:325`, `:423`).
7. **Ancla el check-in en la cadena** con `markCheckedIn(tokenId)` y solo después marca la base de datos (`packages/shared/src/reception/service.ts:327`, `:329`). Antes simula la llamada, porque una transacción firmada se difunde aunque vaya a revertir (`packages/shared/src/reception/service.ts:547`).

Ojo con el nombre: en el contrato **no existe** una función `checkIn`. La que se usa es `markCheckedIn(uint256 tokenId)`, con `onlyRole(RECEPTION_ROLE)` y `whenNotPaused`, y sin comprobar propiedad; exige que el token exista, que haya tenido venta primaria y que no esté ya consumido (`packages/contracts/src/HotelNights.sol:198`, `:201`, `:202`, `:204`, `:205`, `:206`). El apunte es irreversible, deja la noche marcada y emite el evento `CheckedIn` (`packages/contracts/src/HotelNights.sol:208`, `:209`). Una noche consumida ya no puede volver al mercado (`packages/contracts/src/HotelNights.sol:217`).

## Recorrido real

1. Abre `/mis-noches` y busca la tarjeta de tu noche. Dentro hay un bloque **Resguardo de check-in** (`apps/web/src/components/my-nights/MyNightCard.tsx:119`; `apps/web/messages/es.json:365`).
2. Pulsa `Ver mi resguardo QR` (`apps/web/src/components/my-nights/TicketView.tsx:51`; `apps/web/messages/es.json:367`). Mientras trabaja, el botón pasa a `Generando resguardo…` (`apps/web/messages/es.json:368`).
3. Firma en tu cartera. El sistema pide esa firma para comprobar que la noche es tuya (`apps/web/messages/es.json:366`).
4. Aparece el QR, con el texto alternativo «Código QR del resguardo de la habitación {room} para el {date}» (`apps/web/src/components/my-nights/TicketView.tsx:70`; `apps/web/messages/es.json:369`). Debajo se lee `Habitación N · fecha` y la línea `Válido hasta el {date}. Cada resguardo sirve una sola vez.` (`apps/web/src/components/my-nights/TicketView.tsx:78`, `:81`; `apps/web/messages/es.json:371`, `:372`).
5. Puedes guardar la imagen con `Descargar el QR`, abrir la pantalla de mostrador con `Abrir la pantalla de recepción` o cerrar el bloque con `Ocultar` (`apps/web/src/components/my-nights/TicketView.tsx:104`, `:112`, `:115`; `apps/web/messages/es.json:375`, `:376`, `:377`). En el mismo bloque está el área `Token del resguardo (para el camino manual)`, con la nota «Recepción puede pegar este texto si el escáner no funciona.» (`apps/web/src/components/my-nights/TicketView.tsx:84`, `:94`; `apps/web/messages/es.json:373`, `:374`).
6. Si abres la pantalla de mostrador, llegas a `/checkin` con el resguardo en el fragmento de la dirección. La cabecera dice **Resguardo de check-in** y el aviso «Muestra esta pantalla en recepción. El personal escaneará el código con su lector.» (`apps/web/src/app/checkin/page.tsx:67`, `:68`; `apps/web/messages/es.json:378`, `:379`).
7. En esa pantalla ves la habitación, la línea `Noche:` con la fecha, el QR grande y la nota «Personal de recepción: escanee el código o pegue el token en la pantalla de recepción. El resguardo solo se puede canjear una vez.» (`apps/web/src/app/checkin/page.tsx:87`, `:92`, `:100`, `:111`; `apps/web/messages/es.json:382`, `:384`).
8. Si el QR no se pudiera dibujar, en su lugar se lee «No se pudo dibujar el código QR, pero el resguardo sigue valiendo: copia el token y enséñalo en recepción.» (`apps/web/src/app/checkin/page.tsx:108`; `apps/web/messages/es.json:370`).
9. Abre el desplegable `¿No funciona el escáner? Muestra este token` y verás el texto del JWS para copiarlo (`apps/web/src/app/checkin/page.tsx:114`, `:115`; `apps/web/messages/es.json:385`).
10. Entrega el resguardo en recepción. El recepcionista abre el panel del día, entra en la pestaña **Check-in** y pulsa la ficha `Lectura de resguardo (QR/JWS)` (`apps/web/src/components/reception/ReceptionDashboard.tsx:118`, `:152`; `apps/web/messages/es.json:963`, `:988`).
11. En la ventana que se abre, con el rótulo `Lectura de resguardo (QR/JWS)` y el aviso «Pega el contenido del QR o el token JWS. Cada resguardo sirve una sola vez.», se pega el texto en el área `Token JWS o URL del resguardo` y se pulsa `Confirmar check-in` (`apps/web/src/components/reception/CheckInPanel.tsx:222`, `:214`; `apps/web/messages/es.json:989`, `:990`, `:991`).
12. Si todo cuadra, aparece el aviso verde **Check-in confirmado**, con `Habitación {room} · Fecha: {date}` y la línea `Anclado on-chain` con el enlace al comprobante público (`apps/web/src/components/reception/CheckInPanel.tsx:145`, `:147`, `:151`; `apps/web/messages/es.json:993`, `:994`, `:995`).
13. El campo se vacía solo y el panel vuelve a pedir los datos del día; la habitación queda **OCUPADA** cuando la noche figura como `CHECKED_IN` (`apps/web/src/components/reception/CheckInPanel.tsx:75`, `:77`; `packages/shared/src/reception/day-board.ts:46`, `:47`).

Aviso importante para el huésped: en el código **no hay lector de cámara**. El "escaneo" se resuelve pegando el texto del resguardo en el área del formulario de recepción (`apps/web/src/components/reception/CheckInPanel.tsx:222`). Los textos de pantalla hablan de un escáner, pero ese lector no está implementado (pendiente de confirmar). La foto del QR no sirve: hace falta el texto.

## Piezas de código implicadas

**Huésped: emisión y presentación del resguardo**

- Tarjeta de la noche y punto de entrada: `apps/web/src/components/my-nights/MyNightCard.tsx:119`.
- Bloque del resguardo: `apps/web/src/components/my-nights/TicketView.tsx:21`, `:37`, `:40`, `:51`, `:67`, `:78`, `:81`, `:84`, `:89`, `:94`, `:104`, `:112`, `:115`.
- Emisión en el cliente (nonce, firma y llamada a la API): `apps/web/src/components/my-nights/useTicket.ts:10`, `:23`, `:34`, `:39`, `:64`, `:72`, `:82`, `:94`, `:106`, `:116`.
- Mensaje firmado y tope de vigencia: `apps/web/src/components/my-nights/ticketSignature.ts:10`, `:26`, `:41`.
- Pantalla de mostrador del huésped: `apps/web/src/app/checkin/page.tsx:19`, `:38`, `:45`, `:52`, `:64`, `:67`, `:73`, `:76`, `:87`, `:100`, `:108`, `:111`, `:114`, `:115`.

**API que emite el resguardo**

- `GET /api/qr/:tokenId`: `apps/web/src/app/api/qr/[tokenId]/route.ts:29`, `:37`, `:42`, `:47`, `:54`, `:56`, `:68`, `:74`, `:83`, `:100`.
- `POST /api/qr/:tokenId/send-email` (envío del resguardo a un correo efímero): `apps/web/src/app/api/qr/[tokenId]/send-email/route.ts:21`, `:26`, `:57`, `:72`, `:96`, `:108`. Ninguna pantalla de `apps/web/src` consume esta ruta: hoy solo aparece en pruebas (`apps/web/src/app/api/qr/qr.test.ts:5`).
- Guardián de titularidad y cabeceras: `apps/web/src/lib/ticket-ownership.ts:40`, `:77`, `:88`, `:94`, `:101`, `:114`, `:120`, `:127`, `:128`, `:145`, `:150`, `:164`.
- Firma y verificación del JWS: `packages/shared/src/passes/jws.ts:7`, `:20`, `:41`, `:45`, `:58`, `:61`, `:64`.

**Recepción: canje del resguardo**

- Panel del día y pestaña: `apps/web/src/components/reception/ReceptionDashboard.tsx:15`, `:118`, `:152`.
- Formulario y envío: `apps/web/src/components/reception/CheckInPanel.tsx:32`, `:41`, `:52`, `:57`, `:59`, `:66`, `:67`, `:73`, `:75`, `:77`, `:138`, `:145`, `:147`, `:151`, `:165`, `:181`, `:211`, `:214`, `:222`.
- Endpoint y traducción a HTTP: `apps/web/src/app/api/reception/checkin/route.ts:28`, `:100`, `:101`, `:108`, `:113`, `:118`, `:130`.
- Servicio de recepción: `packages/shared/src/reception/service.ts:10`, `:42`, `:238`, `:243`, `:254`, `:262`, `:266`, `:273`, `:278`, `:285`, `:293`, `:297`, `:303`, `:309`, `:325`, `:327`, `:329`, `:346`, `:423`, `:523`, `:538`, `:547`, `:555`, `:568`, `:575`, `:578`, `:584`, `:587`, `:591`, `:600`.
- Contrato: `packages/contracts/src/HotelNights.sol:198`, `:201`, `:202`, `:204`, `:205`, `:206`, `:208`, `:209`, `:217`, `:419`.
- Estado del panel del día: `packages/shared/src/reception/day-board.ts:46`, `:47`.

**Textos**

- Bloque del resguardo del huésped: `apps/web/messages/es.json:365`–`:385`.
- Pantalla de recepción y avisos: `apps/web/messages/es.json:962`, `:963`, `:987`–`:995`.

## Datos y estados

- **Resguardo emitido (`IssuedTicket`):** `qrPayload`, `qrDataUrl`, `jws`, `tokenId`, `roomNumber`, `checkInDate` y `expiresAt` (`apps/web/src/components/my-nights/useTicket.ts:10`).
- **Estados de la emisión en pantalla (`TicketStatus`):** `idle`, `signing`, `requesting`, `ready` y `error`; el botón se apaga mientras `signing` o `requesting` (`apps/web/src/components/my-nights/useTicket.ts:23`; `apps/web/src/components/my-nights/TicketView.tsx:25`, `:46`).
- **Datos que lee la pantalla de mostrador (`TicketClaims`):** `tokenId`, `roomNumber`, `checkInDate`, `roomType`, `expiresAt` y `jti`; se decodifican **sin verificar la firma**, solo para pintar (`apps/web/src/app/checkin/page.tsx:9`, `:19`).
- **Contenido del JWS (`TicketPayload`):** `tokenId`, `roomNumber`, `checkInDate`, `roomType`, `guestWallet`, `issuedAt`, `expiresAt` y `jti` (`packages/shared/src/passes/jws.ts:7`, `:20`).
- **Vigencias:** el JWS vale 7 días (`apps/web/src/app/api/qr/[tokenId]/route.ts:54`); la firma que pide el cliente dura 120 segundos (`apps/web/src/components/my-nights/ticketSignature.ts:10`) y el servidor admite como máximo 300 segundos (`apps/web/src/lib/ticket-ownership.ts:40`). El comentario de `apps/web/src/components/my-nights/useTicket.ts:39` y `:40` habla de «5 minutos», pero el valor real del cliente es 120 segundos.
- **Resultado del canje (`ReceptionCheckInResult`):** `status: "CHECKED_IN"`, `tokenId`, `roomNumber`, `checkInDate`, `roomType`, `onChainTxHash`, `onChainAnchor: "BROADCAST"` y `executionTimeMs` (`packages/shared/src/reception/service.ts:42`).
- **Estados de la noche:** en la base, `CHECKED_IN` y `BURNED` frenan el check-in (`packages/shared/src/reception/service.ts:424`, `:430`); en el panel del día, `CHECKED_IN` se traduce a **OCUPADA** (`packages/shared/src/reception/day-board.ts:46`, `:47`). En la cadena, `isCheckedIn(tokenId)` dice si la noche ya se consumió (`packages/contracts/src/HotelNights.sol:419`).
- **Códigos de error del canje y su HTTP** (`apps/web/src/app/api/reception/checkin/route.ts:28`): `TICKET_INVALIDO` 400, `PRUEBA_POSESION_INVALIDA` 400, `TICKET_YA_USADO` 409, `YA_CONSUMIDA` 409, `CHECKIN_EN_PROCESO` 409, `TITULARIDAD_CAMBIADA` 409, `NOCHE_NO_VENDIDA` 409, `TOKEN_NO_ENCONTRADO` 404, `TOKEN_QUEMADO` 410, `TITULARIDAD_NO_VERIFICABLE` 503, `CONTRATO_EN_PAUSA` 503, `ANCLAJE_FALLIDO` 502 y `ANCLAJE_NO_CONFIGURADO` 503.
- **Mensajes reales que ve el huésped:**

  - «Resguardo de check-in» y «Genera el resguardo de esta noche para enseñarlo en recepción. Te pediremos una firma para comprobar que la noche es tuya.» (`apps/web/messages/es.json:365`, `:366`).
  - «Ver mi resguardo QR» y «Generando resguardo…» (`apps/web/messages/es.json:367`, `:368`).
  - «Válido hasta el {date}. Cada resguardo sirve una sola vez.» (`apps/web/messages/es.json:372`).
  - «Token del resguardo (para el camino manual)» y «Recepción puede pegar este texto si el escáner no funciona.» (`apps/web/messages/es.json:373`, `:374`).
  - «Descargar el QR», «Abrir la pantalla de recepción» y «Ocultar» (`apps/web/messages/es.json:375`, `:376`, `:377`).
  - «Muestra esta pantalla en recepción. El personal escaneará el código con su lector.» (`apps/web/messages/es.json:379`).
  - «Esta página no tiene ningún resguardo. Abre el enlace que generaste desde «Mis noches».» con el botón `Ir a Mis noches` (`apps/web/messages/es.json:380`, `:381`).
  - «Personal de recepción: escanee el código o pegue el token en la pantalla de recepción. El resguardo solo se puede canjear una vez.» (`apps/web/messages/es.json:384`).
  - «¿No funciona el escáner? Muestra este token» (`apps/web/messages/es.json:385`).
  - «No se pudo dibujar el código QR, pero el resguardo sigue valiendo: copia el token y enséñalo en recepción.» (`apps/web/messages/es.json:370`).
  - «Conecta tu cartera para obtener el resguardo.» y «Firma cancelada en tu cartera.» (`apps/web/src/components/my-nights/useTicket.ts:64`, `:116`).
  - «No se pudo emitir el resguardo. Inténtalo de nuevo.» (`apps/web/src/components/my-nights/useTicket.ts:34`).

- **Mensajes reales del canje que el recepcionista puede leer delante del huésped:**

  - «Este resguardo ya se utilizó para un check-in; cada pase sirve una sola vez» (`packages/shared/src/reception/service.ts:266`).
  - «Otro puesto está procesando el check-in de esta noche; espera unos segundos y reinténtalo» (`packages/shared/src/reception/service.ts:278`).
  - «Noche no encontrada: {tokenId}» (`packages/shared/src/reception/service.ts:285`).
  - «Esa noche ya no existe en la cadena (quemada o nunca emitida): no se puede hacer check-in» (`packages/shared/src/reception/service.ts:297`).
  - «No se pudo comprobar la titularidad en la cadena; el check-in no se registra hasta poder verificarla» (`packages/shared/src/reception/service.ts:303`).
  - «El resguardo corresponde a un propietario anterior de la noche; el titular actual debe emitir uno nuevo» (`packages/shared/src/reception/service.ts:309`).
  - «La habitación {N} ya ha realizado el check-in (noche {tokenId} consumida)» (`packages/shared/src/reception/service.ts:427`).
  - «La noche {tokenId} fue quemada por expiración» (`packages/shared/src/reception/service.ts:431`).
  - «La wallet de recepción no tiene cuenta asociada: el check-in no puede anclarse» (`packages/shared/src/reception/service.ts:538`).
  - «La noche no tiene venta primaria registrada: solo puede hacerse check-in de noches vendidas» (`packages/shared/src/reception/service.ts:578`).
  - «El contrato canónico está en pausa: el hotel ha detenido las operaciones y el check-in no puede registrarse on-chain hasta reanudarlo» (`packages/shared/src/reception/service.ts:587`). Antes de pulsar, el panel ya muestra el aviso «El contrato canónico está en pausa: no se puede registrar ningún check-in hasta que el hotel reanude las operaciones.» (`apps/web/src/components/reception/CheckInPanel.tsx:138`; `apps/web/messages/es.json:987`).
  - «No se pudo anclar el check-in on-chain: …» (`packages/shared/src/reception/service.ts:593`).
  - «ticketJws requerido para check-in» (`apps/web/src/app/api/reception/checkin/route.ts:108`).
  - «Se produjo un error. Inténtalo de nuevo.» (`apps/web/messages/es.json:1004`).

- **Errores de la API que emite el resguardo:** «Token ID requerido» (400), «NFT no encontrado» (404) y «Error al generar resguardo QR» (500) (`apps/web/src/app/api/qr/[tokenId]/route.ts:37`, `:42`, `:100`). La ruta de correo añade «Correo electrónico inválido o no proporcionado» (400) y devuelve «Resguardo enviado satisfactoriamente» al encolar (`apps/web/src/app/api/qr/[tokenId]/send-email/route.ts:57`, `:108`).
- **Errores de la firma EIP-712 del resguardo:** «Se requiere la firma EIP-712 del titular (cabeceras x-wallet-address, x-signature, x-nonce y x-expires-at)», «La autorización EIP-712 ha caducado; vuelve a firmarla», «Firma EIP-712 inválida», «Esa noche no existe en la cadena (quemada o nunca emitida).», «La wallet firmante no es la propietaria actual de la noche en la cadena» y «Esta autorización EIP-712 ya se utilizó; firma una nueva» (`apps/web/src/lib/ticket-ownership.ts:79`, `:86`, `:96`, `:120`, `:128`, `:150`).

## Casos límite y errores

- **Sin cartera conectada.** La emisión no empieza: se muestra «Conecta tu cartera para obtener el resguardo.» (`apps/web/src/components/my-nights/useTicket.ts:62`, `:64`).
- **Firma cancelada en la cartera.** No es un fallo del sistema y se dice tal cual: «Firma cancelada en tu cartera.» (`apps/web/src/components/my-nights/useTicket.ts:115`, `:116`).
- **Petición al servidor rechazada.** Si la API contesta con un motivo concreto, se muestra ese motivo; si no, «No se pudo emitir el resguardo. Inténtalo de nuevo.» (`apps/web/src/components/my-nights/useTicket.ts:104`, `:106`, `:34`).
- **Firma caducada o repetida.** La autorización dura poco y su `nonce` se gasta una sola vez; reutilizarla devuelve 401 «Esta autorización EIP-712 ya se utilizó; firma una nueva» (`apps/web/src/lib/ticket-ownership.ts:85`, `:145`, `:150`).
- **El huésped ya no es el dueño.** Si vendió o traspasó la noche, la cadena dice que la cartera firmante no es la propietaria y la emisión se rechaza con 401 (`apps/web/src/lib/ticket-ownership.ts:127`, `:128`). Lo mismo ocurre al canjear: el resguardo antiguo se rechaza con `TITULARIDAD_CAMBIADA` y el titular actual debe emitir uno nuevo (`packages/shared/src/reception/service.ts:306`, `:309`).
- **La cadena no responde al emitir.** La API contesta 503 y no entrega resguardo; el mensaje es «No se pudo comprobar la titularidad en la cadena; el resguardo no se emite hasta poder verificarla.» (`apps/web/src/lib/ticket-ownership.ts:101`, `:108`).
- **Noche quemada o nunca emitida.** La emisión responde 404 con «Esa noche no existe en la cadena (quemada o nunca emitida).» (`apps/web/src/lib/ticket-ownership.ts:114`, `:120`).
- **Resguardo sin identificador único.** Si el JWS no trae `jti`, se rechaza en cerrado y no se degrada a «sin protección» (`packages/shared/src/passes/jws.ts:63`, `:64`).
- **El QR no se puede dibujar.** No invalida el resguardo: se registra en el servidor y se devuelve el token, porque recepción puede pegarlo (`apps/web/src/app/api/qr/[tokenId]/route.ts:80`, `:83`).
- **Enlace abierto sin resguardo.** Si se entra a `/checkin` sin `#ticket=`, aparece «Esta página no tiene ningún resguardo. Abre el enlace que generaste desde «Mis noches».» y un botón `Ir a Mis noches` (`apps/web/src/app/checkin/page.tsx:71`, `:73`, `:76`).
- **Contrato en pausa.** El panel de recepción muestra el aviso y el botón de confirmar queda apagado (`apps/web/src/components/reception/CheckInPanel.tsx:57`, `:138`, `:211`). Si aun así se intenta, el ancla revierte con `EnforcedPause` y el error es `CONTRATO_EN_PAUSA` (503), no un fallo del huésped (`packages/shared/src/reception/service.ts:584`, `:587`).
- **Botón de confirmar apagado.** Se deshabilita mientras carga, si el área está vacía o si el contrato está en pausa (`apps/web/src/components/reception/CheckInPanel.tsx:211`).
- **Mismo resguardo dos veces.** El `jti` ya consumido devuelve `TICKET_YA_USADO` (409) con «Este resguardo ya se utilizó para un check-in; cada pase sirve una sola vez» (`packages/shared/src/reception/service.ts:262`, `:266`).
- **Dos puestos a la vez.** Si otro puesto tiene el cerrojo de la noche, la respuesta es `CHECKIN_EN_PROCESO` (409) y el `jti` se libera para poder reintentar (`packages/shared/src/reception/service.ts:274`, `:275`, `:278`).
- **Noche ya consumida.** Con la noche en `CHECKED_IN` el error es `YA_CONSUMIDA` (409) y el mensaje nombra la habitación y la noche (`packages/shared/src/reception/service.ts:424`, `:427`).
- **Noche sin venta primaria.** El contrato revierte con `NightNotSold` y el error es `NOCHE_NO_VENDIDA` (409) (`packages/shared/src/reception/service.ts:575`, `:578`).
- **Fallo del anclaje.** Si el RPC, la wallet o el revert impiden difundir, el check-in **no** se marca en la base y el resguardo vuelve a quedar disponible para reintentar; la única excepción es que la noche ya estuviera consumida (`packages/shared/src/reception/service.ts:341`, `:346`).
- **Noche revendida después de emitir el resguardo.** El resguardo vive días y se emite al dueño del momento. Si la noche cambia de manos, ese resguardo viejo no vale y hay que pedir uno nuevo al comprador actual (`packages/shared/src/reception/service.ts:288`, `:306`).
- **No hay lector de cámara.** Los textos de las pantallas hablan de escanear, pero en el código el único camino implementado es pegar el JWS en el área de recepción (`apps/web/src/components/reception/CheckInPanel.tsx:222`). El lector de QR del mostrador está pendiente de confirmar.
- **Horarios, teléfonos y precios.** No forman parte de este flujo y no se documentan aquí.

## Referencias

- CU-33 · Dar entrada al cliente escaneando su resguardo (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-33-checkin-qr.md:1`).
- CU-33 · versión técnica del repositorio (`RepoTecnico/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-33-checkin-qr.md:1`).
- CU-08 · Emitir y validar el resguardo de check-in, con titularidad y sin doble uso (`docs/SRS.md:356`).
- CU-32 · Localizar una reserva por código de recuperación y comprobarla (`docs/SRS.md:368`).
- Endpoints del resguardo en el SRS: `GET /api/qr/[tokenId]` (`docs/SRS.md:199`) y `POST /api/qr/[tokenId]/send-email` (`docs/SRS.md:200`).
- ADR-05 · Check-in anclado on-chain y resguardo de un solo uso; la titularidad se comprueba contra `ownerOf` on-chain, no contra el índice (`docs/adr/ADR-05-check-in-on-chain.md:1`, `:23`).
- ADR-09 · El bloque de despliegue es la fuente única del escaneo: el registro del despliegue fija desde qué bloque parten los lectores de la cadena (`docs/adr/ADR-09-bloque-despliegue-fuente-unica.md:1`).
- Manual hermano del grupo: «Ver tus noches y su estado» (`RepoTecnico/Manuales/06-huesped/06-mis-noches.md:1`).
