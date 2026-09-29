# CU-45 · Ver qué está pasando ahora mismo (operaciones) — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Owner · Requisitos: RF-45

## 1. Ficha y trazabilidad

- **Objetivo.** Ver la salud operativa del sistema desde Sistemas → Operaciones: si el worker
  indexador está al día, cuánto retraso lleva, si sus agregados van a la par y qué degradaciones
  tiene activas.
- **Actor primario.** Owner (`DEFAULT_ADMIN_ROLE`). **Secundario:** el worker indexador, que es la
  fuente de la información.
- **Requisitos que cubre.** RF-45 (`RepoTecnico/incremento_v3/casos_uso_incremento.md:193`).
- **Precondición.** Sesión de back-office con `DEFAULT_ADMIN_ROLE`
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:193`).
- **Disparador.** El owner abre Sistemas → Operaciones
  (`apps/web/src/app/admin/sistemas/operaciones/page.tsx:7`).
- **Postcondición.** Ninguna escritura: la pantalla es de solo lectura. Refresca su estado cada vez
  que se pulsa «Actualizar» (`apps/web/src/components/admin/system/SystemOperations.tsx:72`).
- **Dónde vive.**
  - Página: `apps/web/src/app/admin/sistemas/operaciones/page.tsx:7`.
  - Componente: `apps/web/src/components/admin/system/SystemOperations.tsx:30`.
  - API: `apps/web/src/app/api/admin/system/operations/route.ts:15`.
  - Cliente del worker: `apps/web/src/lib/worker-api.ts:44`.
  - Servidor del worker: `apps/worker/src/http-server.ts:105`.
  - Estado de salud: `apps/worker/src/health.ts:141`.
  - Bucle del worker: `apps/worker/src/run-worker.ts:188`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El owner entra en `/admin/sistemas/operaciones`. El layout de la sección exige
   `DEFAULT_ADMIN_ROLE` en servidor antes de renderizar
   (`apps/web/src/app/admin/sistemas/layout.tsx:17`, `:20`).
2. La página envuelve `SystemOperations` en un `AdminPanel` con el mismo rol exigido
   (`apps/web/src/app/admin/sistemas/operaciones/page.tsx:9`–`:14`).
3. Al montarse, el componente llama a `load()`, que pide `GET /api/admin/system/operations` con
   `apiFetch` (`apps/web/src/components/admin/system/SystemOperations.tsx:41`, `:56`).
4. La API exige `DEFAULT_ADMIN_ROLE` con `requireRole(request, "DEFAULT_ADMIN_ROLE")`
   (`apps/web/src/app/api/admin/system/operations/route.ts:16`).
5. Si la autorización pasa, llama a `fetchWorkerHealth()` (`:20`), que hace `GET /health` al worker
   con `cache: "no-store"` y timeout (`apps/web/src/lib/worker-api.ts:18`, `:45`).
6. El worker responde con su `HealthReport` por el servidor HTTP interno
   (`apps/worker/src/http-server.ts:110`–`:117`).
7. La API devuelve `{ health, checkedAt }` con la marca de tiempo del servidor
   (`apps/web/src/app/api/admin/system/operations/route.ts:21`).
8. La pantalla pinta el estado (`status`) y la hora de la comprobación
   (`apps/web/src/components/admin/system/SystemOperations.tsx:94`–`:98`).
9. Debajo pinta las nueve métricas de `DETAIL_KEYS`
   (`apps/web/src/components/admin/system/SystemOperations.tsx:14`–`:24`, `:102`): último bloque
   indexado, bloque de la cadena, retraso, último bloque agregado, retraso de agregados, fallos RPC
   consecutivos, fallos de agregado consecutivos, correo degradado y proceso degradado.
10. Los valores se leen de `health.details` (`apps/web/src/components/admin/system/SystemOperations.tsx:60`):
    un booleano se traduce a sí/no (`:63`) y un valor ausente a «…» (`:62`).
11. El botón «Actualizar» repite la carga sin recargar la página
    (`apps/web/src/components/admin/system/SystemOperations.tsx:72`–`:76`).

### 2.2 Validaciones

- **Owner obligatorio.** La API cierra en el servidor con 401 sin sesión y 403 con un rol
  insuficiente (`apps/web/src/app/api/admin/system/operations/route.ts:16`;
  `apps/web/src/lib/guard.ts:211`). La UI es solo un complemento.
- **Worker no disponible.** Si `fetchWorkerHealth()` lanza, la API responde 503 con
  `error: "WORKER_UNAVAILABLE"` en lugar de inventar ceros
  (`apps/web/src/app/api/admin/system/operations/route.ts:23`–`:28`).
- **Estado degradado explícito.** El componente detecta el 503 antes de intentar leer el cuerpo y
  marca `degraded` (`apps/web/src/components/admin/system/SystemOperations.tsx:43`–`:46`), que se
  pinta como aviso `operations-degraded` con el texto `workerDown` (`:80`–`:84`).
- **No rompe el panel.** El error se guarda en estado local (`:51`) y se pinta en su propia tarjeta
  (`:86`–`:90`); el resto de la página sigue renderizándose.
- **Sin auto-refresco.** No hay `setInterval` ni sondeo: solo la carga inicial (`:55`) y el botón
  manual. Queda dicho aquí porque el CU no lo especifica.

### 2.3 Efectos on-chain / persistencia

- **Ninguno.** Este CU no firma transacciones ni escribe en la base de datos: lee el estado en
  memoria del worker.
- El worker calcula ese estado en cada ciclo: `recordCycle(persisted, head)` para el pipeline de
  correo, `recordAggregateCycle(...)` para los agregados y `recordRpcFailure()` /
  `recordAggregateFailure()` cuando fallan (`apps/worker/src/run-worker.ts:313`, `:325`, `:352`,
  `:354`).
- `HealthReport` se compone en `toReport()`, que decide `status` con `isDown()`
  (`apps/worker/src/health.ts:141`, `:129`).
- El worker sirve `/health` con 200 si el estado es `ok` y 503 con el marcador `COMPONENT_DOWN` si
  es `down` (`apps/worker/src/http-server.ts:113`–`:117`;
  `packages/shared/src/health/index.ts:44`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Rol exigido | Referencia |
|---|---|---|---|
| Salud operativa | `GET /api/admin/system/operations` | `DEFAULT_ADMIN_ROLE` | `apps/web/src/app/api/admin/system/operations/route.ts:15` |
| Salud del worker | `GET /health` (worker) | ninguno (interno) | `apps/worker/src/http-server.ts:105` |
| Cliente del worker | `fetchWorkerHealth()` | interno | `apps/web/src/lib/worker-api.ts:44` |
| Estado de salud | `createWorkerHealthState().toReport()` | interno | `apps/worker/src/health.ts:141` |
| Proveedor de `/health` | `workerHealthProvider(state)` | interno | `apps/worker/src/health.ts:177` |

No toca el contrato: este CU no tiene funciones on-chain.

### 4.2 Eventos y errores canónicos

- **Eventos:** ninguno (ni on-chain ni de dominio).
- **Error de la API:** `WORKER_UNAVAILABLE` con 503
  (`apps/web/src/app/api/admin/system/operations/route.ts:25`).
- **Errores de guard:** `UNAUTHORIZED` (401), `FORBIDDEN` (403) y `SERVER_MISCONFIGURED` (500)
  (`apps/web/src/lib/guard.ts:212`).
- **Error de la UI:** clave `system.workerDown` («El worker no responde; no se puede leer su
  estado.») (`apps/web/messages/es.json:1100`).
- **Campos que publica el worker en `details`:** `lastBlock`, `headBlock`, `lag`,
  `aggregateLastBlock`, `aggregateLag`, `consecutiveRpcFailures`, `consecutiveAggregateFailures`,
  `emailDegraded` y `processingDegraded` (`apps/worker/src/health.ts:145`–`:155`).

### 4.3 Estructuras de datos y almacenamiento

- **`HealthReport`:** `status: "ok" | "down"`, `component` y `details`
  (`packages/shared/src/health/index.ts:12`); el worker se declara con `component: "worker"`
  (`apps/worker/src/health.ts:144`).
- **`WorkerHealth` en la web:** `status`, `component` y `details` como `Record<string, unknown>`
  (`apps/web/src/lib/worker-api.ts:38`).
- **`OperationsResponse` en el cliente:** `health` y `checkedAt`
  (`apps/web/src/components/admin/system/SystemOperations.tsx:8`).
- **Umbrales del estado de salud:** 50 bloques de retraso (`DEFAULT_LAG_THRESHOLD`,
  `apps/worker/src/health.ts:32`) y 3 fallos consecutivos (`HEALTH_FAILURE_THRESHOLD`,
  `packages/shared/src/constants.ts:84`).
- **Cuándo se declara `down`:** superar el umbral de fallos RPC o de agregados, correo degradado,
  proceso degradado, o un lag **negativo** (checkpoint por delante de la cabeza, señal de reinicio o
  reorganización de la cadena) (`apps/worker/src/health.ts:129`–`:139`, `:169`).
- **Sin persistencia propia:** el estado vive en memoria del proceso del worker y se pierde al
  reiniciarlo.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin sesión | 401 `UNAUTHORIZED` | `apps/web/src/app/api/admin/system/operations/route.ts:16` |
| Sesión que no es owner | 403 `FORBIDDEN` | `apps/web/src/lib/guard.ts:215` |
| Worker caído o inalcanzable | 503 `WORKER_UNAVAILABLE` | `apps/web/src/app/api/admin/system/operations/route.ts:23` |
| Worker responde `down` | 503 del worker con `COMPONENT_DOWN` | `apps/worker/src/http-server.ts:114` |
| Worker caído en la pantalla | aviso `operations-degraded` | `apps/web/src/components/admin/system/SystemOperations.tsx:80` |
| Worker responde pero con otro error HTTP | aviso `operations-error` | `apps/web/src/components/admin/system/SystemOperations.tsx:86` |
| Métrica ausente en `details` | se muestra «…» | `apps/web/src/components/admin/system/SystemOperations.tsx:62` |
| Métrica booleana | se muestra sí/no | `apps/web/src/components/admin/system/SystemOperations.tsx:63` |
| Checkpoint por delante de la cadena | `lag` negativo ⇒ `status: down` | `apps/worker/src/health.ts:135`, `:169` |
| Retraso por encima de 50 bloques | `status: down` | `apps/worker/src/health.ts:32`, `:137` |
| Tres fallos seguidos de RPC o agregados | `status: down` | `apps/worker/src/health.ts:130`; `packages/shared/src/constants.ts:84` |
| Sesión caducada durante la pantalla | bloque `session-expired-block` | `apps/web/src/components/admin/AdminPanel.tsx:42` |

## 6. Pruebas y evidencia

- `apps/worker/src/health.test.ts:13` y `:22`: un lag negativo (de cadena o de agregados) degrada la
  salud en vez de reportar `ok`; `:33` y `:42`: umbral de retraso.
- `apps/worker/src/run-worker.test.ts:38`: un ciclo avanza el checkpoint y deja `lag` 0 y `status`
  `ok`; `:78`: tres fallos de RPC marcan `down`; `:417`: se publican `aggregateLastBlock` y
  `aggregateLag`; `:455`: el `lag` refleja el progreso **persistido**, no el retorno del ciclo.
- `apps/worker/src/http-server.test.ts:99`: el contrato de `/health` no cambia (200 si `ok`, 503 si
  `down`).
- `apps/worker/src/aggregate-processor.test.ts:442`: el agregado arranca en el bloque de despliegue.
- `apps/web/src/components/admin/admin-shell.test.ts:52` y `:74`: navegación y migas del grupo
  Sistemas.
- **No cubierto:** no hay ninguna prueba para `SystemOperations` (carga, estado degradado, tabla de
  detalles) ni para `GET /api/admin/system/operations`: al grepear `system/operations` y
  `operations-degraded` en los ficheros de prueba no aparece ninguna coincidencia. Tampoco hay
  prueba end-to-end con el worker levantado y caído.

## 7. Pendiente de confirmar

- El Gherkin pide ver «status ok, lastBlock, headBlock, lag, aggregateLag y fallos consecutivos»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:201`). La pantalla los muestra, pero añade tres
  campos que el criterio no nombra: `consecutiveAggregateFailures`, `emailDegraded` y
  `processingDegraded` (`apps/web/src/components/admin/system/SystemOperations.tsx:14`–`:24`). No se
  ha confirmado si el criterio debe actualizarse.
- El campo `checkedAt` que la API devuelve (`apps/web/src/app/api/admin/system/operations/route.ts:21`)
  es un ISO completo, pero la pantalla lo recorta a `slice(11, 19)` para enseñar solo la hora
  (`apps/web/src/components/admin/system/SystemOperations.tsx:98`). Es UTC sin aviso de zona: no se
  ha confirmado si debería mostrarse en `Europe/Madrid`.
- La clave `system.operationsTitle2` existe en el catálogo
  (`apps/web/messages/es.json:1099`) mientras la página usa la de `admin`
  (`apps/web/src/components/admin/system/SystemOperations.tsx:70`). No se ha confirmado si es una
  clave duplicada sin uso.
- En el worker, `emailDegraded` se limpia cuando el correo vuelve a entregarse
  (`apps/worker/src/run-worker.ts:126`) y `processingDegraded` cuando un ciclo procesa sin error
  (`:228`). No se ha confirmado cuánto tarda la pantalla en reflejar la recuperación si nadie pulsa
  «Actualizar», porque no hay auto-refresco.
- El CU no dice si esta pantalla debe exponerse a recepción o a otro rol; hoy exige owner tanto en
  la API como en el layout (`apps/web/src/app/admin/sistemas/layout.tsx:20`).
