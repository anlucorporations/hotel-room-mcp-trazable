# CU-05 · Comprar una noche al hotel — Manual técnico

> Bloque 4 · Ventas · Actor: Comprador · Requisitos: RF-03, RF-01, RNF-05, RNF-14, RNF-18

## 1. Ficha y trazabilidad

- **Objetivo.** Que un comprador con wallet conectada pague el precio exacto de una noche del
  inventario del hotel y reciba el NFT-Noche en la misma transacción, con el 100 % del importe en
  `treasury` y sin royalty.
- **Actor primario.** Comprador (usuario con wallet, CU-17). **Secundario:** el hotel, que cobra en
  `treasury`; el asistente IA (CU-08), que reutiliza el mismo punto de firma.
- **Requisitos que cubre.** RF-03 (venta primaria), RF-01 (inventario disponible), RNF-05 (estado
  degradado), RNF-14 (seguridad de la transacción: CEI + `nonReentrant` + guard de transferencias)
  y RNF-18. Decisión de diseño D-07 (contrato canónico y calldata de compra por flujo).
- **Precondición.** Wallet conectada en la red de la app y saldo ≥ precio; noche minteada, sin venta
  previa (`soldOnce == false`) y con fecha dentro de la ventana de catálogo.
- **Disparador.** El comprador pulsa **Reservar** en la tarjeta de la noche y luego confirma en el
  modal. El texto del botón es `Reservar` (`apps/web/messages/es.json`, clave `buy.buy`).
- **Postcondición.** `ownerOf(tokenId) == comprador`, `soldOnce(tokenId) == true`, `Sale(...,
  PRIMARY)` en el recibo, `treasury` con el importe íntegro y la noche visible en `/mis-noches`.
