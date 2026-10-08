# Pedirle una noche al asistente

> El huésped escribe qué noche quiere, el asistente comprueba en la cadena si está libre y su precio real, y le deja la reserva preparada para firmar en su propia cartera.

## Qué hace el sistema

El asistente es un chat en `/asistente` (`apps/web/src/app/asistente/page.tsx:5`). La página es un componente de servidor: envuelve el contenido en `PublicShell` (`apps/web/src/app/asistente/page.tsx:8`), pinta el título `Asistente IA` y su subtítulo desde las traducciones (`apps/web/src/app/asistente/page.tsx:11`, `:12`; `apps/web/messages/es.json:870`, `:871`) y monta el panel de conversación `AssistantChat` (`apps/web/src/app/asistente/page.tsx:14`).

El panel guarda la conversación en memoria del navegador. No hay base de datos de chat: el estado vive en el hook `useAssistant` (`apps/web/src/components/assistant/useAssistant.ts:36`) y el endpoint no escribe nada (no hay ninguna escritura a base de datos en `apps/web/src/app/api/assistant/route.ts`). El hook recibe la dirección de la cartera conectada y el texto neutro de error (`apps/web/src/components/assistant/AssistantChat.tsx:16`, `:17`).

**Envío de un turno.** Al pulsar `Enviar` (o `Enter`), el hook hace `POST /api/assistant` con el cuerpo `{ messages, walletAddress }` (`apps/web/src/components/assistant/useAssistant.ts:60`, `:63`). La dirección de la cartera es un dato público que solo se usa como contexto de lectura para «mis noches» (`apps/web/src/app/api/assistant/route.ts:51`).

**Frontera del endpoint.** La ruta resuelve primero el proveedor de LLM: por defecto usa Vertex AI con Gemini 2.5 Flash-Lite en `europe-west1`, con Anthropic como respaldo conmutable (`apps/web/src/lib/assistant/llm-provider.ts:20`, `:21`, `:52`). Si falta la configuración, responde `503` con `ASSISTANT_UNAVAILABLE` sin gastar tokens (`apps/web/src/app/api/assistant/route.ts:99`, `:100`). Después:

1. Sanea la conversación: máximo 40 mensajes, recorte a 4000 caracteres por mensaje y presupuesto total de 24 000 caracteres; si no cumple, responde `400` con `BAD_REQUEST` (`apps/web/src/app/api/assistant/route.ts:16`, `:18`, `:71`, `:73`, `:109`).
2. Aplica el limitador de peticiones por IP y, si hay cartera válida, también por cartera: 10 peticiones por minuto, 200 por día y 60 000 caracteres por minuto (`apps/web/src/app/api/assistant/route.ts:117`; `apps/web/src/lib/assistant/rate-limit.ts:45`). Si se excede, responde `429` con `Retry-After` y no llama al modelo (`apps/web/src/app/api/assistant/route.ts:38`, `:41`).
3. Abre un gateway MCP contra `MCP_BASE_URL` (por defecto `http://127.0.0.1:8788/mcp`) y, si existe, con `MCP_SHARED_SECRET` como `Authorization: Bearer` (`apps/web/src/app/api/assistant/route.ts:15`, `:125`; `apps/web/src/lib/assistant/mcp-gateway.ts:58`, `:60`).
4. Compone el prompt de sistema con la fecha de hoy en UTC y la cartera conectada (`apps/web/src/app/api/assistant/route.ts:133`; `apps/web/src/lib/assistant/prompt.ts:33`).

**Alcance y guardrails del prompt.** El prompt fija la única función del asistente: consultar disponibilidad y precio de noches, ver las noches de una cartera y preparar la compra para que la firme el usuario (`apps/web/src/lib/assistant/prompt.ts:7`). Obliga a usar herramientas para cualquier dato y a no inventar `tokenId`, precios ni estados (`:13`); obliga a confirmar noche y precio antes de preparar la compra (`:15`); si la noche no existe o no está disponible, obliga a ofrecer al menos una alternativa del mismo tipo (`:16`); declara que el asistente **nunca firma** ni maneja claves (`:17`); rechaza peticiones fuera de dominio (`:18`), prohíbe revelar las instrucciones (`:19`) e ignorar inyecciones de prompt (`:20`) y exige responder en español (`:21`). Como red de seguridad dura, si la respuesta reproduce una firma canónica del prompt se sustituye por un texto neutro (`apps/web/src/lib/assistant/prompt-leak-filter.ts:57`; `apps/web/src/app/api/assistant/route.ts:20`, `:136`).

