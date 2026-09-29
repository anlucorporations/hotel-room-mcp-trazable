# CU-11 · Ver las métricas del negocio en el panel — Manual técnico

> Bloque 5 · Postventa · Actor: Admin autenticado · Requisitos: RF-10, RNF-17, RNF-19

## 1. Ficha y trazabilidad

- **Objetivo.** Que un operador autenticado vea, en una sola pantalla, cuánto ha vendido el hotel,
  cuánto se ha revendido, cuánto royalty se ha acumulado, cuántas noches se han minteado, vendido y
  quemado, y el ratio de ocupación comercial, con su periodo y su zona horaria.
- **Actor primario.** Admin del back-office con sesión válida; en la práctica cualquier rol de
  gestión (`DEFAULT_ADMIN_ROLE` o `RECEPTION_ROLE`, `apps/web/src/lib/guard.ts:38`).
  **Secundario:** el mini-worker, que precalcula las cifras.
- **Requisitos que cubre.** RF-10 (dashboard de métricas), RNF-17 (estado degradado observable) y
  RNF-19 (sin PII: las cifras derivan de eventos públicos y no muestran datos personales).
- **Precondición.** Sesión de back-office válida y worker en marcha con PostgreSQL accesible.
  El dashboard vive bajo `/admin` y queda **gateado en servidor**: el layout RSC verifica la cookie
  de sesión y sin sesión solo se sirve la pantalla de acceso
  (`apps/web/src/app/admin/layout.tsx:21`–`:24`).
- **Disparador.** El admin abre `/admin/dashboard` (`apps/web/src/app/admin/dashboard/page.tsx:26`).
- **Postcondición.** Se renderizan las tarjetas KPI, la serie mensual, el desglose por tipo y el
  ranking de más revendidas (`DashboardMetrics.tsx:106`, `:173`–`:177`).
