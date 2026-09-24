# ADR-11 · Nunca se firma una transacción no verificada

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-07

## Contexto

Hallazgo H-02: la pantalla de revisión decodificaba el calldata del contrato canónico y la firma se
enviaba al contrato legacy `HotelMarketplace`. El usuario aprobaba una cosa y firmaba otra. Además, el
`buy(uint256)` legacy comparte **selector** con el canónico, así que el calldata era byte a byte
idéntico: lo único que distinguía una generación de otra era la **dirección**.

## Decisión

Hay un único punto de firma, `verifiedTxRequest`. Recibe el objeto `PurchaseTxData` **ya verificado**
(calldata, `value` y forma) y **falla en cerrado** si el destino no es `contractAddress`. La revisión
construye ese objeto y la firma envía exactamente ese objeto (`useSendTransaction`), sin reconstruirlo.

La validación es server-side e independiente del LLM (`validate-tx.ts`) y se re-verifica en cliente
antes de firmar. El MCP y el asistente **nunca firman ni custodian claves**.

## Consecuencias

- Un guardián (`legacy-target-guardian.test.ts`) falla si aparece el ABI legacy, un segundo camino de
  firma o una dirección literal de contrato fuera de `config/chain.ts`.
- El asistente conserva confirmación manual del usuario.
- **Deuda menor**: `unlist` es la única escritura de reventa sin objeto verificado, porque no tiene
  importe que verificar.

## Dónde se ve

`apps/web/src/components/buy/verifiedTxRequest.ts`, `apps/web/src/components/buy/useBuyNight.ts`, `apps/web/src/components/buy/usePurchaseReview.ts`, `apps/web/src/lib/assistant/validate-tx.ts`, `packages/shared/src/domain/purchase-tx.ts`, `apps/web/src/lib/legacy-target-guardian.test.ts`.
