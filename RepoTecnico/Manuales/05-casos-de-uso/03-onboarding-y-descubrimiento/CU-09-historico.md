# CU-09 · Mirar el histórico público de ventas — Manual técnico

> Bloque 3 · Onboarding y descubrimiento · Actor: Cualquier visitante · Requisitos: RF-15, RNF-05

## 1. Ficha y trazabilidad

- **Objetivo.** Publicar la lista de todas las ventas (primarias y secundarias) con habitación,
  fecha de la noche, precio, tipo y wallets, en un orden total y estable, sin datos personales.
- **Actor primario.** Cualquier visitante, sin sesión. **Secundarios:** el worker que indexa los
  eventos y el admin, que ve las mismas cifras en su panel (fuente única, D-16).
- **Requisitos que cubre.** RF-15 (histórico público) y RNF-05 (integridad/consistencia de los
  datos mostrados).
- **Precondición.** Ninguna para el visitante. Para que haya contenido, el worker debe estar en
  ejecución y haber indexado al menos un evento `Sale`.
- **Disparador.** El visitante abre `/historico` o descarga el CSV.
- **Postcondición.** Se ha servido la tabla `SaleHistoryEntry[]` completa (o el estado degradado) y,
  si se pidió `format=csv`, la descarga con **todo** el histórico.
