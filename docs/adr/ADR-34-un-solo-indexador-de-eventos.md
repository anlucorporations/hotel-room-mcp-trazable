# ADR-34 · Un solo indexador de eventos: el listener alimenta el índice y los agregados

- **Estado:** vigente · **Fecha:** 2026-10-22 · **Decisión de origen:** D-87
- **Deuda que cierra:** SRS §7.7, `docs/BACKLOG-SPRINTS.md` §3.6, consecuencia pendiente de
  [ADR-25](ADR-25-dashboard-fuente-unica.md).

## Contexto

La misma noche se indexaba **dos veces** por caminos independientes:

1. **Índice off-chain (`nfts`)**: el `EventListenerService` (`packages/shared/src/events/listener.ts`)
   escaneaba los logs del contrato con `getLogs`, los apilaba y, tras las confirmaciones anti-reorg,
   escribía/actualizaba `nfts` (con `ownerOf` resuelto on-chain).
2. **Agregados/histórico**: `AggregateProcessor.catchUp` escaneaba **otra vez** la cadena con
   `ChainSource.getDomainLogs` (`Mint`/`Sale`/`RoyaltyPaid`/`Burn`) y actualizaba
   `worker_aggregate_counters` / `worker_sale_history` con su propio checkpoint (`last_block`).

Cada indexador tenía su cursor y su ritmo (el del listener, en memoria y desde el bloque de
despliegue; el de agregados, persistido y por chunks). Podían ir por detrás o por delante uno del otro,
así que el KPI «noches vendidas» del dashboard y el inventario «ocupación» podían discrepar: es la
deuda declarada en ADR-25 y en el SRS §7.7.

Los dos decodificaban **los mismos eventos** del mismo contrato: el coste duplicado no aportaba
ninguna garantía adicional.

## Decisión

1. **Un único escáner.** Solo el listener llama a `getLogs` para indexar. Decodifica cada lote **una
   vez** con la función pura `decodeCanonicalDomainEvents` y publica el resultado por el hook
   `onCanonicalEvents` (nuevo en `EventListenerConfig`).
2. **Flujo canónico.** Cada evento publicado lleva su localización on-chain (`blockNumber`, `txHash`,
   `logIndex`) y cubre los seis eventos canónicos: `Mint`, `Sale`, `RoyaltyPaid`, `Listed`,
   `CheckedIn` y `Burn`. Los dos últimos solo los usa el índice; los cuatro primeros, ambos.
3. **El worker consume el flujo, no la cadena.** `AggregateEventIngestor` (`apps/worker`) traduce los
   eventos a `ChainEvent`, resuelve la marca temporal **de los bloques con venta** (necesaria para la
   serie mensual, D-16), los aplica de forma idempotente (`txHash:logIndex`) y avanza `lastBlock`.
   El lote publica también `scannedToBlock` (último bloque LEÍDO): el checkpoint avanza hasta ahí
   **aunque no haya eventos**, para que el lag no crezca en tramos silenciosos. Si una cabecera de
   bloque no se puede leer, **no aplica ni avanza**: la reconciliación reintenta el mismo rango
   (fail-closed heredado del catch-up).
4. **Arranque ordenado.** `runWorker` arranca el listener **después** del rebind (checkpoint y
   agregados ya alineados al contrato actual) mediante `RunWorkerDeps.onWorkerReady`. Para eso
   `startListenerRuntime` admite `autostart: false` y expone `start()`, que hace una primera pasada
   inmediata.
5. **Un solo bucle de escritura.** Se retira `AggregateProcessor.catchUp` (y su dependencia
   `deploymentBlock`); `runCycle` ya no escanea agregados: solo rellena fechas históricas
   (`backfillTimestamps`) y publica el lag. `ChainSource.getDomainLogs` queda como lectura de
   diagnóstico/tests, **sin uso en el bucle**: ningún indexador la consume.
6. **La salud no cambia de semántica.** El ingestor llama a `recordAggregateCycle`/`recordAggregateFailure`
   con los mismos umbrales que antes usaba el catch-up; `aggregateLag` refleja el `lastBlock` que dejó
   el flujo canónico.

El pipeline de **email** (`SaleProcessor` + cola única) no se toca: no es un indexador, tiene su
propio checkpoint y garantía at-least-once de entrega. Mezclarlo con el índice habría acoplado la
entrega de correo al avance del índice.

## Consecuencias

- **Una sola pasada** por el mismo tramo de cadena: se elimina el `getLogs` duplicado de agregados y
  el riesgo de que ambos índices discrepen por cursores distintos.
- Los agregados avanzan **al ritmo del listener** (una pasada por `pollIntervalMs`, con su propio
  `chunkSize`), no con un bucle de chunks aparte. En el catch-up inicial el listener recorre el rango
  completo igual que antes; la idempotencia del store hace seguros los reintentos.
- Si el listener o PostgreSQL fallan, **ambos índices se quedan atrás juntos** y `/health` lo muestra
  (`aggregateLag`), en lugar de que uno avance y el otro no.
- Un evento consolidado en `nfts` y aplicado a agregados sale del **mismo lote**: no puede haber una
  venta en el histórico sin su efecto en el índice (ni al revés) por un problema de cursor.
- El coste de re-escanear desde el bloque de despliegue en cada arranque ya existía para el índice;
  los agregados idempotentes lo absorben sin duplicar cifras.
- `AggregateStore.reset` por redeploy sigue siendo la fuente de verdad para reiniciar agregados; el
  listener se arranca después del rebind para no escribir antes del reset.

## Verificación

- `packages/shared/src/events/listener-events.test.ts`: el hook recibe **un solo lote** con
  localización y royalty separado; si el consumidor lanza, la reconciliación propaga.
- `apps/worker/src/aggregate-ingestor.test.ts`: traducción y descarte de `Listed`/`CheckedIn`, orden,
  timestamps solo de bloques con venta, `lastBlock`, fail-closed, degradación/recuperación de
  `/health`.
- `apps/worker/src/run-worker.test.ts`: el ciclo **no** escanea agregados (`requestedDomainRanges`
  vacío) y publica el `lastBlock` persistido; el rebind sigue reseteando los agregados.
- `apps/worker/src/aggregate-processor.test.ts`: la idempotencia y las lecturas del dashboard se
  mantienen al aplicar lotes (sin catch-up).

## Dónde se ve

`packages/shared/src/events/listener.ts` (`decodeCanonicalDomainEvents`, `onCanonicalEvents`),
`apps/worker/src/aggregate-ingestor.ts`, `apps/worker/src/listener-runtime.ts`,
`apps/worker/src/run-worker.ts`, `apps/worker/src/main.ts`.
