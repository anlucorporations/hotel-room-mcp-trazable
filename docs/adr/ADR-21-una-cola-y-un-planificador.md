# ADR-21 · Una cola única, un planificador y el canal propio del monitor

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-03, D-12

## Contexto

La cola BullMQ y la tabla `email_notifications` existían **sin consumidor** (el pipeline enviaba por SMTP
en línea y un SMTP caído bloqueaba el ciclo de ventas), y la quema programada no la ejecutaba nadie: el
`Worker` de BullMQ ni siquiera podía arrancar porque BullMQ exige `maxRetriesPerRequest: null` en las
conexiones bloqueantes.

## Decisión

**Una sola cola** de correo: el pipeline **encola** (fila `PENDING` + trabajo BullMQ con `jobId`
determinista), el worker **consume** con un remitente SMTP real y **reconcilia** periódicamente lo
atascado. Un **planificador** en el worker ejecuta la quema a las 12:00 de la zona del hotel con cerrojo
por día natural (también con varias réplicas) y avisa si el saldo de la hot-wallet baja del umbral. El
**monitor conserva su propio canal SMTP** para alertas de operación, porque una alerta no debe depender
de la infraestructura que vigila: es una decisión deliberada y no una contradicción con «cola única»,
pues la cola es el canal de notificaciones del **producto**.

## Consecuencias

- El at-least-once deja de depender del proveedor de correo y la salud refleja si el correo sale de
  verdad (`emailDegraded`).
- Los trabajos completados se retienen (1 h / 1000 entradas) para que el `jobId` siga existiendo y no se
  dupliquen envíos.
- Un correo que agota reintentos avisa a DevOps por la cola única, sin alertar sobre una alerta.
- El push es *best-effort* y nunca bloquea una venta.

## Dónde se ve

`packages/shared/src/queue/notifications.ts`, `apps/worker/src/queued-mailer.ts`, `apps/worker/src/email-consumer.ts`, `apps/worker/src/burn-scheduler.ts`, `apps/monitor/src/alerter.ts`.
