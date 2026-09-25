# ADR-07 · Guardas de transferencia y patrón checks-effects-interactions

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-05, D-07

## Contexto

Con un ERC-721 normal, dos personas podían intercambiar la noche por fuera del mercado propio: se
eludía el royalty del hotel y el índice y los listados quedaban desincronizados.

## Decisión

`HotelNights` bloquea `transferFrom` y `safeTransferFrom` directos con `DirectTransferDisabled`. El
token solo se mueve por `buy`, `buyResale` y `markCheckedIn`/quema. Las funciones de escritura siguen
el orden checks-effects-interactions y usan `nonReentrant`. Mint y burn (`from == 0`, `to == 0`) sí se
permiten.

## Consecuencias

- El mercado secundario es el único camino de reventa, lo que hace exigible el royalty (ADR-18) y el
  suelo de precio (ADR-19).
- La compra primaria y la reventa son flujos separados, cada uno con su propio camino de firma
  verificado (ADR-11).
- El token del hotel (inventario no vendido) se mintea a la tesorería con `_mint` para evitar el
  `onERC721Received`.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `packages/contracts/test/HotelNights.buy.t.sol`, `packages/contracts/test/HotelNights.resale.t.sol`.
