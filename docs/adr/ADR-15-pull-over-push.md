# ADR-15 · Cobros por pull (`claim`) en lugar de envío directo

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-06, D-07

## Contexto

Si la reventa enviara el pago al vendedor y al hotel dentro de la misma transacción, un receptor que
rechazara ETH (contrato sin `receive`, wallet problemática) bloquearía la reventa entera, y una
transferencia fallida podría dejar la operación a medias.

## Decisión

`HotelNights` **acredita** los importes en `_pending` y cada beneficiario los retira con `claim()`
(consulta `pendingWithdrawals(address)`); la venta nunca depende de que el cobro funcione.

## Consecuencias

- Hay una transacción adicional y el usuario debe reclamar: la UI ofrece `ClaimPanel` y `useClaim`.
- El extracto es auditable on-chain por dirección.
- Probado con un receptor de royalty que rechaza ETH: la reventa **no** se bloquea.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `packages/contracts/src/IHotelNights.sol`, `apps/web/src/components/my-nights/useClaim.ts`, `packages/contracts/test/HotelNights.resale.t.sol`.
