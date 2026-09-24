# ADR-08 · Fechas `AAAAMMDD` en UTC y caducidad por umbral

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-05, D-06

## Contexto

La caducidad de una noche es una regla económica (una noche pasada no se puede vender) y dependía de la
zona horaria del servidor, de modo que daba resultados distintos según dónde corriera el proceso.

## Decisión

El `tokenId` se deriva de forma determinística de `(roomNumber, fecha)`, con la fecha civil en formato
`AAAAMMDD` calculada en **UTC** (`DateLib.timestampToDate`, `domain/token-id.ts`). La caducidad se decide
por umbral de `block.timestamp` contra la medianoche UTC de la fecha de entrada.

La conversión a la zona del hotel (`Europe/Madrid`) es **solo off-chain** (dashboard, quema programada,
informes) y nunca decide validez.

## Consecuencias

- El contrato es determinista e independiente del entorno donde se ejecute.
- Hay un margen documentado de hasta 2 h entre UTC y Madrid que afecta a los informes, no a la
  propiedad del token.
- La quema programada usa `BURN_TIMEZONE` (`Europe/Madrid` por defecto) sobre la hora leída del
  **último bloque de la cadena**, no del reloj de la máquina.

## Dónde se ve

`packages/contracts/src/libraries/DateLib.sol`, `packages/shared/src/domain/token-id.ts`, `packages/shared/src/constants.ts`, `apps/worker/src/burn-scheduler.ts`.
