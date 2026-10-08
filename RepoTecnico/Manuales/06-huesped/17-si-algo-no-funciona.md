# Qué hacer si algo no funciona

> Cuando algo se atasca —la cartera, la red, una transacción, el resguardo de check-in o una noche que se vende antes de firmar— el sistema no se queda mudo: distingue la causa, dice qué ha pasado y ofrece una salida concreta; este manual reúne esas salidas.

## Qué hace el sistema

La web del huésped trata los fallos por **familias** y, dentro de cada una, separa causas distintas para no dar un mensaje genérico cuando el problema tiene nombre. La regla es la honestidad: si algo no se puede comprobar, se dice; no se promete que todo va bien (`apps/web/src/components/ContractPausedBanner.tsx:8`).

**1. La cartera.** El estado de onboarding resume si hay cartera instalada, si está conectada, si la red es la correcta y si se puede comprar (`apps/web/src/components/wallet/useOnboarding.ts:13`, `:67`, `:80`). La barra de la cartera pinta cuatro situaciones distintas: sin cartera, sin conectar, red equivocada y conectada (`apps/web/src/components/wallet/WalletBar.tsx:28`, `:39`, `:52`, `:76`).

**2. La red equivocada.** La web compara la red de la cartera con la red de la aplicación (`apps/web/src/components/wallet/useOnboarding.ts:67`) y usa una **función pura** para clasificar el fallo del cambio en tres claves: la red no está añadida (`4902`), el usuario la rechazó (`4001`) o un fallo genérico (`apps/web/src/components/wallet/switchChainError.ts:19`, `:21`, `:22`). Al cambiar de red, primero intenta añadirla a la cartera y luego cambia (`apps/web/src/components/wallet/useOnboarding.ts:99`, `:111`).

**3. La transacción rechazada.** Otra función pura clasifica el error de una operación de escritura: si el usuario rechazó la firma en la cartera (`UserRejectedRequestError` o código `4001`) es **rechazo**; cualquier otra cosa es **fallo** (`apps/web/src/components/tx/txError.ts:18`, `:20`, `:27`). El estado de la operación tiene cinco pasos: inactiva, firmando, pendiente, confirmada y revertida (`apps/web/src/components/tx/txStatus.ts:12`).

**4. El resguardo QR.** El resguardo de check-in se pide desde **Mis noches** y se firma con la cartera (`apps/web/src/components/my-nights/useTicket.ts:44`, `:82`). Si el huésped cancela la firma, el mensaje lo dice tal cual, sin culpar al sistema (`apps/web/src/components/my-nights/useTicket.ts:114`, `:116`). El QR lo dibuja el servidor; si no puede, el resguardo **sigue valiendo** y queda el token en texto (`apps/web/src/components/my-nights/TicketView.tsx:73`; `apps/web/messages/es.json:370`). La pantalla de check-in del huésped (`/checkin`) lee el resguardo del fragmento de la URL y, si no hay ninguno, lo explica y ofrece volver a **Mis noches** (`apps/web/src/app/checkin/page.tsx:44`, `:71`, `:76`).

**5. La noche ya vendida.** Antes de firmar, la web **re-verifica** la compra contra la cadena y lee `soldOnce` (`apps/web/src/components/buy/usePurchaseReview.ts:85`, `:129`). Si la noche ya está vendida, lo dice con nombre y ofrece elegir otra (`apps/web/src/components/buy/BuyButton.tsx:191`, `:217`); el asistente hace lo mismo en su traspaso de compra (`apps/web/src/components/assistant/PurchaseHandoff.tsx:160`, `:180`).

Por debajo hay dos redes de seguridad generales: el **estado degradado** con botón **Reintentar** cuando una fuente no responde (`apps/web/src/components/DegradedState.tsx:10`, `:31`, `:34`), y el aviso del **asistente no disponible** con reintento y enlace al catálogo (`apps/web/src/components/assistant/AssistantChat.tsx:126`, `:137`, `:146`).

## Recorrido real

**Cartera**