**Orquestación.** `runAssistant` pide la lista de herramientas al MCP y entra en un bucle de hasta 4 rondas (`apps/web/src/lib/assistant/orchestrator.ts:28`, `:44`, `:55`). Si el modelo responde sin herramientas, se devuelve su texto (`:57`). Si pide herramientas, las ejecuta por el gateway y las cuenta en `domainToolCalls` (`:63`, `:64`). La llamada a la herramienta de preparación de compra se intercepta en el propio orquestador (`:67`, `:86`).

**Herramientas del MCP.** El servidor MCP registra cuatro herramientas de lectura (`listAvailableNights`, `checkAvailability`, `getOwnedNights`, `searchHotelManuals`) y una de preparación sin firma (`buildPurchaseTx`); no existe ninguna herramienta de firma ni de custodia (`apps/mcp/src/server.ts:36`, `:46`, `:56`, `:66`, `:75`, `:92`).

- `checkAvailability(room, date)` codifica el `tokenId` a partir de habitación y fecha `AAAAMMDD`, lee las señales on-chain y devuelve si existe, si es comprable y su precio (`apps/mcp/src/tools/tools.ts:134`, `:140`, `:146`, `:149`; `apps/mcp/src/tools/schemas.ts:22`).
- `buildPurchaseTx(tokenId)` no se fía del llamante: relee el estado y el precio on-chain, rechaza la noche inexistente o no comprable y compone `to`, `data`, `value` y `chainId` **sin firmar** (`apps/mcp/src/tools/tools.ts:182`, `:193`, `:195`, `:200`, `:202`).

**Validación server-side, independiente del modelo.** Antes de ofrecer una compra, el servidor re-deriva el precio por su cuenta. `createTxValidator` lee de la cadena `ownerOf`, `soldOnce`, `isExpired`, `listingOf` y `priceOf` (`apps/web/src/lib/assistant/chain-pricing.ts:16`, `:20`, `:25`). Después, `verifyPreparedPurchase` comprueba que la noche existe y es comprable (`apps/web/src/lib/assistant/validate-tx.ts:57`, `:59`) y `verifyPurchaseTx` comprueba que la transacción apunta al contrato canónico, a la cadena esperada, lleva exactamente el precio on-chain y llama a `buy`/`buyResale` con el `tokenId` pedido (`packages/shared/src/domain/purchase-tx.ts:90`, `:94`, `:102`, `:105`). Si algo no cuadra, el orquestador devuelve `VALIDATION_FAILED` y **no hay compra preparada** (`apps/web/src/lib/assistant/orchestrator.ts:95`, `:97`).

**Re-verificación delante del huésped.** Si la compra preparada valida, la UI pinta la tarjeta `PurchaseHandoff` (`apps/web/src/components/assistant/AssistantChat.tsx:152`). Ese componente decodifica el `tokenId` real del calldata y vuelve a leer el precio on-chain (`priceOf` o `listingOf.price`) y `soldOnce` con caché desactivada (`apps/web/src/components/buy/usePurchaseReview.ts:72`, `:77`, `:85`, `:96`). La comprobación de cliente (`reverifyPurchase`) es la misma que usa el catálogo (`apps/web/src/components/assistant/reverify.ts:38`, `:50`). El botón de firma solo se habilita si la cartera está conectada y en la red correcta, la verificación cierra bien y hay saldo suficiente (`apps/web/src/components/assistant/PurchaseHandoff.tsx:62`, `:67`, `:70`).

