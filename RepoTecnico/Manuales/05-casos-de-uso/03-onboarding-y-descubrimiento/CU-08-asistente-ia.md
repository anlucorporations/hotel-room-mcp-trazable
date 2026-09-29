# CU-08 · Pedirle una noche al asistente y que prepare la compra — Manual técnico

> Bloque 3 · Onboarding y descubrimiento · Actor: Comprador (chat) · Requisitos: RF-12, RF-02, RNF-05, RNF-19

## 1. Ficha y trazabilidad

- **Objetivo.** Que un comprador pueda escribir en lenguaje natural («quiero la 102 para el 15 de
  junio»), consultar disponibilidad y precio reales, y terminar con los datos de la transacción
  preparados para firmarla en su cartera. El asistente **no firma ni mueve fondos**.
- **Actor primario.** Comprador por chat. **Secundarios:** el servidor MCP del contrato (herramientas
  de lectura y de preparación), el LLM (Anthropic) y el RPC que valida el precio.
- **Requisitos que cubre.** RF-12 (asistente con herramientas), RF-02 (lectura de disponibilidad),
  RNF-05 (integridad de la compra: precio on-chain) y RNF-19 (guardrails web3).
- **Precondición.** Cartera conectada para firmar y para el contexto de «mis noches»
  (`apps/web/src/components/assistant/AssistantChat.tsx:16`); MCP y LLM operativos y
  `ANTHROPIC_API_KEY` presente (`apps/web/src/app/api/assistant/route.ts:98`).
- **Disparador.** El cliente escribe un mensaje en `/asistente`.
- **Postcondición.** O bien una respuesta de texto, o bien un `preparedPurchase` validado que la UI
  ofrece firmar (`route.ts:136`; `PurchaseHandoff`).
- **Dónde vive.**
  - Ruta: `apps/web/src/app/asistente/page.tsx:5`.
  - UI: `apps/web/src/components/assistant/AssistantChat.tsx:14` y `useAssistant.ts:35`.
  - Endpoint: `apps/web/src/app/api/assistant/route.ts:97` (`POST /api/assistant`).
  - Orquestación: `apps/web/src/lib/assistant/orchestrator.ts:40`.
  - Prompt: `apps/web/src/lib/assistant/prompt.ts:7` y `:33`.
  - Handoff a firma: `apps/web/src/components/assistant/PurchaseHandoff.tsx:39`.
  - MCP: `apps/mcp/src/server.ts:38` (4 herramientas) y `apps/mcp/src/tools/tools.ts:69`.
  - Validación server-side: `apps/web/src/lib/assistant/chain-pricing.ts:42` y `validate-tx.ts:56`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El usuario abre `/asistente`; la página monta `AssistantChat`
   (`apps/web/src/app/asistente/page.tsx:14`).
2. `AssistantChat` toma la dirección conectada con `useOnboarding()` y la pasa al hook
   (`AssistantChat.tsx:16`–`:17`); hay chips de sugerencia mientras no hay mensajes (`:86`).
3. Al enviar, `useAssistant` hace `POST /api/assistant` con `{ messages, walletAddress }`
   (`apps/web/src/components/assistant/useAssistant.ts:60`–`:64`).
4. El endpoint exige `ANTHROPIC_API_KEY` (`route.ts:99`), sanea la conversación (máx. 40 mensajes,
   4000 caracteres por mensaje y 24 000 en total, `:17`–`:19` y `:62`–`:78`) y aplica el limitador
   por IP y por wallet antes de llamar al LLM (`:116`–`:122`).
5. Instancia el gateway MCP contra `MCP_BASE_URL` (por defecto `http://127.0.0.1:8788/mcp`,
   `route.ts:15`) con `MCP_SHARED_SECRET` si existe (`:124`–`:126`), y compone el prompt de sistema
   con la fecha UTC y la wallet (`:133`; `prompt.ts:33`–`:41`).
6. `runAssistant` pide las herramientas al MCP (`orchestrator.ts:44`) y entra en un bucle de hasta
   `DEFAULT_MAX_ROUNDS = 4` rondas (`:28` y `:55`).
7. En cada ronda, si el LLM pide herramientas, se ejecutan por el gateway (`orchestrator.ts:63`–`:70`)
   y se cuentan en `domainToolCalls` (`:52` y `:64`).