1. El huésped entra en una pantalla que necesita cartera. Sin cartera instalada ve «No detectamos una wallet web3.» y un enlace para instalar MetaMask (`apps/web/src/components/wallet/WalletBar.tsx:28`, `:32`; `apps/web/messages/es.json:244`, `:245`).
2. Con cartera pero sin conectar, ve el botón **Conectar wallet** y, al pulsarlo, **Conectando…** (`apps/web/src/components/wallet/WalletBar.tsx:39`, `:47`; `apps/web/messages/es.json:246`, `:247`).
3. Si el huésped cierra el aviso de la cartera, no hay conexión y vuelve a pulsar **Conectar wallet** (`apps/web/src/components/wallet/useOnboarding.ts:86`; la lista de carteras está en `apps/web/src/components/wallet/WalletChooser.tsx:31`).
4. Conectada, la barra enseña la dirección acortada, del estilo `0x1234…abcd` (`apps/web/src/components/wallet/WalletBar.tsx:9`, `:83`).

**Red equivocada**

5. Si la cartera está en otra red, aparece «Estás en la red equivocada.» y el botón **Cambiar de red** (`apps/web/src/components/wallet/WalletBar.tsx:52`; `apps/web/messages/es.json:248`, `:249`).
6. Mientras cambia, el botón dice **Cambiando de red…** (`apps/web/messages/es.json:250`).
7. Si la cartera no conoce la red (`4902`), el aviso guía: «Tu wallet aún no tiene esta red. Aprueba añadirla cuando MetaMask te lo pida y vuelve a intentarlo.» (`apps/web/src/components/wallet/switchChainError.ts:21`; `apps/web/messages/es.json:253`).
8. Si el huésped cancela, el aviso es «Has cancelado el cambio de red. Para reservar, cambia a la red de la aplicación.» (`apps/web/src/components/wallet/switchChainError.ts:22`; `apps/web/messages/es.json:254`).
9. Si el cambio falla por otra causa, el aviso pide cambiarla a mano: «No se pudo cambiar de red. Cámbiala manualmente en tu wallet a la red de la aplicación e inténtalo de nuevo.» (`apps/web/src/components/wallet/switchChainError.ts:24`; `apps/web/messages/es.json:255`).

**Transacción rechazada**

10. Al firmar, el huésped ve el estado de la operación: «Confirma en tu wallet», «Reservando tu noche…», «¡Noche reservada!» o «No se completó la reserva» (`apps/web/src/components/tx/txStatus.ts:13`, `:14`, `:15`, `:16`; `apps/web/messages/es.json:300`, `:301`, `:302`, `:303`).
11. Si cancela la firma, el mensaje es «Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.» y no se cobra nada (`apps/web/src/components/tx/txError.ts:20`; `apps/web/messages/es.json:312`).
12. Si falla por otra razón, el mensaje pide revisar la red y reintentar (`apps/web/messages/es.json:313`).
13. El recibo de la operación aparece al confirmarse: si la red tiene explorador, con enlace **Ver transacción**; si no, con el hash acortado y botón **Copiar** (`apps/web/src/components/tx/TxReceipt.tsx:28`, `:46`, `:56`).
14. Si el hotel ha pausado el contrato, se avisa antes de intentarlo: «El hotel ha pausado las operaciones: no se pueden comprar noches mientras dure la pausa.» (`apps/web/src/components/ContractPausedBanner.tsx:18`, `:25`; `apps/web/messages/es.json:918`).
15. Si no se pudo comprobar la pausa, se dice en vez de prometer que las ventas están abiertas (`apps/web/src/components/ContractPausedBanner.tsx:11`; `apps/web/messages/es.json:920`).

**QR que no se ve**

16. En **Mis noches**, el huésped pulsa **Ver mi resguardo QR** y firma (`apps/web/src/components/my-nights/TicketView.tsx:51`; `apps/web/messages/es.json:367`).
17. Sin cartera conectada, el sistema corta con «Conecta tu cartera para obtener el resguardo.» (`apps/web/src/components/my-nights/useTicket.ts:64`).
18. Si cancela la firma, aparece «Firma cancelada en tu cartera.» (`apps/web/src/components/my-nights/useTicket.ts:116`).
19. Si la API no puede emitirlo, se enseña el motivo que devuelva o, en su defecto, «No se pudo emitir el resguardo. Inténtalo de nuevo.» (`apps/web/src/components/my-nights/useTicket.ts:34`, `:106`).
20. Si el servidor no pudo dibujar el QR, el resguardo sigue valiendo: se avisa y se deja el token para copiarlo (`apps/web/src/components/my-nights/TicketView.tsx:73`, `:85`; `apps/web/messages/es.json:370`, `:374`).
21. Si el huésped abre `/checkin` sin resguardo, la página lo dice y ofrece **Ir a Mis noches** (`apps/web/src/app/checkin/page.tsx:71`, `:74`, `:77`; `apps/web/messages/es.json:380`, `:381`).
22. Si el navegador no puede dibujar el QR en esa pantalla, se muestra el mismo aviso de que el token sirve (`apps/web/src/app/checkin/page.tsx:60`, `:108`).
23. En recepción, si el resguardo ya se usó o no es válido, el mostrador recibe el motivo exacto del sistema y lo ve en un aviso rojo (`packages/shared/src/reception/service.ts:265`, `:246`; `apps/web/src/components/reception/CheckInPanel.tsx:73`, `:164`).

