# ADR-02 · Un solo contrato: `HotelNights`

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-02

## Contexto

La auditoría V5 (hallazgo H-01) encontró dos generaciones vivas a la vez: `HotelNFT` +
`HotelMarketplace` (la que desplegaba el script y usaba el cliente para comprar) y `HotelNights`
(la canónica, con roles y protección económica). Comprar firmaba contra una y se revisaba contra la
otra.

## Decisión

Toda la operación on-chain —minteo, venta primaria, listado, reventa, `claim`, check-in, pausa,
fondos y quema— ocurre en **`HotelNights`**. `HotelNFT.sol` y `HotelMarketplace.sol` quedan **fuera
del runtime**: ni se despliegan, ni se importan desde el cliente, ni aparecen en los ABIs de
aplicación.

## Consecuencias

- Un único camino de firma por operación y un único destino (`contractAddress`), con guardián que
  falla si aparece una dirección o un ABI legacy (ADR-11).
- El extracto de ingresos es `pendingWithdrawals(address)` + `claim()` (ADR-15), no
  `withdraw()` del marketplace.
- La retirada física de los ficheros legacy es parte del cierre de M9; hasta que ocurra, su
  existencia es deuda declarada, no comportamiento del sistema.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `apps/web/src/components/buy/verifiedTxRequest.ts`,
`apps/web/src/lib/legacy-target-guardian.test.ts`, `packages/shared/src/architecture-guardian.test.ts`.