**Firma.** La firma es siempre del huésped en su cartera. El componente llama a `verifiedTxRequest(tx, contractAddress)`, que falla en cerrado con tres guardas: el calldata debe decodificar como `buy`/`buyResale`, el destino debe ser exactamente el contrato canónico y el importe debe ser un entero en wei (`apps/web/src/components/buy/verifiedTxRequest.ts:40`, `:43`, `:50`). Solo entonces se envía la transacción a la cartera (`apps/web/src/components/assistant/PurchaseHandoff.tsx:81`). El asistente no firma, no mueve fondos y no custodia claves (`docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md:14`, `:19`).

## Recorrido real

1. Abre `/asistente`. Está en el menú de la cabecera, dentro del desplegable `Descubre`, con el rótulo `Asistente` (`apps/web/src/components/layout/SiteHeader.tsx:75`, `:68`; `apps/web/messages/es.json:153`, `:128`).
2. Arriba ves el título `Asistente IA` y el subtítulo `Pregunta por disponibilidad y prepara tu reserva; tú firmas en tu wallet.` (`apps/web/src/app/asistente/page.tsx:11`, `:12`; `apps/web/messages/es.json:870`, `:871`).
3. Antes del primer mensaje, el chat saluda: `Hola, soy el asistente del Hotel Marina del Sol. Puedo ayudarte a consultar disponibilidad y preparar la reserva de una noche.` Debajo aparecen tres sugerencias: `Ver suites en junio`, `Mis reservas` y `Reservar una noche` (`apps/web/src/components/assistant/AssistantChat.tsx:83`, `:67`; `apps/web/messages/es.json:872`, `:883`, `:884`, `:885`).
4. Escribe tu petición en el cuadro de abajo; el marcador de posición es `Ej.: ¿hay alguna suite disponible en junio?` (`apps/web/src/components/assistant/AssistantChat.tsx:162`; `apps/web/messages/es.json:874`). `Enter` envía y `Mayús+Enter` inserta una línea nueva (`apps/web/src/components/assistant/AssistantChat.tsx:53`).
5. Pulsa `Enviar` (el botón está desactivado si el cuadro está vacío o el asistente sigue pensando) (`apps/web/src/components/assistant/AssistantChat.tsx:172`, `:175`; `apps/web/messages/es.json:875`).
6. Mientras esperas, en el chat se lee `Pensando…` (`apps/web/src/components/assistant/AssistantChat.tsx:119`; `apps/web/messages/es.json:876`).
7. Lee la respuesta: te dice si la noche existe, si se puede comprar y su precio. Si no existe o no está disponible, te ofrece alternativas del mismo tipo (`apps/web/src/lib/assistant/prompt.ts:16`).
8. Cuando tengas clara la noche, contéstale que sí. Puede pedirte que confirmes noche y precio (`apps/web/src/lib/assistant/prompt.ts:15`).
9. Con tu confirmación, el asistente prepara la compra y aparece la tarjeta `Reserva preparada — revisa y firma` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:106`, `:111`; `apps/web/messages/es.json:888`).
10. La tarjeta lista cinco datos: `Habitación` (habitación y tipo, p. ej. `116 (Doble)`; el tipo sale del maestro de habitaciones, `apps/web/src/lib/format.ts:83` y `packages/shared/src/domain/room-master.ts:24`), `Noche` (en formato `AAAAMMDD`), `Token`, `Contrato` e `Importe` (en ETH) (`apps/web/src/components/assistant/PurchaseHandoff.tsx:112`, `:117`, `:122`, `:124`, `:127`, `:130`).
11. Si tu cartera está lista, se añade `Firmarás con la wallet conectada {address}` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:134`; `apps/web/messages/es.json:898`).
12. Mientras se lee el precio on-chain verás `Verificando el precio on-chain…` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:141`, `:153`; `apps/web/messages/es.json:899`). Nota: el CU-08 describe un sello **Verificado**; en el código real no existe ese rótulo literal, y cuando la verificación cierra bien lo único que cambia es que se habilita el botón de firmar.
13. Según el estado de tu cartera, el botón dice `Conecta tu wallet para reservar`, `Cambia de red para reservar` o `Firmar reserva` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:215`, `:219`, `:224`; `apps/web/messages/es.json:896`, `:897`, `:895`).
14. Pulsa `Firmar reserva`. Se abre tu cartera con el importe a la vista y firmas ahí (`apps/web/src/components/assistant/PurchaseHandoff.tsx:81`). A partir de este punto manda CU-05.
15. Al confirmarse en la red, la tarjeta se colapsa y muestra `¡Noche reservada!`, `Tu reserva se ha confirmado. Ya puedes verla en tus noches.` y el botón `Ver en Mis noches` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:85`, `:92`, `:94`, `:99`; `apps/web/messages/es.json:904`, `:905`, `:906`).
16. Si el asistente no está disponible, aparece un aviso con `El asistente no está disponible ahora mismo. Puedes seguir reservando desde el catálogo.`, el botón `Reintentar` y el enlace `Ir al catálogo` (`apps/web/src/components/assistant/AssistantChat.tsx:126`, `:132`, `:142`, `:146`; `apps/web/messages/es.json:877`, `:880`, `:878`).

## Piezas de código implicadas

- **Página y entrada desde la cabecera**
  - Ruta del asistente: `apps/web/src/app/asistente/page.tsx:5`, `:8`, `:11`, `:14`.
  - Entrada de menú: `apps/web/src/components/layout/SiteHeader.tsx:75`; rótulo `apps/web/messages/es.json:128`.
- **Panel de chat**
  - Componente: `apps/web/src/components/assistant/AssistantChat.tsx:14`, `:16`, `:17`, `:53`, `:67`, `:83`, `:119`, `:126`, `:142`, `:152`, `:162`, `:175`.
- **Estado de la conversación**
  - Hook: `apps/web/src/components/assistant/useAssistant.ts:35`, `:36`, `:44`, `:52`, `:60`, `:63`, `:65`, `:68`, `:88`, `:98`.
- **Tipos del asistente**
  - `ChatMessage`, `PreparedPurchase` y `AssistantResult`: `apps/web/src/lib/assistant/types.ts:57`, `:63`, `:68`.
- **Endpoint**
  - `POST /api/assistant`: `apps/web/src/app/api/assistant/route.ts:97`, `:99`, `:108`, `:117`, `:125`, `:133`, `:134`, `:136`, `:138`.
  - Saneamiento y límites: `apps/web/src/app/api/assistant/route.ts:16`, `:18`, `:71`, `:73`; `apps/web/src/lib/assistant/rate-limit.ts:45`, `:96`, `:113`.
- **Proveedor de LLM**
  - Conmutador y modelos: `apps/web/src/lib/assistant/llm-provider.ts:20`, `:21`, `:22`, `:52`.
- **Prompt y filtro anti-fuga**
  - Prompt de sistema: `apps/web/src/lib/assistant/prompt.ts:7`, `:13`, `:15`, `:16`, `:17`, `:18`, `:19`, `:20`, `:21`, `:33`.
  - Filtro: `apps/web/src/lib/assistant/prompt-leak-filter.ts:19`, `:44`, `:57`.
- **Orquestación y validación**
  - Bucle de herramientas: `apps/web/src/lib/assistant/orchestrator.ts:28`, `:40`, `:44`, `:55`, `:57`, `:63`, `:67`, `:86`, `:93`, `:95`, `:102`.
  - Precio on-chain server-side: `apps/web/src/lib/assistant/chain-pricing.ts:16`, `:20`, `:25`, `:42`.
  - Validación pura: `apps/web/src/lib/assistant/validate-tx.ts:15`, `:35`, `:56`, `:57`, `:59`.
  - Verificación de la tx: `packages/shared/src/domain/purchase-tx.ts:19`, `:39`, `:59`, `:86`, `:90`, `:94`, `:102`, `:106`.
- **MCP**
  - Registro de herramientas: `apps/mcp/src/server.ts:36`, `:46`, `:56`, `:66`, `:75`, `:92`.
  - Implementación: `apps/mcp/src/tools/tools.ts:71`, `:134`, `:158`, `:182`.
  - Esquemas de entrada: `apps/mcp/src/tools/schemas.ts:15`, `:22`, `:28`, `:32`.
  - Errores de herramienta: `apps/mcp/src/tools/errors.ts:2`, `:4`.
  - Gateway HTTP: `apps/web/src/lib/assistant/mcp-gateway.ts:33`, `:58`, `:67`, `:77`.
- **Handoff y firma**
  - Tarjeta: `apps/web/src/components/assistant/PurchaseHandoff.tsx:39`, `:44`, `:62`, `:70`, `:81`, `:85`, `:111`, `:112`, `:134`, `:141`, `:156`, `:174`, `:194`, `:215`, `:238`.
  - Re-verificación de cliente: `apps/web/src/components/assistant/reverify.ts:38`, `:43`, `:50`.
  - Revisión reutilizada del catálogo: `apps/web/src/components/buy/usePurchaseReview.ts:57`, `:72`, `:85`, `:96`, `:122`, `:125`, `:148`.
  - Punto único de firma: `apps/web/src/components/buy/verifiedTxRequest.ts:35`, `:40`, `:43`, `:50`.
  - Estados y errores de transacción: `apps/web/src/components/tx/txStatus.ts:2`, `:12`; `apps/web/src/components/tx/txError.ts:6`, `:26`.
  - Recibo: `apps/web/src/components/buy/TxModal.tsx:110`, `:247`.
- **Wallet y cadena**
  - Estado de conexión y red: `apps/web/src/components/wallet/useOnboarding.ts:66`, `:67`.
  - Contrato y cadena: `apps/web/src/config/chain.ts:13`, `:80`.
- **Estado de una noche**
  - Máquina de estados: `packages/shared/src/domain/night-state.ts:16`, `:25`.
  - Codificación del `tokenId`: `packages/shared/src/domain/token-id.ts:63`, `:77`.
  - Tipo de habitación: `packages/shared/src/domain/room-master.ts:37`.

## Datos y estados

- **Mensaje de chat** (`ChatMessage`): rol `user` o `assistant` y texto (`apps/web/src/lib/assistant/types.ts:57`). El endpoint recorta cada mensaje a 4000 caracteres (`apps/web/src/app/api/assistant/route.ts:71`).
- **Compra preparada** (`PreparedPurchase`): `tokenId` y una transacción `PurchaseTxData` (`apps/web/src/lib/assistant/types.ts:63`).
- **Transacción de compra** (`PurchaseTxData`): `to`, `data`, `value` (wei como texto) y `chainId` (`packages/shared/src/domain/purchase-tx.ts:19`). Soporta las funciones `buy` (primaria) y `buyResale` (reventa) (`packages/shared/src/domain/purchase-tx.ts:35`).
- **Señales de precio** (`NightPricing`): si existe, si ya se vendió (`soldOnce`), si caducó, si está listada y los precios primario y de listado (`apps/web/src/lib/assistant/validate-tx.ts:15`).
- **Estados de la noche** según las señales on-chain: `EXPIRADA`, `LISTADA_SECUNDARIO`, `EN_PODER_CLIENTE` y `DISPONIBLE` (`packages/shared/src/domain/night-state.ts:18`, `:19`, `:20`, `:21`). Solo `DISPONIBLE` y `LISTADA_SECUNDARIO` son comprables (`packages/shared/src/domain/night-state.ts:25`).
- **Estados de la tarjeta de compra:** `Verificando el precio on-chain…` mientras se lee el precio (`apps/web/src/components/assistant/PurchaseHandoff.tsx:141`; `apps/web/messages/es.json:899`); la verificación correcta no muestra rótulo propio, solo habilita `Firmar reserva` (`apps/web/messages/es.json:895`); `verifyFailed` si la lectura falla y `reverifyFailed` si los datos no cuadran con el precio on-chain (`apps/web/src/components/assistant/PurchaseHandoff.tsx:156`, `:183`; `apps/web/messages/es.json:900`, `:903`).
- **Estados de la transacción de escritura:** `idle`, `signing`, `pending`, `confirmed` y `reverted` (`apps/web/src/components/tx/txStatus.ts:2`, `:12`). El recibo se apoya en el modal del catálogo, que usa los textos de `buy.*` (`apps/web/src/components/buy/TxModal.tsx:110`; `apps/web/messages/es.json:300`, `:305`).
- **Estados de la cartera:** desconectada, red equivocada o lista (`apps/web/src/components/wallet/useOnboarding.ts:66`, `:67`).
- **Mensajes reales del chat y del handoff:**
  - `Asistente IA` y su subtítulo (`apps/web/messages/es.json:870`, `:871`).
  - Saludo inicial (`apps/web/messages/es.json:872`).
  - Marcador del cuadro: `Ej.: ¿hay alguna suite disponible en junio?` (`apps/web/messages/es.json:874`).
  - `Enviar` y `Pensando…` (`apps/web/messages/es.json:875`, `:876`).
  - `El asistente no está disponible ahora mismo. Puedes seguir reservando desde el catálogo.` (`apps/web/messages/es.json:877`), con `Reintentar` (`:880`) e `Ir al catálogo` (`:878`).
  - `Lo siento, no he podido responder ahora mismo. Inténtalo de nuevo en un momento.` (`apps/web/messages/es.json:879`).
  - Sugerencias: `Ver suites en junio`, `Mis reservas`, `Reservar una noche` (`apps/web/messages/es.json:883`, `:884`, `:885`).
  - `Reserva preparada — revisa y firma` (`apps/web/messages/es.json:888`), campos `Habitación`, `Noche`, `Token`, `Contrato`, `Importe` (`:889`, `:891`, `:892`, `:893`, `:894`) y `{room} ({type})` (`:890`).
  - `Firmar reserva`, `Conecta tu wallet para reservar`, `Cambia de red para reservar` (`apps/web/messages/es.json:895`, `:896`, `:897`).
  - `Firmarás con la wallet conectada {address}` (`apps/web/messages/es.json:898`).
  - `Verificando el precio on-chain…` (`apps/web/messages/es.json:899`).
  - `No pudimos verificar el precio on-chain. Comprueba tu conexión a la red e inténtalo de nuevo.` y `Reintentar verificación` (`apps/web/messages/es.json:900`, `:901`).
  - `Te faltan {missing} {symbol} (tienes {have}, necesitas {need}).` (`apps/web/messages/es.json:902`).
  - `Los datos de la transacción no coinciden con el precio on-chain. No firmes: vuelve a intentarlo.` (`apps/web/messages/es.json:903`).
  - `¡Noche reservada!`, `Tu reserva se ha confirmado. Ya puedes verla en tus noches.`, `Ver en Mis noches` (`apps/web/messages/es.json:904`, `:905`, `:906`).
  - `Puedes cerrar: la reserva continúa y aparecerá en «Mis noches».` e `Intentar de nuevo` (`apps/web/messages/es.json:907`, `:908`).
  - `Has cancelado la firma. Puedes intentarlo de nuevo.` y `No se pudo completar la reserva. Revisa la red y vuelve a intentarlo.` (`apps/web/messages/es.json:910`, `:911`).
  - `Esta noche ya está vendida. Pide otra al asistente o elígela en el catálogo.` (`apps/web/messages/es.json:913`).
- **Respuestas HTTP del endpoint:** `400 BAD_REQUEST` (conversación vacía, con roles inválidos o fuera de presupuesto), `429 RATE_LIMITED` (con cabecera `Retry-After`) y `503 ASSISTANT_UNAVAILABLE` (sin proveedor, MCP o RPC) (`apps/web/src/app/api/assistant/route.ts:109`, `:40`, `:87`).
- **Motivos de rechazo de la validación** (`verifyPurchaseTx`): `to≠contrato`, `chainId≠esperado`, `value≠precio`, `tokenId≠pedido` y `calldata no es buy/buyResale` (`packages/shared/src/domain/purchase-tx.ts:90`, `:94`, `:102`, `:106`, `:108`).
- **Errores de herramienta del MCP:** `INVALID_INPUT`, `NIGHT_NOT_FOUND` y `NIGHT_NOT_PURCHASABLE` (`apps/mcp/src/tools/errors.ts:4`; `apps/mcp/src/tools/tools.ts:191`, `:195`, `:200`).

## Casos límite y errores

- **Sin cartera conectada.** El chat funciona para preguntar, pero el botón de la tarjeta pasa a `Conecta tu wallet para reservar` y no se puede firmar (`apps/web/src/components/assistant/PurchaseHandoff.tsx:215`; `apps/web/messages/es.json:896`).
- **Red equivocada.** El botón pasa a `Cambia de red para reservar`; con la red correcta y la verificación en orden, se habilita `Firmar reserva` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:219`, `:70`; `apps/web/messages/es.json:897`).
- **Petición fuera de dominio.** El prompt obliga a rechazarla sin usar ninguna herramienta y a volver al tema de las noches (`apps/web/src/lib/assistant/prompt.ts:18`; el contador `domainToolCalls` queda a cero, `apps/web/src/lib/assistant/types.ts:71`).
- **Intento de inyección o de sacar el prompt.** El prompt lo prohíbe y, además, el filtro duro redacta la respuesta si reproduce una firma canónica, sustituyéndola por `Solo puedo ayudarte con disponibilidad, precios y la compra de noches del hotel.` (`apps/web/src/lib/assistant/prompt.ts:19`, `:20`; `apps/web/src/lib/assistant/prompt-leak-filter.ts:57`; `apps/web/src/app/api/assistant/route.ts:20`, `:21`, `:136`).
- **La noche no existe.** `checkAvailability` devuelve `exists=false` y el prompt obliga a ofrecer alternativas del mismo tipo (`apps/mcp/src/tools/tools.ts:146`; `apps/web/src/lib/assistant/prompt.ts:16`).
- **La noche existe pero no es comprable.** Puede estar expirada, ya vendida o no listada: `checkAvailability` devuelve `available=false` y preparar la compra falla con `NIGHT_NOT_PURCHASABLE` (`apps/mcp/src/tools/tools.ts:151`, `:200`; `packages/shared/src/domain/night-state.ts:18`, `:19`, `:20`).
- **Precio manipulado en la transacción preparada.** La validación server-side falla con `VALIDATION_FAILED` y sus motivos, y no se ofrece compra (`apps/web/src/lib/assistant/orchestrator.ts:97`; `packages/shared/src/domain/purchase-tx.ts:102`).
- **Fallo al leer el precio on-chain.** La tarjeta muestra `No pudimos verificar el precio on-chain. Comprueba tu conexión a la red e inténtalo de nuevo.` con `Reintentar verificación`, y el botón de firmar queda deshabilitado (`apps/web/src/components/assistant/PurchaseHandoff.tsx:156`, `:166`; `apps/web/messages/es.json:900`, `:901`).
- **El precio del calldata no cuadra con el precio leído.** Aparece `Los datos de la transacción no coinciden con el precio on-chain. No firmes: vuelve a intentarlo.` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:183`; `apps/web/messages/es.json:903`).
- **Noche ya vendida.** Si `soldOnce` es cierto, el mensaje es específico: `Esta noche ya está vendida. Pide otra al asistente o elígela en el catálogo.` (`apps/web/src/components/buy/usePurchaseReview.ts:129`; `apps/web/src/components/assistant/PurchaseHandoff.tsx:174`; `apps/web/messages/es.json:913`).
- **Saldo insuficiente.** Se avisa con el detalle de lo que falta, lo que se tiene y lo que se necesita, y no se habilita la firma (`apps/web/src/components/assistant/PurchaseHandoff.tsx:67`, `:194`; `apps/web/messages/es.json:902`).
- **Firma cancelada en la cartera.** Se clasifica como rechazo del usuario y se muestra `Has cancelado la firma. Puedes intentarlo de nuevo.` (`apps/web/src/components/tx/txError.ts:26`; `apps/web/messages/es.json:910`).
- **Fallo de la transacción.** Se muestra `No se pudo completar la reserva. Revisa la red y vuelve a intentarlo.` con `Intentar de nuevo` (`apps/web/src/components/assistant/PurchaseHandoff.tsx:248`, `:255`; `apps/web/messages/es.json:911`, `:908`).
- **El asistente agota las cuatro rondas de herramientas.** Se cierra con una última respuesta sin herramientas en lugar de dejar la conversación abierta (`apps/web/src/lib/assistant/orchestrator.ts:74`).
- **Sin proveedor de LLM, sin MCP o sin RPC.** El endpoint responde `503 ASSISTANT_UNAVAILABLE` sin filtrar el detalle; la UI muestra el aviso con `Reintentar` y `Ir al catálogo` (`apps/web/src/app/api/assistant/route.ts:84`, `:87`, `:100`; `apps/web/src/components/assistant/AssistantChat.tsx:126`, `:142`).
- **Demasiadas peticiones.** El servidor responde `429` con `Retry-After` y no llama al modelo (`apps/web/src/app/api/assistant/route.ts:38`; `apps/web/src/lib/assistant/rate-limit.ts:113`). El CU-08 habla de un aviso «Demasiadas peticiones»; en el código real no existe esa cadena, y cualquier respuesta que no sea correcta la trata la UI como asistente no disponible (`apps/web/src/components/assistant/useAssistant.ts:65`).
- **Conversación inválida o demasiado larga.** El endpoint responde `400 BAD_REQUEST` si la lista está vacía, supera los 40 mensajes o los 24 000 caracteres, o trae roles que no son `user`/`assistant` (`apps/web/src/app/api/assistant/route.ts:62`, `:73`, `:109`).
- **Fallo de red al enviar.** El hook inyecta en el chat el texto neutro de error y muestra el aviso de no disponible; el botón `Reintentar` reenvía la última conversación (`apps/web/src/components/assistant/useAssistant.ts:52`, `:56`, `:88`, `:98`).
- **Límite conocido del limitador.** El control de peticiones vive en memoria del proceso: vale para el despliegue de una sola instancia del piloto y no para varias réplicas (`apps/web/src/lib/assistant/rate-limit.ts:8`; `apps/web/src/app/api/assistant/route.ts:24`).
- **Garantía honesta frente a «noche equivocada».** El `tokenId` que afirma el modelo no es por sí solo una defensa: lo que protege de verdad es el precio on-chain, el contrato y la revisión del huésped en la tarjeta (`apps/web/src/components/assistant/reverify.ts:6`, `apps/web/src/lib/assistant/orchestrator.ts:88`).
- **Herramienta de conocimiento.** El MCP también expone `searchHotelManuals` (`apps/mcp/src/server.ts:92`), pero el prompt de sistema no la menciona entre las funciones del asistente (`apps/web/src/lib/assistant/prompt.ts:7`): su uso real desde el chat queda pendiente de confirmar.

## Referencias

- CU-08 · Pedirle una noche al asistente y que prepare la compra, fuente funcional (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-08-asistente-ia.md:1`).
- Caso de uso CU-08 en el catálogo del proyecto (`docs/CASOS-DE-USO.md:478`).
- SRS §9 · Catálogo de casos de uso (`docs/SRS.md:342`). Aviso de numeración: el SRS lista esta función como CU-16 (`docs/SRS.md:364`) y reserva CU-08 para el resguardo de check-in (`docs/SRS.md:356`), mientras que `docs/CASOS-DE-USO.md` y los manuales usan CU-08 para el asistente. La discrepancia está pendiente de confirmar.
- SRS · Requisito RF-20, trazado a la fila CU-16 del catálogo (`docs/SRS.md:406`).
- ADR-11 · Nunca se firma una transacción no verificada (`docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md:14`).
- Diseño técnico, apartado de ADR-11: LLM server-side, MCP de solo lectura y doble verificación antes de firmar (`docs/DISENO-TECNICO.md:83`).
- Manual técnico hermano del caso de uso (`RepoTecnico/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-08-asistente-ia.md:1`).
- Manual del comprador, apartado del asistente (`docs/manual-comprador.md:83`).