8. La herramienta estrella es `checkAvailability(room, date)` del MCP
   (`apps/mcp/src/tools/tools.ts:132`), que codifica el `tokenId`, lee señales on-chain y devuelve
   `exists`/`available`/`priceWei`/`saleType` (`:138`–`:152`).
9. Si la noche no existe o no es comprable, el prompt obliga a llamar a `listAvailableNights` con el
   filtro de tipo para ofrecer al menos una alternativa (`prompt.ts:16`; `tools.ts:69`).
10. Tras la confirmación del usuario, el LLM llama a `buildPurchaseTx(tokenId)`
    (`apps/mcp/src/server.ts:71`); el MCP **no firma**, solo compone `to`, `data`, `value` y `chainId`
    (`tools.ts:180`–`:206`).
11. `dispatchTool` intercepta esa herramienta y valida la tx server-side con `validatePreparedTx`
    (`orchestrator.ts:86`–`:99`), que relee el precio y el estado por su cuenta
    (`chain-pricing.ts:46`–`:55`) y comprueba `exists`, comprabilidad, `value == precio`, `to`,
    `chainId` y selector (`validate-tx.ts:56`–`:66`).
12. Solo si valida, `runAssistant` devuelve `preparedPurchase` (`orchestrator.ts:100`–`:103`); el
    endpoint pasa la respuesta por el filtro anti-fuga del prompt (`route.ts:136`;
    `prompt-leak-filter.ts:57`) y la devuelve.
14. La UI pinta el handoff (`AssistantChat.tsx:152`); `PurchaseHandoff` **re-verifica** el calldata
    real contra el precio on-chain (`PurchaseHandoff.tsx:28`–`:30` y `:44`), muestra los tres estados
    (verificando/verificado/fallido, `:141`–`:177`) y solo entonces habilita la firma
    (`:70`–`:75` y `:210`–`:221`). Al confirmar se envía la tx verificada al contrato canónico
    (`:81`); la continuación es CU-05.

### 2.2 Validaciones

- **Herramientas sin firma.** El MCP registra exactamente cuatro herramientas, tres de lectura y
  `buildPurchaseTx` (`server.ts:42`, `:52`, `:62` y `:71`); no hay ninguna de firma ni de custodia
  (`server.ts:34`–`:36`).
- **Precio on-chain.** `buildPurchaseTx` no se fía del llamante: relee el estado y usa siempre el
  precio de `priceOf`/`listingOf` (`tools.ts:176`–`:199`).
- **Entrada de herramientas.** Esquemas Zod: ventana `AAAAMMDD`, fecha, dirección `0x…40`, y
  `tokenId` como string para no perder precisión (`apps/mcp/src/tools/schemas.ts:8`–`:22`).
- **Guardrails de prompt.** Dominio acotado, no revelar instrucciones, ignorar prompt injection y
  responder en español (`prompt.ts:12`–`:21`).
- **Filtro duro anti-fuga.** `redactPromptLeak` sustituye la respuesta por un texto neutro si
  reproduce una firma canónica del prompt (`prompt-leak-filter.ts:19`–`:24` y `:44`–`:51`).
- **Saneamiento de la petición.** Se rechaza con **400** una conversación vacía, con roles inválidos
  o fuera de presupuesto (`route.ts:107`–`:108`).
- **Límite de peticiones.** `InMemoryRateLimiter` con 10/minuto, 200/día y 60 000 caracteres/minuto
  por clave (`rate-limit.ts:45`–`:49`); al exceder devuelve **429** con `Retry-After`
  (`route.ts:39`–`:43`).
- **Transporte del MCP.** Si la URL no es loopback y no hay secreto, el gateway avisa (confianza
  implícita); con secreto envía `Authorization: Bearer` (`mcp-gateway.ts:45`–`:51` y `:58`–`:62`).
- **08e.** Cualquier fallo (sin clave, MCP/RPC caídos) devuelve **503** `ASSISTANT_UNAVAILABLE` sin
  filtrar el detalle (`route.ts:85`–`:89` y `:137`–`:139`).

### 2.3 Efectos on-chain / persistencia

- **Ninguno hasta que el usuario firma.** El asistente solo lee la cadena y prepara datos; la
  escritura on-chain ocurre en el handoff, con la firma del usuario en MetaMask
  (`PurchaseHandoff.tsx:81`).
