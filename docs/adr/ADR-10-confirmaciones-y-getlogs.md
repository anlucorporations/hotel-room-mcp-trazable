# ADR-10 · Confirmaciones y rango de `getLogs` alineados a Anvil

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-12

## Contexto

El SRS declaraba parámetros de Polygon (32 confirmaciones, chunks de 2.000 bloques) que en la red local
hacían lento e incluso inutilizable el indexado. El sistema afirmaba además un failover multi-RPC que
no existía.

## Decisión

En la red canónica (Anvil local) se usan **1 confirmación** (`REORG_CONFIRMATIONS=1`) y chunks de
**5.000 bloques**. Los valores de Polygon quedan **documentados como configuración de mainnet** (32
confirmaciones, chunks de 2.000) y se cambian por variables de entorno, sin tocar código.

**No hay failover multi-RPC** y la variable `RPC_FALLBACK_URL` se retira.

## Consecuencias

- En Anvil la finalidad es inmediata y el indexado es viable.
- Antes de la fase pública hay que fijar 32 confirmaciones y **probar un reorg real**, que hoy no está
  probado: **deuda declarada**.
- El listener alerta por silencio de bloques (`SILENCE_THRESHOLD_MS`) y el monitor vigila la viveza de
  la cadena.

## Dónde se ve

`.env.example`, `apps/worker/src/config.ts`, `apps/worker/src/listener-runtime.ts`, `apps/monitor/src/chain-monitor.ts`, `RepoTecnico/entornos_globales.md` §2.