- **Dónde vive.**
  - Ruta y gate: `apps/web/src/app/admin/layout.tsx:21`; `apps/web/src/app/admin/dashboard/page.tsx:27`.
  - Cliente del worker: `apps/web/src/lib/worker-api.ts:29` (`fetchAggregates`).
  - Endpoint espejo y CSV: `apps/web/src/app/api/admin/metrics/route.ts:27`.
  - Fuente de verdad: `apps/worker/src/aggregate-processor.ts:120` (`getAggregates`).
  - Cálculo puro del ratio: `packages/shared/src/domain/aggregates.ts:132`.
  - Persistencia: `worker_aggregate_counters` y `worker_sale_history`
    (`packages/shared/src/db/migrator.ts:255`, `:270`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. El layout del back-office verifica la **validez** de la sesión antes de renderizar
   (`admin/layout.tsx:22`–`:23`, `apps/web/src/lib/admin-session.ts:21`); sin sesión devuelve
   `AdminSignInScreen`.
2. La página del dashboard **repite la comprobación** antes de leer nada
   (`dashboard/page.tsx:27`–`:28`): en el App Router la página se renderiza aunque el layout no la
   pinte, así que sin este segundo gate las cifras viajarían en el flujo RSC a un cliente anónimo
   (`admin-session.ts:10`–`:14`).
3. `fetchAggregates` pide `GET /aggregates` al worker con `cache: "no-store"` y timeout de
   `RPC_TIMEOUT_MS` = 5 000 ms (`worker-api.ts:12`, `:16`–`:22`, `:29`).
4. El worker sirve la ruta desde `AggregateProcessor.getAggregates`
   (`apps/worker/src/main.ts:137`, `apps/worker/src/http-server.ts:74`).
5. `getAggregates` lee en paralelo los contadores y el resumen del histórico en PostgreSQL
   (`aggregate-processor.ts:121`–`:124`) y compone `DashboardAggregates`
   (`packages/shared/src/domain/aggregates.ts:83`):
   - `primaryVolumeWei` = Σ precio de ventas primarias;
   - `royaltiesWei` = Σ `RoyaltyPaid` (solo secundarias);
   - `secondaryVolumeWei` = Σ precio de reventas;
   - `soldCount` (solo primarias), `mintedCount`, `burnedCount`;
   - `occupancyRatioPercent` = `soldCount / mintedCount` en % (`aggregates.ts:132`–`:135`);
   - `lastBlock` del periodo y `timeZone` (`:98`–`:101`).
6. El reparto por tipo y el ranking se calculan en SQL con la zona del hotel
   (`aggregate-processor.ts:123`; `DASHBOARD_TIME_ZONE = "Europe/Madrid"`, `aggregates.ts:126`).
7. En el servidor, la página pinta el panel y el enlace de descarga CSV
   (`dashboard/page.tsx:44`–`:64`); con datos, monta `DashboardMetrics`
   (`DashboardMetrics.tsx:92`).
8. La vista muestra siete tarjetas KPI con su fórmula al pie
   (`DashboardMetrics.tsx:106`–`:115`, `:144`–`:160`), el periodo, la zona horaria y la hora de
   corte (`:123`–`:132`), la serie mensual, el desglose por tipo y el ranking
   (`:173`–`:177`).
9. Si hay ventas sin fecha de bloque, aparece un aviso explícito y se declaran
   (`DashboardMetrics.tsx:163`–`:170`, `aggregates.ts:184`–`:204`).

### 2.2 Validaciones

- **Sesión en el render.** `currentAdminSession()` verifica firma, caducidad y blocklist de Redis;
  falla en cerrado si no puede verificar (`admin-session.ts:21`–`:30`).
- **Autorización de la API.** `GET /api/admin/metrics` usa `requireRole`, que responde 401 sin
  token y 403 con sesión sin rol de gestión (`metrics/route.ts:28`–`:29`, `guard.ts:201`, `:211`).
- **División por cero.** `occupancyRatioPercent` devuelve 0 si `mintedCount <= 0`
  (`aggregates.ts:133`); la vista lo formatea con un decimal solo si hace falta
  (`DashboardMetrics.tsx:102`–`:104`).
- **Sin datos del worker.** Si `fetchAggregates` lanza, la página muestra el estado degradado en
  vez de inventar ceros (`dashboard/page.tsx:33`–`:37`, `:66`–`:67`).
- **Sin precisión perdida.** Los importes viajan en wei como `string` en todo el camino
  (`aggregates.ts:85`–`:89`); la vista los convierte solo para la geometría de la gráfica
  (`dashboard-data.ts:28`, `:33`).

### 2.3 Efectos on-chain / persistencia

- **No escribe nada.** Es una lectura: no firma transacciones ni modifica la cadena.
- **Una sola fuente de verdad.** Tanto el dashboard como el histórico leen los mismos agregados
  del worker; la web ya no recalcula por su cuenta (`dashboard/page.tsx:16`–`:20`,
  `metrics/route.ts:16`–`:20`).
- **Persistencia previa (worker).** `minted_count` se incrementa con cada `Mint`, `burned_count`
  con cada `Burn`, `royalties_wei` solo con `RoyaltyPaid` y el volumen primario/secundario con cada
  `Sale` (`apps/worker/src/aggregate-store.ts:420`–`:443`, `:450`–`:468`).
- **CSV.** La exportación se genera en el servidor con las mismas cifras de la pantalla
  (`metrics/route.ts:45`–`:54`, `:76`–`:131`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `GET /admin/dashboard` | `admin/dashboard/page.tsx:26` | Página RSC con doble gate de sesión |
| `GET /aggregates` (worker) | `http-server.ts:74`; consumido en `worker-api.ts:29` | `DashboardAggregates` en JSON |
| `GET /api/admin/metrics` | `api/admin/metrics/route.ts:27` | Mismo payload + alias en ETH |
| `GET /api/admin/metrics?format=csv` | `metrics/route.ts:43`–`:54` | Informe descargable |
| `AggregateProcessor.getAggregates` | `aggregate-processor.ts:120` | Compone los KPI |
| `occupancyRatioPercent` | `aggregates.ts:132` | Div/0 → 0, sin `NaN` |
| `getHistorySummary` | `aggregate-processor.ts:123` | Serie, desglose y ranking en SQL |

### 4.2 Eventos y errores canónicos

- Entrada: `Mint`, `Sale`, `RoyaltyPaid` y `Burn`
  (`apps/worker/src/chain-source.ts:143`–`:148`), leídos del contrato canónico.
- `RoyaltyPaid` es la **única** fuente de royalties; una venta primaria no suma
  (`aggregate-store.ts:433`–`:438`; test `aggregate-processor.test.ts:113`).
- Error de datos: la ruta del worker responde 500 `DATA_UNAVAILABLE` si el proveedor falla
  (`http-server.ts:142`–`:146`); el endpoint de la web lo traduce a **503** `DATA_UNAVAILABLE`
  (`metrics/route.ts:37`–`:40`).
- Autorización: `UNAUTHORIZED` (401), `FORBIDDEN` (403) y `SERVER_MISCONFIGURED` (500)
  (`guard.ts:212`–`:218`).

### 4.3 Estructuras de datos y almacenamiento

- `DashboardAggregates` (`aggregates.ts:83`–`:102`): KPI + `HistorySummary` + `lastBlock` + `timeZone`.
- `worker_aggregate_counters` (`migrator.ts:255`): fila única `id = 0` con
  `primary_volume_wei`, `royalties_wei`, `secondary_volume_wei`, `sold_count`, `minted_count`,
  `burned_count` y `last_block`. Se bloquea con `FOR UPDATE` al mutar
  (`aggregate-store.ts:390`–`:397`).
- `worker_sale_history` (`migrator.ts:270`): una fila por venta con `price_wei`,
  `sale_type_raw`, `seller`, `buyer` y `block_timestamp` (puede ser `NULL`).
- `monthlySeries`, `roomTypeBreakdown`, `topResold` y `undatedSalesCount` se derivan del histórico
  (`aggregates.ts:230`–`:274`).

## 5. Casos límite y errores

| Situación | Señal | Dónde se comprueba |
|-----------|-------|--------------------|
| Sin sesión válida (11, precondición) | Pantalla de acceso; sin panel ni cifras | `admin/layout.tsx:23`; `dashboard/page.tsx:28`; test `admin-auth-guardian.test.ts:39` |
| Sesión sin rol de gestión en la API | 403 `FORBIDDEN` | `metrics/route.ts:28`; `guard.ts:138`; test `admin.test.ts:78` |
| `minteadas = 0` (11a) | Ratio `0 %`, sin `NaN` | `aggregates.ts:133`; tests `aggregate-processor.test.ts:102`, `aggregates.test.ts:15` |
| Worker o base de datos caídos | Aviso degradado con **Reintentar** | `dashboard/page.tsx:66`; `DegradedState.tsx:11`, `:33`; test `admin.test.ts:314` |
| RPC caído (11b) | El worker no actualiza contadores; `/aggregates` sigue sirviendo el último estado | `aggregate-processor.ts:120` (no lee RPC); `health.ts:123` |
| Ventas sin `block_timestamp` | Aviso «quedan fuera de la serie mensual» | `DashboardMetrics.tsx:163`; test `aggregate-processor.test.ts:240` |
| Histórico vacío | Series y ranking vacíos, con totales a 0 | `aggregates.test.ts:173`; `dashboard-data.test.ts:74`, `:138` |
| Redeploy del contrato | El agregado se resetea a la base nueva | `run-worker.ts:165`–`:184`; test `aggregate-processor.test.ts:411` |
| Importes enormes (> 2⁶³ wei) | Sin pérdida de precisión (`NUMERIC(78,0)` + `bigint`) | `migrator.ts:257`; test `aggregate-processor.test.ts:137` |

## 6. Pruebas y evidencia

- `apps/web/src/lib/admin-auth-guardian.test.ts:22` (el layout verifica la validez, no la cookie),
  `:39` (la página comprueba la sesión **antes** de leer agregados) y `:51` (ninguna otra página
  lee datos en servidor sin gate).
- `apps/web/src/app/api/admin/admin.test.ts:277` (JSON con KPIs y D-16), `:295` (CSV) y `:314`
  (503 en vez de ceros).
- `apps/worker/src/aggregate-processor.test.ts:73` (30/100 = 30 %), `:102` (div/0 → 0 %), `:113`
  (royalties solo de `RoyaltyPaid`), `:196` (serie, desglose y ranking), `:240` (venta sin fecha) y
  `:253` (zona horaria por defecto `Europe/Madrid`).
- `packages/shared/src/domain/aggregates.test.ts:11` (ratio), `:51` (mes del hotel, no UTC) y
  `:69`–`:173` (resumen del histórico, incluido el vacío).
- `apps/web/src/lib/dashboard-data.test.ts:14` (wei → número para la gráfica), `:42` (serie),
  `:80` (desglose) y `:108` (ranking).
- Plan: `docs/PLAN-DE-PRUEBAS.md:165`–`:170` (TC-WK-020…TC-WK-022).
- **No cubierto.** No hay test E2E de `/admin/dashboard`: `apps/web/e2e/` solo tiene `home`,
  `a11y`, `asistente` y `observabilidad`. Tampoco hay test de render de `DashboardMetrics` ni del
  guardián con build real (la verificación de M7 fue manual). Los códigos del plan
  (`TC-WK-021` div/0, `TC-WK-022` royalties) no coinciden con las etiquetas de
  `aggregate-processor.test.ts:102` y `:113`.

## 7. Pendiente de confirmar

- **Escenario 11b (RPC caído).** El fuente dice «estado degradado»
  (`docs/CASOS-DE-USO.md:634`), pero `getAggregates` no toca el RPC: si la cadena no responde, el
  dashboard muestra las últimas cifras persistidas sin avisar (el aviso solo salta si el worker o
  PostgreSQL no responden). `GET /health` sí refleja la caída (`health.ts:123`,
  `http-server.ts:105`), pero la página no lo consulta. Confirmar el comportamiento deseado.
- **Rol exigido.** El fuente habla de «admin»; la API admite cualquier rol de gestión
  (`DEFAULT_ADMIN_ROLE` o `RECEPTION_ROLE`, `guard.ts:38`, `metrics/route.ts:28`). Confirmar si el
  dashboard debe restringirse solo al owner.
- **Unidad monetaria.** El código formatea **ETH** (`formatEther`, `metrics/route.ts:58`;
  `CURRENCY_SYMBOL = "ETH"`, `constants.ts:11`), mientras el JSON usa alias `…Pol` y
  `dashboard-data.ts:28` se llama `weiToPol` (herencia de Polygon). Confirmar el texto canónico.
- **Definición de «noches vendidas».** `soldCount` cuenta **solo** ventas primarias
  (`aggregate-store.ts:455`–`:462`); el ratio de ocupación comercial usa ese contador
  (`aggregates.ts:132`). Confirmar si «vendidas» debe incluir también las reventas.
- **KPIs extra.** Además de los cuatro del fuente, el panel muestra «Noches quemadas» y las tres
  secciones de D-16 (serie mensual, desglose por tipo y ranking). Confirmar que CU-11 los absorbe
  y no se documentan en otro caso de uso.
- **Periodo de los KPI.** La pantalla declara «hasta el bloque N» y una hora de corte aproximada
  calculada en el cliente (`DashboardMetrics.tsx:97`, `:123`–`:132`), porque los agregados no traen
  marca temporal de generación. Confirmar si basta como periodo.
