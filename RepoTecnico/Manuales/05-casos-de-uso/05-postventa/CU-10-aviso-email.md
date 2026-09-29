# CU-10 · Avisar al hotel por email cada vez que hay una venta — Manual técnico

> Bloque 5 · Postventa · Actor: Mini-worker (sistema) · Beneficiario: Admin · Requisitos: RF-09, RNF-12, RNF-17

## 1. Ficha y trazabilidad

- **Objetivo.** Que cada venta de una noche (primaria o secundaria) genere un correo al hotel,
  exactamente una vez por evento, aunque el worker se reinicie o pierda el RPC.
- **Actor primario.** El mini-worker (proceso de sistema, `apps/worker/src/main.ts:56`).
  **Beneficiario:** el admin del hotel, en la dirección `ADMIN_EMAIL` (`config.ts:31`).
- **Requisitos que cubre.** RF-09 (aviso de venta por email), RNF-12 (resiliencia: catch-up,
  checkpoint e idempotencia) y RNF-17 (observabilidad: el fallo de correo degrada `/health`,
  `health.ts:133`).
- **Precondición.** Worker en ejecución con PostgreSQL y Redis accesibles; `SMTP_HOST`,
  `SMTP_USER`, `SMTP_FROM` y `ADMIN_EMAIL` definidos (`config.ts:23`–`:31`). El arranque es
  *fail-fast*: sin configuración válida o sin esquema, el worker no arranca (`main.ts:58`,
  `:70`–`:84`).
- **Disparador.** El contrato canónico emite `Sale(uint256,address,address,uint256,SaleType)`
  (`packages/contracts/src/IHotelNights.sol:28`), con `SaleType.PRIMARY = 0` y
  `SECONDARY = 1` (`IHotelNights.sol:15`–`:17`).
- **Postcondición.** Una fila entregada en `email_notifications` (`migrator.ts:140`), la clave
  `keccak256(txHash, logIndex)` marcada en `worker_processed_logs` (`migrator.ts:243`) y el
  `worker_checkpoints` del contrato avanzado hasta el bloque procesado (`migrator.ts:235`).
