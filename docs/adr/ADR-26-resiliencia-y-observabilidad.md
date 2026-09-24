# ADR-26 · Resiliencia y observabilidad sin Sentry y sin failover

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-12

## Contexto

El SRS y el README afirmaban observabilidad centralizada con Sentry y failover multi-RPC, y ninguna de
las dos cosas existía: el hook de Sentry era condicional y el paquete no estaba instalado, y no había
segundo RPC.

## Decisión

Se **retiran** ambas afirmaciones. La observabilidad de errores es el **logging estructurado en JSON**
(`logger.ts`). Las alertas operativas las emite el **monitor**, que vigila los `/health` de los
servicios, la **viveza de la cadena** (ciclos sin bloque nuevo) y el **saldo de gas** de las wallets
configuradas, avisando **al entrar en fallo** y rearmándose tras recuperarse. El listener emite
**heartbeat** y dispara **alerta de silencio** (una vez por episodio) si no llegan bloques en el umbral,
y un `lag` negativo degrada la salud en lugar de reportar `ok`.

## Consecuencias

- No hay trazas de error centralizadas con *stack* agregado: es el precio declarado de retirar Sentry.
- La alerta de operación no depende de Redis ni de la cola, porque el monitor tiene su propio SMTP
  (ADR-21).
- El aviso de gas bajo se emite antes de quedarse sin fondos para quemar o anclar.

## Dónde se ve

`packages/shared/src/logger.ts`, `apps/worker/src/listener-runtime.ts`, `apps/worker/src/burn-scheduler.ts`, `apps/monitor/src/chain-monitor.ts`, `apps/monitor/src/alerter.ts`, `apps/worker/src/health.ts`.