**Noche ya vendida**

24. Al preparar la reserva, la web re-verifica el precio y el estado contra la cadena; si falla la lectura, distingue «verificando» de «no se pudo verificar» (`apps/web/src/components/buy/usePurchaseReview.ts:122`, `:125`; `apps/web/messages/es.json:287`, `:288`).
25. Si la cadena dice que la noche ya se vendió, el aviso es «Esta noche ya está vendida. Elige otra noche del catálogo.» con enlace al catálogo (`apps/web/src/components/buy/BuyButton.tsx:191`, `:194`, `:217`; `apps/web/messages/es.json:315`, `:316`).
26. Si lo detecta sin fallo de lectura, el aviso es el mismo y también lleva al catálogo (`apps/web/src/components/buy/BuyButton.tsx:215`, `:218`).
27. En el asistente, el traspaso de compra dice «Esta noche ya está vendida. Pide otra al asistente o elígela en el catálogo.» (`apps/web/src/components/assistant/PurchaseHandoff.tsx:160`, `:180`; `apps/web/messages/es.json:913`).
28. Si el problema es de conexión y no de venta, el mensaje pide comprobar la red y ofrece **Reintentar verificación** (`apps/web/src/components/buy/usePurchaseReview.ts:125`; `apps/web/messages/es.json:288`, `:289`).

**Cuando falla una fuente o el asistente**

29. Si el histórico, el catálogo o una lista no cargan, aparece el estado degradado con el mensaje concreto y el botón **Reintentar**, que vuelve a pedir la página (`apps/web/src/components/DegradedState.tsx:30`, `:34`).
30. Si el asistente no está disponible, avisa: «El asistente no está disponible ahora mismo. Puedes seguir reservando desde el catálogo.», con **Reintentar** y enlace al catálogo (`apps/web/src/components/assistant/AssistantChat.tsx:126`, `:132`, `:137`, `:146`; `apps/web/messages/es.json:877`, `:880`).
31. El asistente también limita el número de peticiones: si se pasa, la API responde `429` y la interfaz cae en el mismo aviso de no disponible (`apps/web/src/app/api/assistant/route.ts:38`, `:121`; `apps/web/src/lib/assistant/rate-limit.ts:45`).

## Piezas de código implicadas

