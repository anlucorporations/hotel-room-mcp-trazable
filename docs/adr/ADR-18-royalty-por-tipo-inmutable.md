# ADR-18 · Royalty por tipo de habitación, inmutable

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-06, D-20

## Contexto

El royalty era un parámetro global configurable por el back-office, así que el hotel podía cambiarlo
después de vender una noche: el comprador no sabía a qué se atenía y la promesa «5 % o 10 %» no era
verificable ni estable.

## Decisión

El royalty queda **fijado en el mint según el tipo de habitación** —5 % simple y doble, 10 % suite— y es
**inmutable**; se implementa con `royaltyInfo` (EIP-2981) derivado de la habitación, se elimina el
parámetro global y el rol de royalty, y la pantalla de back-office pasa a ser **informativa**. El segundo
argumento del constructor (basis points) se eliminó por quedar sin efecto (D-20): el constructor recibe
solo la tesorería.

## Consecuencias

- La pantalla de royalty ya no escribe.
- El ABI se regeneró y hay pruebas de inmutabilidad tras la venta.
- El royalty solo es exigible porque las transferencias directas están bloqueadas (ADR-07) y el suelo de
  precio evita la elusión por precio simbólico (ADR-19).

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `packages/contracts/src/libraries/RoomMaster.sol`, `packages/contracts/test/HotelNights.royalty.t.sol`, `apps/web/src/components/admin/AdminRoyalty.tsx`.