- **Dónde vive.**
  - Ruta: `apps/web/src/app/historico/page.tsx:19` (Server Component, `force-dynamic` en `:8`).
  - Tabla: `apps/web/src/components/history/HistoryTable.tsx:37`.
  - Endpoint JSON/CSV: `apps/web/src/app/api/sales/history/route.ts:20`.
  - Cliente del worker: `apps/web/src/lib/worker-api.ts:33`.
  - Worker: `apps/worker/src/http-server.ts:77` (`GET /history`) y
    `apps/worker/src/aggregate-processor.ts:140` (`getHistory`).
  - Orden canónico: `packages/shared/src/domain/aggregates.ts:141` (`compareHistoryDesc`).
  - Contrato: evento `Sale` en `packages/contracts/src/IHotelNights.sol:28` (enum `SaleType` en
    `:15`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. La petición llega a `/historico`, marcada `force-dynamic` para no cachear cifras
   (`historico/page.tsx:8`).
2. La página llama a `fetchHistory()` dentro de un `try`; si lanza, deja `entries = null`
   (`historico/page.tsx:22`–`:27`).
3. `fetchHistory` es `getJson<SaleHistoryEntry[]>("/history")` contra el worker
   (`apps/web/src/lib/worker-api.ts:33`–`:35`).
4. `getJson` usa `WORKER_BASE_URL` (por defecto `http://127.0.0.1:8787`), `cache: "no-store"` y un
   `AbortController` con `RPC_TIMEOUT_MS` (`worker-api.ts:12`–`:26`).
5. El worker atiende `GET /history` y devuelve `data.getHistory()`
   (`apps/worker/src/http-server.ts:77`–`:79`), con cabeceras CORS para las rutas de datos
   (`:44`–`:48`).
6. `getHistory` lee las filas persistidas, las traduce con `toHistoryEntry` y las ordena con
   `compareHistoryDesc` (`apps/worker/src/aggregate-processor.ts:140`–`:142` y `:194`–`:209`).
7. El orden es **descendente por número de bloque** y, en empate, **por `logIndex` descendente**
   (`packages/shared/src/domain/aggregates.ts:141`–`:144`).
8. La página pinta la cabecera con el botón de «Exportar CSV»
   (`historico/page.tsx:37`–`:58`) y, si hay datos, `HistoryTable` (`:63`).
9. `HistoryTable` muestra tarjetas apiladas en móvil (`HistoryTable.tsx:53`–`:84`) y tabla completa
   desde tablet (`:87`–`:117`); cada fila lleva `data-testid="history-row"` (`:57` y `:104`).
10. El hash de la transacción enlaza al explorador si la red tiene uno configurado; si no
    (Anvil/Besu privada), degrada a texto con el hash en el `title`
    (`HistoryTable.tsx:13`–`:34`).
11. El CSV: `GET /api/sales/history?format=csv` vuelve a llamar a `fetchHistory`, serializa **todas**
    las filas con 12 columnas y responde `text/csv` con `Content-Disposition: attachment`
    (`apps/web/src/app/api/sales/history/route.ts:38`–`:79`).
12. La variante JSON pagina con `limit` (por defecto 20) y `offset` (por defecto 0) **sobre** la
    lista completa, que ya viene ordenada del worker (`route.ts:32`–`:36` y `:82`).

### 2.2 Validaciones

- **Fuente única.** La tabla y el CSV leen del mismo `fetchHistory()`; ya no hay dos caminos con
  checkpoints distintos (comentario en `historico/page.tsx:13`–`:17` y `route.ts:12`–`:18`).
- **Orden total.** `compareHistoryDesc` garantiza desempate por `logIndex`, así que el orden es
  determinista (test en `aggregates.test.ts:37`).
- **Sin PII.** `SaleHistoryEntry` solo lleva `tokenId`, `room`, `dateYYYYMMDD`, `roomType`,
  `priceWei`, `saleType`, `seller`, `buyer`, `blockNumber`, `logIndex`, `txHash` y
  `blockTimestamp` (`aggregates.ts:105`–`:122`).
- **Paginación del JSON.** `parseInt` sin validación de rango: un `limit` negativo produciría un
  `slice` raro; el camino de la web no lo usa (la tabla pide la lista completa).

### 2.3 Efectos on-chain / persistencia

- **Solo lectura.** Ni la página ni el endpoint escriben on-chain ni en base de datos.
- El worker deriva el histórico de los eventos `Sale` (y `Mint`/`Burn` para el resto de agregados)
  y los persiste; la clave de idempotencia es `txHash:logIndex`
  (`apps/worker/src/aggregate-processor.ts:24`–`:27` y `:69`).
- La fecha de bloque se recupera con `backfillTimestamps` para filas antiguas sin marca temporal
  (`aggregate-processor.ts:155`–`:179`); si un bloque no se puede leer, la fila sigue sin fecha y el
  ciclo no se cae.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `/historico` (RSC) | `historico/page.tsx:19` | Tabla pública, sin sesión |
| `GET /api/sales/history` | `route.ts:20` | JSON paginado: `{ items, total, limit, offset }` |
| `GET /api/sales/history?format=csv` | `route.ts:38` | Exporta **todo** el histórico |
| `fetchHistory()` | `worker-api.ts:33` | `GET {WORKER_BASE_URL}/history` |
| `getHistory()` | `aggregate-processor.ts:140` | Fila → `SaleHistoryEntry` + orden total |
| `compareHistoryDesc` | `aggregates.ts:141` | Bloque desc, `logIndex` desc |
| `event Sale` | `IHotelNights.sol:28` | `tokenId`, `seller`, `buyer`, `price`, `saleType` |
| `buy` / `buyResale` | `HotelNights.sol:156` y `:241` | Origen de los eventos que pueblan el histórico |

### 4.2 Eventos y errores canónicos

- Evento leído: `Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer,
  uint256 price, SaleType saleType)` (`IHotelNights.sol:28`–`:34`), con `SaleType` `PRIMARY` y
  `SECONDARY` (`:15`–`:18`).
- Error del endpoint: si el worker no responde o lanza, `GET /api/sales/history` devuelve **503**
  `DATA_UNAVAILABLE` con el mensaje «El histórico del worker no está disponible» (`route.ts:25`–`:28`).
- La página no propaga el error: muestra estado degradado.

### 4.3 Estructuras de datos y almacenamiento

- `SaleHistoryEntry` (`aggregates.ts:105`–`:123`): el `blockTimestamp` puede ser `null` si la
  cabecera del bloque no se pudo leer.
- La zona horaria del dashboard es `Europe/Madrid` (`aggregates.ts:126`), pero el histórico **no**
  agrupa por mes: muestra el instante de bloque.
- El CSV usa exactamente estas columnas: token ID, habitación, fecha de la noche, tipo,
  precio en ETH, precio en wei, tipo de venta, vendedor, comprador, bloque, marca temporal ISO y
  `txHash` (`route.ts:39`–`:52`).
- La fila de la tabla se identifica por `${txHash}-${logIndex}` (`HistoryTable.tsx:56`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| No hay ventas | `data-testid="history-empty"` | `HistoryTable.tsx:41`–`:47` |
| Worker caído o con timeout | `data-testid="degraded-state"` + reintento | `historico/page.tsx:26` y `:61`; `DegradedState.tsx:21` y `:33` |
| El endpoint no obtiene datos | 503 `DATA_UNAVAILABLE` | `route.ts:25`–`:28` |
| Token quemado tras la venta | La venta sigue listada (deriva de eventos) | `aggregate-processor.test.ts:335`–`:347` |
| Venta sin fecha de bloque recuperable | `blockTimestamp = null`; el CSV deja la celda vacía | `route.ts:64`; `aggregate-processor.ts:176`–`:178` |
| Red sin explorador | El hash se muestra como texto, no como enlace | `HistoryTable.tsx:29`–`:33` |
| Empate de bloque entre dos ventas | Desempate por `logIndex` descendente | `aggregates.ts:143`; test `aggregates.test.ts:37` |

## 6. Pruebas y evidencia

- `packages/shared/src/domain/aggregates.test.ts:21` — `compareHistoryDesc` ordena descendente por
  bloque y, en empate, por `logIndex` descendente (`:37`–`:45`).
- `apps/worker/src/aggregate-processor.test.ts:151` — histórico con orden total y sin PII (solo
  wallets; el test enumera las claves exactas de la entrada, `:177`–`:186`).
- `apps/worker/src/aggregate-processor.test.ts:334` — una venta de un token luego quemado sigue en
  el histórico (TC-WK-011).
- `apps/worker/src/aggregate-processor.test.ts:355` — idempotencia: reprocesar eventos no duplica
  filas de histórico.
- `apps/web/src/app/api/sales/history/history.test.ts:29` — JSON paginado con orden del worker;
  `:44` CSV completo con fecha ISO y cabeceras.
- `apps/web/e2e/observabilidad.spec.ts:9` — `/historico` muestra `degraded-state` con el worker
  caído y desaparece cuando responde.
- `apps/web/e2e/a11y.spec.ts:32` — `/historico` entra en el barrido de accesibilidad.
- **No cubierto:** no hay test de `HistoryTable` (formato de precio/fecha, enlace de explorador) ni
  de la página RSC; el requisito «no se muestra ningún nombre, email ni documento de identidad» se
  protege por la forma del tipo, no por un test dedicado de la vista.

## 7. Pendiente de confirmar

- **`empty-state` frente a `history-empty`.** El fuente exige `data-testid="empty-state"`
  (`docs/CASOS-DE-USO.md:543`), pero el código usa `history-empty` (`HistoryTable.tsx:43`). El
  `empty-state` que existe pertenece al catálogo (`CatalogClient.tsx:214`). Confirmar el nombre
  canónico para el histórico.
- **CSV completo frente a paginado.** El JSON pagina sobre la lista del worker, pero el CSV exporta
  **todas** las filas ignorando `limit`/`offset` (`route.ts:36` frente a `:53`). Confirmar que ese
  comportamiento es el deseado.
- **Ubicación del histórico.** El fuente dice que el sistema lee los eventos `Sale` «on-chain»
  (`docs/CASOS-DE-USO.md:539`), mientras que la web lee del worker (agregados indexados, D-16) y no
  por RPC directo: confirmar la redacción técnica.
- **Reparto con CU-10/CU-11.** El mismo `/history` del worker alimenta el dashboard
  (`worker-api.ts:29`); confirmar que el histórico público y las métricas internas comparten fuente
  sin exponer datos de más.
- **Validación de `limit`/`offset`.** El endpoint no acota valores negativos ni máximos
  (`route.ts:32`–`:33`): confirmar si hace falta un tope.
