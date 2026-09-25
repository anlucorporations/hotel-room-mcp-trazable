# ADR-25 · El dashboard lee una fuente única

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-16

## Contexto

La misma cifra se calculaba por tres caminos distintos (el dashboard desde `sale_events` y `nfts`, el
histórico desde `sale_events`, y el worker desde `worker_sale_history`), así que las cifras podían no
cuadrar entre pantallas.

## Decisión

Los agregados se calculan en PostgreSQL en el worker (`GROUP BY`/`FILTER`, mes natural en la zona del
hotel con `AT TIME ZONE`, desglose por tipo y ranking de más revendidas) y se exponen por `/aggregates`;
el dashboard, el histórico público y sus CSV leen **esa** fuente. Las cuatro consultas se leen en una
transacción `REPEATABLE READ` para no mezclar dos instantes. El criterio de aceptación es que las cifras
cuadren con el histórico, y está cubierto por el E2E de M7, que compara el SQL con una derivación
independiente.

## Consecuencias

- La serie mensual necesitó rellenar la marca temporal de filas antiguas desde su bloque
  (`backfillTimestamps`): `undatedSalesCount` pasó de 26 a 0.
- La zona horaria es una constante del dominio (`DASHBOARD_TIME_ZONE`, `Europe/Madrid`) porque es un dato
  del hotel.
- Siguen existiendo dos indexadores de la misma noche (el índice del listener y los agregados del
  procesador); unificarlos es deuda declarada.

## Dónde se ve

`apps/worker/src/aggregate-processor.ts`, `apps/worker/src/http-server.ts`, `apps/web/src/lib/worker-api.ts`, `apps/web/src/components/dashboard/`, `apps/web/src/lib/dashboard-data.ts`.
