# ADR-03 · PostgreSQL como única persistencia

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-09, D-10

## Contexto

El worker guardaba sus checkpoints y sus agregados en dos ficheros SQLite, mientras la web y el resto
del sistema usaban PostgreSQL. Eso producía dos verdades sobre el mismo hecho y dejaba 36 pruebas en
rojo por `better-sqlite3`.

## Decisión

Toda la persistencia es PostgreSQL, incluidas las tablas del worker `worker_checkpoints`,
`worker_processed_logs`, `worker_aggregate_counters` y `worker_sale_history`, con los importes en
`NUMERIC(78,0)`. `better-sqlite3` queda eliminado del proyecto.

`runMigrations()` se ejecuta al arrancar en cerrado. Las migraciones son incrementales e idempotentes,
y el orden importa: `CREATE TABLE IF NOT EXISTS` no añade columnas a una tabla existente — hubo un
fallo real por poner un `CREATE INDEX` antes del `ALTER TABLE ... ADD COLUMN`.

En desarrollo se usa PostgreSQL 18 local y un Redis compatible nativo (Memurai 4.1.2,
`redis_version 7.2.5`). Los agregados se leen en una transacción `REPEATABLE READ` para no mezclar dos
instantes.

## Consecuencias

- Una sola verdad: checkpoints, agregados y datos de negocio viven en el mismo motor y se pueden
  consultar en una misma transacción.
- Las migraciones se aplican al arrancar; una migración mal ordenada rompe el arranque en cerrado en
  lugar de dejar el esquema a medias.
- El desarrollo exige PostgreSQL y el servidor Redis compatible levantados; no hay modo de fichero.
- `REPEATABLE READ` da coherencia de instantánea en los agregados, a cambio de reintentos si hay
  conflicto de escritura.

## Dónde se ve

`packages/shared/src/db/migrator.ts`, `packages/shared/src/db/pool.ts`, `apps/worker/src/checkpoint-store.ts`, `apps/worker/src/aggregate-store.ts`, `packages/shared/src/architecture-guardian.test.ts`, `RepoTecnico/diccionario_datos.md`.