- **Cartera**: estado de onboarding en `apps/web/src/components/wallet/useOnboarding.ts:13`, `:40`, `:58`, `:67`, `:86`, `:99`, `:111`; barra de cuatro estados en `apps/web/src/components/wallet/WalletBar.tsx:14`, `:28`, `:39`, `:52`, `:76`; lista de carteras detectadas en `apps/web/src/components/wallet/WalletChooser.tsx:24`, `:31`, `:44`.
- **Red equivocada**: clasificación pura del fallo en `apps/web/src/components/wallet/switchChainError.ts:6`, `:19`, `:21`, `:22`, `:24`; alta automática de la red en `apps/web/src/lib/wallet-chain.ts` y `apps/web/src/components/wallet/useOnboarding.ts:99`.
- **Transacción**: clasificación del rechazo en `apps/web/src/components/tx/txError.ts:6`, `:18`, `:27`; estados en `apps/web/src/components/tx/txStatus.ts:12`; recibo en `apps/web/src/components/tx/TxReceipt.tsx:8`, `:28`, `:46`, `:56`; aviso de pausa en `apps/web/src/components/ContractPausedBanner.tsx:11`, `:13`, `:16`, `:25`.
- **Resguardo QR**: emisión y firma en `apps/web/src/components/my-nights/useTicket.ts:23`, `:34`, `:64`, `:94`, `:106`, `:116`; vista en `apps/web/src/components/my-nights/TicketView.tsx:21`, `:51`, `:64`, `:73`, `:85`; pantalla pública en `apps/web/src/app/checkin/page.tsx:44`, `:52`, `:60`, `:71`, `:76`, `:97`, `:108`; API que dibuja el QR y sus errores en `apps/web/src/app/api/qr/[tokenId]/route.ts:37`, `:42`, `:80`.
- **Check-in en recepción**: códigos de error estables en `packages/shared/src/reception/service.ts:10`, `:246`, `:265`, `:277`, `:285`, `:296`, `:302`, `:308`; traducción a HTTP en `apps/web/src/app/api/reception/checkin/route.ts:28`, `:29`, `:30`, `:38`; aviso en pantalla en `apps/web/src/components/reception/CheckInPanel.tsx:44`, `:73`, `:164`.
- **Noche ya vendida**: re-verificación y `soldOnce` en `apps/web/src/components/buy/usePurchaseReview.ts:16`, `:85`, `:122`, `:125`, `:129`; avisos del catálogo en `apps/web/src/components/buy/BuyButton.tsx:186`, `:191`, `:215`, `:217`; avisos del asistente en `apps/web/src/components/assistant/PurchaseHandoff.tsx:156`, `:160`, `:174`, `:180`; errores del contrato en `packages/contracts/src/HotelNights.sol:158`, `:204`, `:294`.
- **Reventa del huésped**: traducción de errores del contrato en `apps/web/src/components/my-nights/resaleErrorMessage.ts:7`, `:60`; aviso en la tarjeta en `apps/web/src/components/my-nights/MyNightCard.tsx:46`, `:146`, `:198`.
- **Asistente IA**: límite de peticiones puro en `apps/web/src/lib/assistant/rate-limit.ts:45`, `:96`, `:113`; composición y no disponibilidad en `apps/web/src/lib/assistant/llm-provider.ts:57`, `:103`; traducción de la tx preparada en `apps/web/src/lib/assistant/validate-tx.ts:56`; errores de herramientas en `apps/web/src/lib/assistant/orchestrator.ts:107`, `:109`; gateway MCP en `apps/web/src/lib/assistant/mcp-gateway.ts:81`; respuesta `503` y `429` en `apps/web/src/app/api/assistant/route.ts:38`, `:84`, `:100`, `:121`; hook del chat en `apps/web/src/components/assistant/useAssistant.ts:44`, `:52`, `:65`; avisos en `apps/web/src/components/assistant/AssistantChat.tsx:126`, `:137`, `:146`.
- **Degradación reutilizable**: `apps/web/src/components/DegradedState.tsx:10`, `:30`, `:34`.
- **Textos exactos**: cartera `apps/web/messages/es.json:244`, `:253`, `:254`, `:255`; compra `:287`, `:288`, `:299`, `:312`, `:313`, `:315`; resguardo `:370`, `:380`; asistente `:877`, `:880`, `:913`; pausa `:918`, `:920`; reventa `:359`.

## Datos y estados

