# ADR-16 · Una sola venta primaria por noche (`soldOnce`)

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-05, D-18

## Contexto

El inventario del hotel (tokens no vendidos) está en la tesorería; sin una marca de «ya vendida en
primaria», la misma noche podía volver a venderse como primaria tras una reventa, y el check-in podía
acreditar una noche que nunca se vendió.

## Decisión

`_soldOnce[tokenId]` se marca en la primera venta primaria y es consultable (`soldOnce`/`wasSold`), de
modo que una segunda venta primaria revierte y `markCheckedIn` exige venta previa (`NightNotSold`); el
mint inicial a la tesorería no cuenta como venta.

## Consecuencias

- El check-in acredita consumo de algo vendido de verdad (ADR-05).
- El guard que impide comprar una noche ya consumida queda como **defensa en profundidad**: con la
  venta previa obligatoria esa combinación ya no puede darse, pero se conserva por si se relaja la regla.
- La bandera es por token, no por transacción.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `packages/contracts/src/IHotelNights.sol`, `packages/contracts/test/HotelNights.mint.t.sol`, `packages/contracts/test/HotelNights.checkin.t.sol`.