- El endpoint no escribe en base de datos: la conversación vive en memoria del cliente
  (`useAssistant.ts:36`).
- El limitador de peticiones es **en memoria del proceso**: válido para el despliegue single-instance
  del piloto, no para multi-instancia (`rate-limit.ts:8`–`:11` y `route.ts:24`–`:29`).
- La `preparedPurchase` que ve el usuario es la validada por el servidor; si la validación falla, no
  se le ofrece firmar (`orchestrator.ts:95`–`:99`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `POST /api/assistant` | `route.ts:97` | Server-side; el secreto del LLM no sale al cliente |
| `runAssistant` | `orchestrator.ts:40` | Bucle de herramientas con tope de 4 rondas |
| `buildSystemPrompt` | `prompt.ts:33` | Inyecta fecha UTC y wallet conectada |
| `listAvailableNights` | `tools.ts:69` | Alternativas del mismo tipo, dentro de la ventana |
| `checkAvailability` | `tools.ts:132` | `exists` / `available` / `priceWei` / `saleType` |
| `getOwnedNights` | `tools.ts:156` | Noches de una wallet (confirma con `ownerOf`) |
| `buildPurchaseTx` | `tools.ts:180` | Devuelve `to`, `data`, `value`, `chainId` sin firmar |
| `verifyPreparedPurchase` | `validate-tx.ts:56` | Validación independiente del LLM |
| `createTxValidator` | `chain-pricing.ts:42` | Lee `ownerOf`, `soldOnce`, `isExpired`, `listingOf`, `priceOf` |

### 4.2 Eventos y errores canónicos

- No hay eventos propios del asistente. Los datos salen de `Mint`/`Sale`/`Listed` vía el lector de
  cadena del MCP (`apps/mcp/src/chain/chain-reader.ts`).
- Errores de herramienta del MCP: `INVALID_INPUT` (tokenId no numérico, `tools.ts:189`),
  `NIGHT_NOT_FOUND` (`:193`) y `NIGHT_NOT_PURCHASABLE` (`:198`), devueltos como `isError`
  (`server.ts:78`–`:85`).
- Rechazo por validación server-side: `VALIDATION_FAILED` con motivos (`orchestrator.ts:96`–`:98`).
- HTTP del endpoint: `400 BAD_REQUEST`, `429 RATE_LIMITED` y `503 ASSISTANT_UNAVAILABLE`
  (`route.ts:105`, `:120` y `:88`).

### 4.3 Estructuras de datos y almacenamiento

- `ChatMessage = { role: "user" | "assistant", text }`; la entrada se recorta a 4000 caracteres por
  mensaje (`route.ts:72`).
- `PreparedPurchase = { tokenId, tx }`, con `tx: PurchaseTxData` (`orchestrator.ts:102`;
  `apps/web/src/lib/assistant/types.ts`).
- `AvailabilityResult` y `NightDescriptor` (`apps/mcp/src/tools/types.ts`): el descriptor lleva
  `tokenId`, `room`, `dateYYYYMMDD`, `type`, `priceWei` y `saleType`.
- El LLM recibe las herramientas con su `inputSchema` tal cual las expone el MCP
  (`mcp-gateway.ts:67`–`:75`), de modo que el esquema Zod es fuente única. No hay persistencia de la
  conversación ni de las compras preparadas.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Petición fuera de dominio | 0 llamadas a herramientas de dominio | `prompt.ts:18`; test `orchestrator.test.ts:46` |
| Prompt injection | No revela el prompt ni prepara tx | `prompt.ts:19`–`:20`; `orchestrator.test.ts:60` |
| Fuga literal del prompt | Respuesta redactada por filtro duro | `prompt-leak-filter.ts:57`; `route.ts:136` |
| Noche inexistente (08a) | `checkAvailability` → `exists=false` + alternativa del mismo tipo | `tools.ts:144`; `prompt.ts:16`; `tools.test.ts:166` |
| Noche no comprable (expirada) | `available=false`; `buildPurchaseTx` → `NIGHT_NOT_PURCHASABLE` | `tools.ts:198`; `tools.test.ts:158` y `:236` |
| Precio manipulado en la tx | `VALIDATION_FAILED`; no se ofrece firmar | `validate-tx.ts:56`; `orchestrator.test.ts:98` |
| La wallet pregunta por sus noches (08d) | `getOwnedNights(wallet)` | `useAssistant.ts:63`; `tools.ts:156` |
| Sin MCP/LLM/RPC (08e) | `data-testid="assistant-unavailable"` + reintento + enlace manual | `AssistantChat.tsx:126`–`:149`; `route.ts:88` |
| Falta `ANTHROPIC_API_KEY`, o conversación vacía/ inválida/demasiado larga | 503 `ASSISTANT_UNAVAILABLE`; 400 `BAD_REQUEST` | `route.ts:99`, `:107` y `:74` |
| Abuso de peticiones | 429 `RATE_LIMITED` con `Retry-After` | `route.ts:117`–`:120`; `rate-limit.ts:113` |
| tokenId no numérico | `INVALID_INPUT` | `tools.ts:189` |
| El LLM agota las 4 rondas | Cierre forzado sin más herramientas | `orchestrator.ts:74`–`:76` |

## 6. Pruebas y evidencia

- `apps/mcp/src/tools/tools.test.ts:86` — `listAvailableNights` (ventana, tipo, excluye expiradas);
  `:133` `checkAvailability` (DISPONIBLE, LISTADA, expirada, inexistente con alternativa, fecha
  inválida); `:181` `getOwnedNights`; `:199` `buildPurchaseTx` (primaria verificable, reventa,
  rechazos, `INVALID_INPUT`).
- `apps/mcp/src/http-server.test.ts:122` — el transporte MCP expone las 4 herramientas y ejecuta
  `checkAvailability`.
- `apps/web/src/lib/assistant/orchestrator.test.ts:46` — fuera de dominio → 0 tool-calls; `:60`
  prompt injection; `:77` encadena `checkAvailability` → `buildPurchaseTx`; `:98` descarta la compra
  si falla la validación server-side.
- `apps/web/src/lib/assistant/validate-tx.test.ts:29` — acepta primaria y reventa; rechaza noche
  inexistente, no comprable, `value` alterado y precio de reventa cambiado.
- `apps/web/src/lib/assistant/chain-pricing.test.ts`, `reverify.test.ts`,
  `prompt-leak-filter.test.ts:7` y `rate-limit.test.ts` — precio y re-verificación del handoff,
  filtro anti-fuga del prompt y límites por minuto, día y presupuesto.
- `apps/web/e2e/asistente.spec.ts:9` — con `/api/assistant` en 503 aparece `assistant-unavailable`
  con enlace manual; `:36` ruta interceptada para el flujo preparado. `apps/mcp/scripts/smoke-mcp.mjs`
  es un smoke manual del MCP.
- **No cubierto:** la tasa OOD `LLM_OOD_REJECT_RATE = 0,96` (`packages/shared/src/constants.ts:57`)
  **no la mide ningún test** (no hay dataset de 50 prompts fuera de dominio); tampoco hay test de
  `getOwnedNights` desde el chat ni de la conversación completa contra un LLM real.

## 7. Pendiente de confirmar

- **Oráculo estadístico OOD y «herramienta de alternativas».** La Gherkin pide ≥
  `LLM_OOD_REJECT_RATE` sobre 50 prompts (`docs/CASOS-DE-USO.md:517`–`:520`), pero no hay suite de
  evaluación. Además, el fuente nombra «la herramienta de alternativas» (`:493`) y en el código la
  alternativa se resuelve reutilizando `listAvailableNights` por instrucción del prompt
  (`prompt.ts:16`). Confirmar la redacción y dónde vive la medición.
- **Modelo y límite de peticiones.** El modelo por defecto es `claude-sonnet-4-6` (`route.ts:16`) y
  el limitador es en memoria (`:24`–`:29`), de modo que en multi-instancia el tope efectivo se
  multiplica. Confirmar el modelo canónico y si el piloto seguirá siendo single-instance.
- **Doble validación y confirmación del usuario.** La compra se valida server-side al preparar
  (`orchestrator.ts:94`) y otra vez en el handoff (`PurchaseHandoff.tsx:44`); además el prompt pide
  confirmar noche y precio antes de `buildPurchaseTx` (`prompt.ts:15`), pero no hay barrera
  estructural que lo impida. Confirmar si ambos controles son requisito o redundancia.
- **MCP sin secreto en loopback.** Con `MCP_BASE_URL` en loopback el gateway no exige
  `MCP_SHARED_SECRET` (`mcp-gateway.ts:45`); confirmar la topología de despliegue prevista.
