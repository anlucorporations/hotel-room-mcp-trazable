# ADR-19 · Suelo de precio de listado, gobernable y nunca nulo

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-06, D-19

## Contexto

El royalty es un porcentaje del precio, así que revender a un precio simbólico (1 wei) y pactar el resto
fuera de la plataforma eludía el royalty del hotel; y un suelo que pudiera ponerse a 0 desactivaría la
protección con una sola transacción.

## Decisión

Existe un `minListingPrice` gobernable por administración (`setMinListingPrice`) que toda oferta debe
respetar, y **no puede ser 0**: `setMinListingPrice` revierte con `InvalidPrice` (D-19). El listado por
debajo del suelo revierte con `PriceBelowMinimum` y la UI lo traduce con un mensaje propio. El valor
desplegado en local es 0,01 ETH.

## Consecuencias

- Subir el suelo **no** invalida los listados ya creados: es deuda declarada.
- El suelo es un parámetro económico del hotel y no una constante de código.
- Hay pruebas de evasión por precio simbólico.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `packages/contracts/test/HotelNights.resale.t.sol`, `apps/web/src/components/my-nights/resaleErrorMessage.ts`.