- **Onboarding.** `hasWallet`, `isConnected`, `isWrongNetwork`, `isConnecting`, `canPurchase` y `switchError` (`apps/web/src/components/wallet/useOnboarding.ts:13`, `:20`). La red es correcta cuando la cadena de la cartera coincide con la de la aplicación (`apps/web/src/components/wallet/useOnboarding.ts:67`).
- **Fallo de cambio de red.** Tres claves: `chainNotAdded` (`4902`), `rejected` (`4001` o `UserRejectedRequestError`) y `failed` (todo lo demás) (`apps/web/src/components/wallet/switchChainError.ts:6`, `:21`, `:22`, `:24`).
- **Fallo de transacción.** Dos claves: `rejected` y `failed` (`apps/web/src/components/tx/txError.ts:6`, `:27`).
- **Estado de la transacción.** `idle`, `signing`, `pending`, `confirmed` y `reverted` (`apps/web/src/components/tx/txStatus.ts:2`, `:12`).
- **Estado de `soldOnce`.** `unknown`, `checking`, `sold` y `free`; en reventa se queda en `unknown` porque su autoridad es `listingOf` (`apps/web/src/components/buy/usePurchaseReview.ts:17`, `:129`).
- **Estados del resguardo.** `idle`, `signing`, `requesting`, `ready` y `error` (`apps/web/src/components/my-nights/useTicket.ts:23`).
- **Códigos de error del check-in.** `TICKET_INVALIDO` (400), `TICKET_YA_USADO` (409), `TOKEN_NO_ENCONTRADO` (404), `TITULARIDAD_CAMBIADA` (409), `TITULARIDAD_NO_VERIFICABLE` (503), `YA_CONSUMIDA` (409), `CHECKIN_EN_PROCESO` (409), `TOKEN_QUEMADO` (410), `NOCHE_NO_VENDIDA` (409), `CONTRATO_EN_PAUSA` (503), `ANCLAJE_FALLIDO` (502), `ANCLAJE_NO_CONFIGURADO` (503), `PRUEBA_POSESION_INVALIDA` (400), `PRUEBA_POSESION_CON_PII` (400), `MOTIVO_INVALIDO` (400), `RESERVA_NO_ENCONTRADA` (404) (`packages/shared/src/reception/service.ts:10`; `apps/web/src/app/api/reception/checkin/route.ts:28`).
- **Errores del contrato que afectan al huésped.** `NightNotAvailable` si la noche ya no está disponible (`packages/contracts/src/HotelNights.sol:158`, `:204`); `AlreadySold` si se intenta quemar una noche de cliente (`packages/contracts/src/HotelNights.sol:294`); y `EnforcedPause`, que emite el guardián de pausa heredado de la librería cuando el contrato está en pausa (`packages/contracts/src/HotelNights.sol:10`, `:51`, `:156`).
- **Errores de reventa del huésped.** `NotOwner`, `InvalidPrice`, `NightExpired`, `NotListed`, `PriceBelowMinimum`, `NightNotResellable` (`apps/web/src/components/my-nights/resaleErrorMessage.ts:7`).
- **Límite del asistente.** Por defecto 10 peticiones por minuto, 200 al día y 60.000 caracteres por minuto (`apps/web/src/lib/assistant/rate-limit.ts:45`).
- **Estados del asistente.** `idle`, `loading` y `error`; el aviso `unavailable` distingue «no está disponible» de «ha fallado una respuesta» (`apps/web/src/components/assistant/useAssistant.ts:6`, `:52`).
- **Índice de referencias.** El catálogo de casos de uso del sistema, con la ruta de cada fichero, está en `docs/Manuales/05-casos-de-uso/README.md:1`.

## Casos límite y errores