- **Dónde vive.**
  - Arranque y cableado: `apps/worker/src/main.ts:93` (mailer), `:112` (consumidor de cola),
    `:241` (bucle).
  - Bucle de polling y catch-up: `apps/worker/src/run-worker.ts:194`, `:245`, `:302`.
  - Núcleo del aviso: `apps/worker/src/sale-processor.ts:171` (`catchUp`), `:249` (`processSale`).
  - Lectura de logs: `apps/worker/src/chain-source.ts:115` (`getSaleLogs`).
  - Cola y entrega: `apps/worker/src/queued-mailer.ts:27`, `apps/worker/src/email-consumer.ts:163`.
  - Persistencia: `apps/worker/src/checkpoint-store.ts:21`–`:63`.
  - **No hay ruta de UI ni endpoint público:** es un proceso de fondo; se observa por
    `GET /health` (`apps/worker/src/http-server.ts:71`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. `main()` carga la configuración con validación de esquema (`main.ts:58`), aplica las
   migraciones y crea el pool único compartido con la web (`main.ts:68`–`:70`).
2. Monta el mailer de ventas como decorador: cola durable + push best-effort
   (`main.ts:93`–`:97`, `sale-notifier.ts:14`). El destinatario del correo es `ADMIN_EMAIL`
   (`main.ts:94`).
3. Arranca el consumidor de la cola única (`main.ts:112`), que es quien habla SMTP de verdad
   (`email-consumer.ts:163`, `queued-mailer.ts:43`).
4. Lanza `runWorker` con el `SaleProcessor` cableado (`main.ts:241`, `run-worker.ts:215`).
5. Cada `POLL_INTERVAL_MS` (por defecto 4 000 ms, `config.ts:34`) el ciclo lee la cabeza de la
   cadena y hace catch-up (`run-worker.ts:245`–`:256`, `:311`, `:321`).
6. `SaleProcessor.catchUp` reanuda en `max(checkpoint + 1, deploymentBlock)` (`sale-processor.ts:172`–`:174`)
   y pagina en trozos de `GETLOGS_MAX_RANGE` = 5 000 bloques (`sale-processor.ts:182`,
   `constants.ts:33`).
7. `ViemChainSource.getSaleLogs` pide solo el evento `Sale` del contrato canónico
   (`chain-source.ts:115`–`:123`). Los logs sin `txHash`/`logIndex`/`blockNumber` se descartan
   (`chain-source.ts:68`–`:77`, `:125`).
8. Por cada log, `processSale` calcula la clave de idempotencia
   `keccak256(encodePacked(["bytes32","uint256"], [txHash, logIndex]))`
   (`sale-processor.ts:334`, `:250`) y consulta `worker_processed_logs`
   (`sale-processor.ts:251`, `checkpoint-store.ts:41`). Si ya está, no envía nada.
9. `buildNotification` decodifica el `tokenId` en habitación y fecha, deriva el tipo de
   habitación y traduce el `uint8` on-chain a `PRIMARY`/`SECONDARY` (`sale-processor.ts:344`–`:361`).
10. `deliverWithBackoff` llama al puerto `Mailer.sendSaleEmail` con backoff exponencial acotado:
    5 intentos (4 reintentos), base 500 ms y tope 30 s (`sale-processor.ts:287`–`:321`, `:93`–`:97`).
11. El `Mailer` real es `QueuedMailer`: persiste la notificación `PENDING` y la encola
    (`queued-mailer.ts:27`–`:39`, `notifications.ts:61`–`:82`). La deduplicación de BullMQ usa
    `jobId = notificationId` (`notifications.ts:81`).
12. El consumidor toma el trabajo, compone asunto y cuerpo con
    `renderNotification("NFT_SOLD", …)` (`email-consumer.ts:166`–`:172`, `:50`–`:64`) y entrega por
    SMTP (`email-consumer.ts:172`, `mailer.ts:43`–`:56`).
13. Solo tras el envío correcto se marca la clave como procesada
    (`sale-processor.ts:265`–`:270`) y se avanza el checkpoint hasta `toBlock`
    (`sale-processor.ts:203`). `/health` refleja el bloque **persistido**
    (`run-worker.ts:324`, `health.ts:147`).

### 2.2 Validaciones

- **Configuración fail-fast.** `loadWorkerConfig` valida `RPC_URL`, `CONTRACT_ADDRESS`,
  `SMTP_HOST`, `SMTP_USER`, `SMTP_FROM`, `ADMIN_EMAIL` antes de arrancar (`config.ts:14`–`:31`).
- **Esquema antes de operar.** Si `runMigrations` falla, el worker termina con código 1 en vez de
  quedar a medias (`main.ts:70`–`:84`).
- **Idempotencia.** Doble puerta: clave `keccak(txHash, logIndex)` en PostgreSQL
  (`sale-processor.ts:250`, `checkpoint-store.ts:41`) y `jobId` de BullMQ con trabajos completados
  retenidos 1 h (`notifications.ts:43`–`:51`).
- **Confirmaciones.** `CONFIRMATIONS_N = 1` (QBFT, finalidad inmediata) y
  `REORG_CONFIRMATIONS` por defecto 1 (`constants.ts:31`, `config.ts:90`); el worker de avisos
  no espera más bloques.
- **Destinatario obligatorio.** Un trabajo sin `recipientEmail` falla en cerrado
  (`email-consumer.ts:168`–`:169`).
- **Cierre limpio.** `SIGINT`/`SIGTERM` abortan el backoff y no marcan lo no entregado
  (`main.ts:147`–`:154`, `sale-processor.ts:293`–`:299`).

### 2.3 Efectos on-chain / persistencia

- **No escribe en la cadena.** Solo lee eventos; la venta ya ocurrió en el contrato.
- **Escrituras off-chain.** Fila `PENDING` → `SENT` en `email_notifications`
  (`notifications.ts:68`, `:124`); clave en `worker_processed_logs`
  (`checkpoint-store.ts:49`–`:63`); bloque en `worker_checkpoints`
  (`checkpoint-store.ts:31`–`:39`).
- **Reconciliación.** Cada `EMAIL_RECONCILE_INTERVAL_MS` (5 min, `config.ts:64`) se re-encolan las
  filas `PENDING` de más de 5 minutos con el mismo `jobId` (`main.ts:158`–`:162`,
  `email-consumer.ts:208`, `notifications.ts:142`–`:165`).
- **Retención.** Los correos enviados se borran pasados `NOTIFICATIONS_RETENTION_DAYS` = 90 días
  (`config.ts:70`, `main.ts:189`–`:194`).
- **Sin PII.** El cuerpo lleva habitación, tipo, precio, comprador y transacción; no nombre, email
  ni documento (`email-consumer.ts:55`–`:63`, `mailer.ts:69`–`:80`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `event Sale(...)` | `IHotelNights.sol:28` | Fuente única del aviso |
| `SaleProcessor.catchUp(head)` | `sale-processor.ts:171` | Catch-up paginado e idempotente |
| `SaleProcessor.processSale(event)` | `sale-processor.ts:249` | Devuelve `delivered` / `not-delivered` |
| `idempotencyKey(event)` | `sale-processor.ts:334` | `keccak256(txHash, logIndex)` |
| `buildNotification(event)` | `sale-processor.ts:344` | Deriva habitación, fecha y tipo |
| `QueuedMailer.sendSaleEmail` | `queued-mailer.ts:27` | Persiste + encola |
| `renderNotification("NFT_SOLD", …)` | `email-consumer.ts:50` | Asunto y cuerpo del correo |
| `GET /health` | `http-server.ts:71` | Incluye `emailDegraded` y `lag` (`health.ts:153`) |

No hay endpoint HTTP que dispare el aviso: el disparador es siempre un evento on-chain.

### 4.2 Eventos y errores canónicos

- `Sale` con `SaleType.PRIMARY`/`SECONDARY` (`IHotelNights.sol:28`–`:34`, `:15`–`:17`).
- Log `EMAIL_DELIVERY_FAILED` al agotar el backoff de encolado (`sale-processor.ts:306`–`:310`).
- Log `PROCESSING_FAILED` si el evento trae datos inesperados; no bloquea el chunk
  (`sale-processor.ts:228`–`:235`).
- BullMQ reintenta 3 intentos con backoff exponencial de 1 s (`notifications.ts:39`–`:41`); agotados,
  la fila queda `FAILED` y se encola un `DEVOPS_ALERT` a `DEVOPS_ALERT_EMAIL`
  (`email-consumer.ts:177`–`:193`, `:141`). Nunca se alerta sobre una alerta (`:134`).

### 4.3 Estructuras de datos y almacenamiento

- `SaleEvent = { tokenId, seller, buyer, priceWei, saleTypeRaw, txHash, logIndex, blockNumber }`
  (`chain-source.ts:125`–`:134`).
- `SaleNotification` añade `room`, `dateYYYYMMDD`, `roomType` (`sale-processor.ts:344`–`:356`).
- Tablas: `email_notifications` (`migrator.ts:140`), `worker_checkpoints` (`:235`),
  `worker_processed_logs` (`:243`).
- Payload de la cola: `tokenId`, `room`, `roomType`, `date`, `dateYYYYMMDD`, `saleType`,
  `priceWei`, `buyer`, `txHash` (`queued-mailer.ts:28`–`:38`).

## 5. Casos límite y errores

| Situación | Error / señal | Dónde se comprueba |
|-----------|---------------|--------------------|
| Worker reiniciado (10a) | Reanuda desde el checkpoint; no reenvía | `sale-processor.ts:172`–`:174`; test `sale-processor.test.ts:63` |
| Fallo de encolado SMTP (10b) | Backoff 5 intentos y `EMAIL_DELIVERY_FAILED` | `sale-processor.ts:287`–`:321`; test `:155` |
| Correo no entregado en medio del rango | Checkpoint se fija a `blockNumber - 1` | `sale-processor.ts:191`–`:199`; test `:213` |
| Primer evento no entregado | Checkpoint no baja de 0 | `sale-processor.ts:194`–`:198`; test `:252` |
| Un correo agota 3 intentos de BullMQ | Fila `FAILED` + `DEVOPS_ALERT` | `email-consumer.ts:177`–`:193`; test `email-consumer.test.ts:144` |
| Redis caído con filas `PENDING` | Reconciliación re-encola con el mismo `jobId` | `notifications.ts:142`–`:165`; test `notifications.test.ts:92` |
| RPC no responde | Se registra fallo y no avanza el checkpoint | `run-worker.ts:311`–`:315`, `:326`–`:329` |
| Cierre con backoff en curso (MINOR 12) | Aborta sin marcar como entregado | `sale-processor.ts:293`–`:299`; test `:284` |
| Redeploy del contrato | Checkpoint por dirección; catch-up desde `deploymentBlock` | `run-worker.ts:84`–`:95` |
| Cadena reiniciada por detrás del checkpoint | Rebobina al `deploymentBlock` | `run-worker.ts:123`–`:143` |

## 6. Pruebas y evidencia

- `apps/worker/src/sale-processor.test.ts:51` (mismo Sale dos veces → 1 correo), `:63`
  (reinicio), `:84` (paginación), `:106` (checkpoint), `:131`/`:147` (contenido y tipo), `:155`
  (fallo con backoff), `:183` (reconexión), `:213`–`:268` (at-least-once) y `:284` (aborto).
- `apps/worker/src/run-worker.test.ts:38` (ciclo y lag), `:183` (salud de email se rearma),
  `:455` (lag con el checkpoint persistido).
- `apps/worker/src/email-consumer.test.ts:59` (entrega por SMTP), `:87` (fallo propaga), `:114`
  (sin destinatario), `:123` (reconciliación), `:144` (agotamiento), `:166` (no avisa si aún
  reintenta), `:179` (no alerta sobre alerta) y `:212` (render sin PII).
- `apps/worker/src/checkpoint-store.test.ts:25`–`:80` (checkpoint y `worker_processed_logs`).
- `packages/shared/src/queue/notifications.test.ts:38` (persistencia + `jobId`) y `:92`
  (reconciliación).
- Plan: `docs/PLAN-DE-PRUEBAS.md:153`–`:161` (TC-WK-001…TC-WK-006).
- **No cubierto.** No hay test que ejecute Anvil + SMTP reales de punta a punta (los tests usan
  dobles). `NodemailerMailer` (`mailer.ts:23`) no se instancia en ningún sitio del repositorio.
  No hay fichero `apps/worker/src/listener-runtime.test.ts`.

## 7. Pendiente de confirmar

- **Existe un segundo camino de correo de venta.** El `EventListenerService` (D-12) también
  consolida `NFTSold` y encola `NFT_SOLD`, pero al destinatario `carlosEmail`
  (`packages/shared/src/events/listener.ts:303`–`:337`, `:138`), y `main.ts:222`–`:232` no le pasa
  `carlosEmail`, así que cae a `CARLOS_NOTIFICATION_EMAIL` o a `carlos@hotel.es`. Hay que confirmar
  si es un canal distinto a propósito o un duplicado si ambas direcciones coinciden; el manual lo
  trata como canal secundario.
- **Garantía real.** El código es *at-least-once* con ventana mínima, no exactamente-una-vez
  (`sale-processor.ts:16`–`:19`): el fuente de CU-10 promete «exactamente 1 email»; confirmar cómo
  se redacta esa garantía.
- **`CONFIRMATIONS_N` frente a `REORG_CONFIRMATIONS`.** El fuente cita `CONFIRMATIONS_N`
  (`docs/CASOS-DE-USO.md:578`); en el worker de avisos no se usa esa constante, sino el polling
  directo y `REORG_CONFIRMATIONS` del listener. Confirmar cuál es el valor canónico del manual.
- **Contenido del correo.** El fuente dice que el email incluye `fecha`
  (`docs/CASOS-DE-USO.md:579`); en la plantilla viva (`email-consumer.ts:54`–`:63`) la fecha va en
  el asunto, no en el cuerpo, y el precio se muestra en wei. Confirmar el formato deseado.
- **Reintentos.** El fuente habla de «backoff SMTP» (10b); tras la cola única (D-03), el backoff
  del `SaleProcessor` cubre el encolado y los reintentos SMTP son de BullMQ. Confirmar el texto.