- **Dónde vive.**
  - Ruta del catálogo: `apps/web/src/app/catalogo/page.tsx:17` (Server Component,
    `force-dynamic` en `:9`).
  - Fuente de datos: `apps/web/src/lib/nights.ts:147` (`fetchCatalog`).
  - Tarjeta y CTA: `apps/web/src/components/NightCard.tsx:140` (monta `BuyButton`).
  - Flujo de compra: `apps/web/src/components/buy/BuyButton.tsx:30`.
  - Firma: `apps/web/src/components/buy/useBuyNight.ts:28`.
  - Contrato: `packages/contracts/src/HotelNights.sol:156` (`buy`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. `/catalogo` resuelve en paralelo el catálogo y el estado `paused()` del contrato
   (`catalogo/page.tsx:23`–`:27`); `fetchCatalog` deja solo inventario primario dentro de la
   ventana de 90 días (`nights.ts:110`–`:118` y `:147`).
2. `NightCard` pinta la noche y, si el contrato no está en pausa, monta el CTA con el `tokenId`, el
   precio en wei y `saleType` (`NightCard.tsx:132`–`:141`).
3. `BuyButton` construye el calldata real de la compra con `buildPurchaseTxData`
   (`BuyButton.tsx:60`–`:70`), que para `PRIMARY` codifica `buy(uint256)` con `value = priceWei`
   (`packages/shared/src/domain/purchase-tx.ts:35` y `:39`–`:51`).
4. Al pulsar **Reservar**, el botón comprueba el ciclo de onboarding: si no hay wallet conectada
   llama a `connect()`; si la red es incorrecta, a `switchToAppChain()`; si el saldo no llega,
   no abre nada (`BuyButton.tsx:95`–`:101`).
5. Si todo está listo, abre el modal en fase `review` (`BuyButton.tsx:100` y `:74`). El modal vive
   en `apps/web/src/components/buy/TxModal.tsx:12` (`TxPhase = "review" | TxStatus`).
6. La revisión decodifica el calldata y lee el precio on-chain del `tokenId` **real** del calldata
   (`usePurchaseReview.ts:48`–`:72`): `priceOf` en primaria y `listingOf.price` en reventa
   (`:66`–`:69`), con `staleTime: 0` para no servir caché.
7. `reverifyPurchase` contrasta `to`, `chainId`, `value == precio` y `tokenId`
   (`apps/web/src/components/assistant/reverify.ts:38`–`:62`, apoyado en
   `verifyPurchaseTx`, `purchase-tx.ts:86`–`:111`). Solo si `verified` es `true` se habilita el
   botón de firmar (`BuyButton.tsx:104` y `:220`–`:231`).
8. La firma pasa por `verifiedTxRequest`, que vuelve a exigir que el calldata sea `buy`/`buyResale`,
   que `to` sea el contrato canónico y que `value` sea convertible a `bigint`
   (`verifiedTxRequest.ts:35`–`:51`). `useBuyNight` usa `useSendTransaction` —no
   `useWriteContract`— para no recodificar el calldata ya revisado (`useBuyNight.ts:22`–`:36`).
9. En el contrato, `buy` valida y marca el efecto antes de interactuar (CEI):
   `_soldOnce[tokenId] = true` (`HotelNights.sol:170`), limpia cualquier listado residual (`:174`)
   y emite `Sale(tokenId, seller, msg.sender, price, SaleType.PRIMARY)` (`:175`).
10. Desbloquea el guard de transferencias (`_unlockTransfer`, `:178`) y ejecuta
    `_safeTransfer(seller, msg.sender, tokenId, "")` (`:179`); el `_update` de ERC-721 exige la
    marca transitoria o revierte con `DirectTransferDisabled` (`:484`–`:495`).
11. Envía el precio íntegro a `treasury` con `call{value: price}` (`:184`) y revierte con
    `EthTransferFailed` si el destino rechaza el ETH (`:185`).
12. Al confirmarse, el modal pasa a `confirmed` y ofrece el enlace «Ver en Mis noches»
    (`BuyButton.tsx:237`–`:241`); al cerrar, se marca `router.refresh()` para releer el catálogo
    (diferido a propósito, `BuyButton.tsx:81`–`:93`).

### 2.2 Validaciones

- **Saldo en cliente.** `useBalance` y `insufficientBalance` bloquean el botón y muestran cuánto
  falta (`BuyButton.tsx:52`–`:57` y `:141`–`:160`); si hay faucet configurado se ofrece recargar
  (`:154`–`:158`).
- **Contrato pausado.** `whenNotPaused` en `buy` (`HotelNights.sol:156`); la tarjeta no ofrece el
  CTA si `paused` es `true` (`NightCard.tsx:132`–`:141`) y `fetchContractPaused` lo lee on-chain
  (`nights.ts:131`–`:139`).
- **Noche inexistente o ya vendida.** `seller == address(0) || _soldOnce[tokenId]` revierte con
  `NightNotAvailable(tokenId)` (`HotelNights.sol:157`–`:158`).
- **Noche consumida en recepción.** Si `_checkedIn[tokenId]`, revierte `NightNotAvailable`
  (`HotelNights.sol:163`).
- **Noche expirada.** `_isExpired` compara la fecha del `tokenId` con el día UTC actual
  (`HotelNights.sol:164` y `:501`–`:503`) y revierte con `NightExpired(tokenId)`.
- **Importe exacto.** `msg.value != price` revierte con `IncorrectPayment(price, msg.value)`
  (`HotelNights.sol:166`–`:167`); el precio sale de `_price[tokenId]`, no del llamante.
- **Reentrada.** Modificador `nonReentrant` (`HotelNights.sol:156`), que revierte con
  `ReentrancyGuardReentrantCall()` de OpenZeppelin.

### 2.3 Efectos on-chain / persistencia

- **Escrituras.** `_soldOnce[tokenId] = true` (`HotelNights.sol:170`), borrado de `_listings`
  (`:174`), transferencia ERC-721 (`:179`) y transferencia de ETH a `treasury` (`:184`).
- **Eventos.** `Sale` con `SaleType.PRIMARY` (`IHotelNights.sol:28` y `:14`–`:16`). La primaria
  **no** emite `RoyaltyPaid` (verificado en `packages/contracts/test/HotelNights.buy.t.sol:69`).
- **Sin datos personales.** Solo se persiste la dirección del comprador como nuevo `ownerOf`
  (`docs/CASOS-DE-USO.md:362`).
- **Nada off-chain.** La web no escribe en base de datos al comprar: el índice se alimenta de los
  eventos y `/mis-noches` los descubre por RPC (`apps/web/src/components/my-nights/useMyNights.ts:103`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `buy(uint256)` payable | `packages/contracts/src/HotelNights.sol:156`; interfaz en `IHotelNights.sol:107` | Precio exacto, 100 % a `treasury` |
| `priceOf(uint256)` | `HotelNights.sol:409`; `IHotelNights.sol:110` | Precio primario que se re-verifica |
| `soldOnce(uint256)` | `HotelNights.sol:414`; `IHotelNights.sol:113` | Marca «ya tuvo venta primaria» |
| `isExpired(uint256)` | `HotelNights.sol:424`; `IHotelNights.sol:124` | Fecha del `tokenId` < hoy UTC |
| `treasury()` | `HotelNights.sol:86`; `IHotelNights.sol:213` | Receptor de la primaria |
| `buildPurchaseTxData` | `packages/shared/src/domain/purchase-tx.ts:39` | Compone `to`/`data`/`value`/`chainId` |
| `verifyPurchaseTx` | `purchase-tx.ts:86` | Verificación independiente del constructor |
| `fetchCatalog` | `apps/web/src/lib/nights.ts:147` | Fuente del catálogo |

No hay endpoint HTTP propio de la compra: la firma es cliente → contrato.

### 4.2 Eventos y errores canónicos

- `event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256
  price, uint8 saleType)` (`IHotelNights.sol:28`–`:33`), con `SaleType.PRIMARY = 0`
  (`IHotelNights.sol:14`–`:16`).
- Errores usados por `buy`: `NightNotAvailable` (`IHotelNights.sol:68`), `NightExpired` (`:67`),
  `IncorrectPayment` (`:70`), `EthTransferFailed` (`:91`), más `EnforcedPause` (de `Pausable`) y
  `ReentrancyGuardReentrantCall` (de `ReentrancyGuard`); ninguno de estos dos últimos se declara en
  `IHotelNights.sol`.
- El guard de transferencias revierte con `DirectTransferDisabled` (`IHotelNights.sol:78`) para
  cualquier `transferFrom`/`safeTransferFrom` que no venga de `buy`/`buyResale`
  (`HotelNights.sol:484`–`:495`).

### 4.3 Estructuras de datos y almacenamiento

- `PurchaseTxData = { to, data, value, chainId }` con `value` en wei como `string`
  (`purchase-tx.ts:19`–`:24`).
- `tokenId = room · 10^8 + AAAAMMDD` (`HotelNights.sol:77` y `:144`); el tipo de habitación se
  deriva del registro dinámico `_roomTypeName` (`HotelNights.sol:102` y `:512`–`:517`).
- Estado del contrato que se toca: `_soldOnce`, `_listings` y `_price`
  (`HotelNights.sol:91`–`:92`); el inventario del hotel arranca en `treasury` (`:148`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Saldo insuficiente (05a) | Botón deshabilitado + aviso de cuánto falta | `BuyButton.tsx:54`–`:57`, `:132`, `:141` |
| Noche ya vendida (05b, 05d) | `NightNotAvailable(tokenId)` | `HotelNights.sol:157`–`:158` |
| Noche expirada (05c, 05e) | `NightExpired(tokenId)` | `HotelNights.sol:164`; UI: `nights.ts:117` |
| Importe distinto del precio | `IncorrectPayment(expected, sent)` | `HotelNights.sol:166`–`:167` |
| Reentrada desde receptor (05f) | `ReentrancyGuardReentrantCall()` | `HotelNights.sol:156` |
| `transferFrom` directo | `DirectTransferDisabled()` | `HotelNights.sol:484`–`:495` |
| El usuario rechaza la firma (05g) | `txError.rejected`; `status` vuelve a `idle` | `BuyButton.tsx:76` y `:210`–`:214` |
| Precio cambió on-chain | Aviso «el precio acaba de cambiar» y no se firma | `usePurchaseReview.ts:100`–`:114`; `BuyButton.tsx:200`–`:208` |
| No se pudo leer el precio | `review-verify-failed` con reintento | `BuyButton.tsx:186`–`:198` |
| `treasury` rechaza ETH | `EthTransferFailed()` | `HotelNights.sol:185`; test en `HotelNights.buy.t.sol:156` |
| Contrato en pausa | `EnforcedPause`; la tarjeta no ofrece CTA | `NightCard.tsx:132`–`:141` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.buy.t.sol:69` — compra correcta: NFT al comprador, 100 % a
  tesorería, `soldOnce` y ausencia de `RoyaltyPaid`.
- `HotelNights.buy.t.sol:93` (ya vendida), `:103` (inexistente), `:110` (expirada), `:118` (importe
  incorrecto), `:127` (reentrancy), `:139`/`:145` (transferencia directa bloqueada), `:156`
  (tesorería hostil) y `:176` (el guard no queda atascado tras revertir).
- `packages/contracts/test/HotelNights.invariants.t.sol:203` — `invariant_BalanceCoversTotalPending`.
- Web: `apps/web/src/components/buy/verifiedTxRequest.test.ts:52` (selector de `buy`), `:107`
  (falla en cerrado) y `:125` (destino no canónico);
  `packages/shared/src/domain/purchase-tx.test.ts:18` (codificación) y `:100` (`value` distinto del
  precio).
- Plan: `docs/PLAN-DE-PRUEBAS.md:89`–`:102` (TC-CT-020…TC-CT-025, TC-E2E-020…022, TC-ACC-001).
- **No cubierto.** No hay test unitario de `BuyButton` ni de los hooks `useBuyNight` /
  `usePurchaseReview`; el E2E de compra real
  (TC-E2E-020) exige Anvil + wallet MCP y no vive en `apps/web/e2e/` (allí solo hay `home`,
  `a11y`, `asistente` y `observabilidad`). La concurrencia (05d) no tiene test en el repositorio,
  solo la fila del plan.

## 7. Pendiente de confirmar

- **Estado `DISPONIBLE`.** El fuente habla de noche en estado `DISPONIBLE`
  (`docs/CASOS-DE-USO.md:311`), pero el contrato no tiene enum de estado: la comprabilidad se
  deriva de `_soldOnce`/`_checkedIn`/`_isExpired`/`_listings`. El vocabulario `DISPONIBLE` /
  `LISTADA_SECUNDARIO` sí existe en el MCP (`apps/mcp/src/tools/tools.ts:29`–`:32`). Confirmar
  cuál es el canónico para el manual.
- **Zona horaria.** La expiración usa UTC (`HotelNights.sol:497`–`:503`), mientras el brief fija
  `Europe/Madrid`; confirmar el criterio de negocio.
- **Suelo/ventana en la UI.** La ventana de 90 días se filtra en servidor (`nights.ts:110`–`:118`)
  y el suelo de reventa solo se lee en el back-office
  (`apps/web/src/components/admin/system/SystemContractState.tsx:20`); no se muestra al comprador.
- **Faucet en el flujo.** El aviso de saldo insuficiente ofrece `FaucetButton` en red de pruebas
  (`BuyButton.tsx:154`); confirmar si el manual de CU-05 debe mencionarlo o remitir a CU-PR-01.
- **Asistente IA.** El handoff del asistente reutiliza `usePurchaseReview` y `verifiedTxRequest`
  (`apps/web/src/components/assistant/reverify.ts:1`–`:15`); confirmar que CU-05 no absorbe el
  recorrido del CU-08.