- **No hay cartera instalada.** La web avisa con un enlace a MetaMask y los botones de compra quedan desactivados (`apps/web/src/components/wallet/WalletBar.tsx:28`, `:32`; `apps/web/messages/es.json:244`, `:245`).
- **El huésped cierra el aviso de la cartera.** No hay conexión: se vuelve a pulsar **Conectar wallet** (`apps/web/src/components/wallet/useOnboarding.ts:86`).
- **La cartera no conoce la red.** Error `4902`: aviso para aprobar añadirla (`apps/web/src/components/wallet/switchChainError.ts:21`; `apps/web/messages/es.json:253`).
- **El huésped cancela el cambio de red.** Error `4001`: aviso de cancelación y recordatorio de cambiar a la red de la aplicación (`apps/web/src/components/wallet/switchChainError.ts:22`; `apps/web/messages/es.json:254`).
- **El cambio de red falla.** Aviso para cambiarla a mano en la cartera (`apps/web/src/components/wallet/switchChainError.ts:24`; `apps/web/messages/es.json:255`).
- **No veo Desconectar.** Con la cartera en otra red, la acción del menú es cambiarla; desconectar solo se ofrece ya en la red correcta (`apps/web/src/lib/wallet-menu-items.ts:56`, `:58`).
- **El huésped cancela la firma de una compra.** No se cobra nada y el mensaje invita a reintentar (`apps/web/src/components/tx/txError.ts:20`; `apps/web/messages/es.json:312`).
- **La transacción revierte.** El mensaje de estado dice «No se completó la reserva» y el recibo solo aparece si hay hash confirmado (`apps/web/src/components/tx/txStatus.ts:16`; `apps/web/messages/es.json:303`).
- **No hay explorador de bloques.** El recibo degrada a hash acortado con botón **Copiar** en vez de enlace (`apps/web/src/components/tx/TxReceipt.tsx:28`, `:46`, `:56`; `apps/web/src/config/chain.ts:83`).
- **El hotel ha pausado el contrato.** Aviso previo; si no se pudo comprobar, se dice sin prometer nada (`apps/web/src/components/ContractPausedBanner.tsx:11`, `:16`; `apps/web/messages/es.json:918`, `:920`).
- **Saldo insuficiente.** El aviso dice cuánto falta y, si hay faucet de prueba, ofrece el botón para conseguirlo (`apps/web/src/components/buy/BuyButton.tsx:141`, `:154`; `apps/web/messages/es.json:297`, `:298`).
- **Fallo al verificar el precio.** Si no se pudo leer la cadena, se ofrece **Reintentar verificación**; si el precio cambió, se pide volver a abrir la reserva (`apps/web/src/components/buy/usePurchaseReview.ts:125`; `apps/web/messages/es.json:286`, `:288`).
- **La noche ya está vendida.** El aviso lo dice con nombre y lleva al catálogo, en el catálogo y en el asistente (`apps/web/src/components/buy/BuyButton.tsx:191`, `:217`; `apps/web/src/components/assistant/PurchaseHandoff.tsx:160`, `:180`).
- **No hay cartera al pedir el resguardo.** Mensaje «Conecta tu cartera para obtener el resguardo.» (`apps/web/src/components/my-nights/useTicket.ts:64`).
- **El huésped cancela la firma del resguardo.** Mensaje «Firma cancelada en tu cartera.» (`apps/web/src/components/my-nights/useTicket.ts:116`).
- **El servidor no puede emitir el resguardo.** Se muestra el motivo de la API o el genérico de reintento (`apps/web/src/components/my-nights/useTicket.ts:34`, `:106`).
- **El QR no se dibuja.** El resguardo sigue siendo canjeable: se avisa y se deja el token en texto para el camino manual (`apps/web/src/components/my-nights/TicketView.tsx:73`, `:85`; `apps/web/src/app/checkin/page.tsx:60`, `:108`; `apps/web/messages/es.json:370`).
- **Se abre `/checkin` sin resguardo.** No hay enlace con resguardo: se explica y se ofrece **Ir a Mis noches** (`apps/web/src/app/checkin/page.tsx:71`, `:76`; `apps/web/messages/es.json:380`, `:381`).
- **El resguardo ya se usó.** En recepción: `TICKET_YA_USADO` (409) con «Este resguardo ya se utilizó para un check-in; cada pase sirve una sola vez» (`packages/shared/src/reception/service.ts:264`; `apps/web/src/app/api/reception/checkin/route.ts:30`).
- **El resguardo no es válido o está corrupto.** `TICKET_INVALIDO` (400) (`packages/shared/src/reception/service.ts:246`, `:256`).
- **Dos puestos confirman a la vez.** `CHECKIN_EN_PROCESO` (409) con la indicación de esperar unos segundos (`packages/shared/src/reception/service.ts:277`).
- **La noche cambió de dueño.** `TITULARIDAD_CAMBIADA` (409): el titular actual debe emitir un resguardo nuevo (`packages/shared/src/reception/service.ts:308`).
- **No se pudo comprobar la titularidad.** `TITULARIDAD_NO_VERIFICABLE` (503): no se autoriza nada y no se disfraza de error del huésped (`packages/shared/src/reception/service.ts:302`; `apps/web/src/app/api/reception/checkin/route.ts:34`).
- **La noche ya no existe en la cadena.** `TOKEN_QUEMADO` (410) (`packages/shared/src/reception/service.ts:296`; `apps/web/src/app/api/reception/checkin/route.ts:37`).
- **El contrato está en pausa en recepción.** `CONTRATO_EN_PAUSA` (503): es una decisión del hotel, no un fallo de red (`packages/shared/src/reception/service.ts:586`; `apps/web/src/app/api/reception/checkin/route.ts:40`).
- **El ancla on-chain no se pudo ejecutar.** `ANCLAJE_FALLIDO` (502) o `ANCLAJE_NO_CONFIGURADO` (503): el check-in **no** se registra (`apps/web/src/app/api/reception/checkin/route.ts:41`, `:42`).
- **El huésped intenta revender una noche ya consumida.** `NightNotResellable`: «Esta noche ya se consumió en recepción y no puede revenderse.» (`apps/web/src/components/my-nights/resaleErrorMessage.ts:16`; `apps/web/messages/es.json:359`).
- **El huésped lista por debajo del mínimo.** `PriceBelowMinimum`: «El precio está por debajo del mínimo de reventa que fija el hotel.» (`apps/web/src/components/my-nights/resaleErrorMessage.ts:15`; `apps/web/messages/es.json:358`).
- **No se pudieron cargar las noches.** Mensaje con botón **Reintentar** (`apps/web/src/components/my-nights/MyNights.tsx:77`, `:80`, `:84`; `apps/web/messages/es.json:323`, `:324`).
- **Una fuente no responde.** Estado degradado con mensaje y **Reintentar** en histórico, catálogo y listas (`apps/web/src/components/DegradedState.tsx:30`, `:34`).
- **El asistente no está disponible.** Aviso con **Reintentar** y enlace al catálogo; además se deja la traza del fallo en la conversación (`apps/web/src/components/assistant/AssistantChat.tsx:126`, `:137`; `apps/web/src/components/assistant/useAssistant.ts:56`; `apps/web/messages/es.json:877`, `:879`).
- **Demasiadas peticiones al asistente.** La API corta con `429` antes de llamar al modelo y la interfaz muestra el aviso de no disponible (`apps/web/src/app/api/assistant/route.ts:38`, `:119`; `apps/web/src/lib/assistant/rate-limit.ts:113`).
- **El asistente prepara una compra que ya no vale.** La validación del servidor re-deriva el precio y el estado on-chain; si no cuadra, la compra no se ofrece (`apps/web/src/lib/assistant/validate-tx.ts:56`, `:59`).
- **El asistente intenta filtrar su prompt.** La salida se redacta y se responde con una frase acotada al hotel (`apps/web/src/app/api/assistant/route.ts:20`, `:136`).

## Referencias

- **CU-17** · Conectar la cartera y ponerse en la red correcta (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md:1`).
- **CU-04** · Ver y filtrar las noches disponibles: su estado degradado y su reintento (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-04-catalogo.md:1`).
- **CU-08** · Pedirle una noche al asistente y que prepare la compra (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-08-asistente-ia.md:1`).
- **CU-05** · Comprar una noche al hotel: rechazo de firma, saldo y noche ya vendida (`docs/Manuales/05-casos-de-uso/04-ventas/CU-05-compra-primaria.md:1`).
- **CU-07** · Comprar una noche que otro cliente revende (`docs/Manuales/05-casos-de-uso/04-ventas/CU-07-compra-secundaria.md:1`).
- **CU-33** · Dar entrada al cliente escaneando su resguardo: los códigos de error del check-in (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-33-checkin-qr.md:1`).
- **CU-36** · Que el huésped publique, cambie o retire su reventa (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-36-reventa-huesped.md:1`).
- **CU-40** · El menú de la cartera y del usuario (`docs/Manuales/05-casos-de-uso/09-back-office-y-gobierno-v3/CU-40-menu-wallet.md:1`).
- **CU-PR-01** · Conseguir dinero de prueba cuando falta saldo (`docs/Manuales/05-casos-de-uso/07-entorno-de-pruebas/CU-PR-01-faucet.md:1`).
- **ADR-05** · Check-in anclado on-chain y resguardo de un solo uso: el uso único que produce `TICKET_YA_USADO` (`docs/adr/ADR-05-check-in-on-chain.md:1`).
- **ADR-11** · Validación server-side independiente del LLM de la tx preparada (`apps/web/src/lib/assistant/validate-tx.ts:9`).
- **ADR-13** · Faucet de pruebas solo en red local, que es la vía para conseguir saldo en pruebas (`docs/adr/ADR-13-faucet-de-pruebas.md:1`).
- **CU-09** · Mirar el histórico público de ventas: su estado degradado con **Reintentar** si el worker no responde (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-09-historico.md:1`).
- Guía del comprador, apartado 9: qué queda público en la cadena y cómo se lee (`docs/manual-comprador.md:243`).
