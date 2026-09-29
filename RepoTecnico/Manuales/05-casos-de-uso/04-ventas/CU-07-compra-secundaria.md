# CU-07 · Comprar una noche que otro cliente revende — Manual técnico

> Bloque 4 · Ventas · Actor: Comprador secundario · Requisitos: RF-07, RF-08, RF-03, RNF-10, RNF-14

## 1. Ficha y trazabilidad

- **Objetivo.** Que un comprador pague el precio de un listado de reventa y reciba el NFT-Noche,
  repartiendo el importe entre el vendedor y el receptor del royalty del hotel, todo en la misma
  transacción.
- **Actor primario.** Comprador secundario. **Secundarios:** el vendedor (propietario que listó en
  CU-06), el hotel como receptor del royalty (`treasury`) y el asistente IA, que reutiliza el mismo
  punto de firma.
- **Requisitos que cubre.** RF-07 (reventa), RF-08 (royalty por tipo de habitación), RF-03 (venta),
  RNF-10 (royalty forzado, sin setter) y RNF-14 (CEI + `nonReentrant` + guard de transferencias).
- **Precondición.** Existe un listado activo (`listingOf(tokenId).active == true`), la noche no está
  consumida ni expirada y el comprador tiene saldo ≥ precio en la red correcta.
- **Disparador.** El comprador descubre la noche en `/reventa` y pulsa **Reservar reventa**
  (`apps/web/messages/es.json`, clave `buy.buyResale`).
- **Postcondición.** `ownerOf(tokenId) == comprador`; vendedor y receptor de royalty quedan
  **acreditados** en `_pending` (cobro posterior con `claim()`); el listado se borra; se emiten
  `Sale(..., SECONDARY)` y `RoyaltyPaid`.
- **Dónde vive.**
  - Pantalla: `apps/web/src/app/reventa/page.tsx:14` (ruta `/reventa`).
  - Lectura del mercado: `apps/web/src/lib/nights.ts:226` (`fetchResaleMarket`).
  - Parrilla: `apps/web/src/components/resale/ResaleMarketClient.tsx:19`.
  - Tarjeta y CTA: `apps/web/src/components/NightCard.tsx:140` (reutiliza `BuyButton`).
  - Firma: `apps/web/src/components/buy/useBuyNight.ts:28` (misma que CU-05).
  - Contrato: `packages/contracts/src/HotelNights.sol:241` (`buyResale`) y `:270` (`claim`).
  - MCP: `apps/mcp/src/tools/tools.ts:29`–`:32` (traduce `LISTADA_SECUNDARIO` a `SECONDARY`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. `/reventa` es dinámica (`reventa/page.tsx:8`) y resuelve por separado el mercado y el estado
   `paused()` con `Promise.allSettled` (`:19`–`:25`): un fallo al leer la pausa no tumba el mercado.
2. `fetchResaleMarket` escanea los eventos `Listed` desde el bloque de despliegue
   (`nights.ts:231`), confirma cada candidata con `listingOf` y `isCheckedIn` (`:236`–`:250`) y
   descarta las que el contrato rechazaría (`:256`–`:273`).
3. Si había listados y **ninguna** lectura respondió, lanza para que la vista muestre estado
   degradado en vez de una lista vacía engañosa (`nights.ts:281`–`:285`).
4. `ResaleMarketClient` pinta el contador, el aviso de pausa y una tarjeta por noche
   (`ResaleMarketClient.tsx:61`–`:80`). Cada tarjeta es el mismo `NightCard` del catálogo, con
   `saleType: "SECONDARY"` (`nights.ts:271`).
5. `BuyButton` construye el calldata con `buildPurchaseTxData` (`BuyButton.tsx:60`–`:70`), que para
   `SECONDARY` codifica `buyResale(uint256)` con `value = precio` (`purchase-tx.ts:35` y `:39`).
6. El modal abre en «Revisar» (`BuyButton.tsx:74` y `:100`); `usePurchaseReview` detecta
   `decoded.functionName === "buyResale"` (`usePurchaseReview.ts:57`) y lee el precio con
   `listingOf` en vez de `priceOf` (`:66`–`:69`).
7. La re-verificación compara `value` con el precio on-chain y `to`/`chainId`/`tokenId`
   (`reverify.ts:38`–`:62`); solo si `verified` es `true` se firma (`BuyButton.tsx:104`), y
   `verifiedTxRequest` vuelve a exigir destino canónico y `bigint` válido
   (`verifiedTxRequest.ts:35`–`:51`).
8. En el contrato, `buyResale` lee el listado y exige `active` (`HotelNights.sol:242`–`:243`), que
   la noche no esté consumida (`:246`), no esté expirada (`:247`) y que `msg.value` sea exactamente
   el precio del listado (`:248`).
9. Calcula el reparto con la **misma** función pública ERC-2981 que consultan los marketplaces:
   `royaltyInfo(tokenId, listing.price)` (`HotelNights.sol:251`–`:253`) y
   `sellerProceeds = listing.price - royaltyAmount` (`:254`). No hay fórmula duplicada.
10. Effects (CEI): borra el listado (`:257`), marca `_soldOnce = true` (`:258`) y **acredita** al
    vendedor y al receptor con `_credit` (`:259`–`:260`, pull payments ADR-15).
11. Emite `Sale(tokenId, seller, msg.sender, listing.price, SaleType.SECONDARY)` (`:261`) y
    `RoyaltyPaid(tokenId, royaltyReceiver, royaltyAmount)` (`:262`).
12. Interaction: desbloquea el guard (`:265`) y transfiere el NFT con
    `_safeTransfer(seller, msg.sender, tokenId, "")` (`:266`).
13. El vendedor cobra después desde la UI: `ClaimPanel` muestra el saldo pendiente y firma
    `claim()` (`ClaimPanel.tsx:13` y `useClaim.ts:24`–`:35`), que paga `_pending[msg.sender]` y lo
    pone a cero antes de enviar (`HotelNights.sol:270`–`:279`).

### 2.2 Validaciones

- **Listado inexistente o ya cerrado (07b).** `!listing.active` revierte con `NotListed(tokenId)`
  (`HotelNights.sol:243`).
- **Noche consumida.** `_checkedIn[tokenId]` revierte con `NightNotResellable(tokenId)`
  (`HotelNights.sol:246`).
- **Noche expirada (07c).** `_isExpired` revierte con `NightExpired(tokenId)` (`HotelNights.sol:247`).
- **Importe distinto (07a).** `msg.value != listing.price` revierte con
  `IncorrectPayment(listing.price, msg.value)` (`HotelNights.sol:248`).
- **Transferencia directa (07d).** `_update` de ERC-721 revierte con `DirectTransferDisabled()` si
  no hay marca transitoria (`HotelNights.sol:484`–`:495`).
- **Reentrada (07e).** `nonReentrant` en `buyResale` (`HotelNights.sol:241`) y en `claim` (`:270`);
  revierten con `ReentrancyGuardReentrantCall()` de OpenZeppelin.
- **Truncamiento del royalty (07f).** `royaltyAmount = salePrice · bps / 10000` redondea hacia abajo
  (`HotelNights.sol:456`), y `sellerProceeds` es la resta exacta (`:254`), así que la suma se
  mantiene. Si el royalty se trunca a 0, `_credit` no acredita nada al receptor
  (`HotelNights.sol:401`–`:405`).
- **Receptor que rechaza ETH.** No bloquea la reventa: el pago es pull, el importe queda acreditado
  (`test_RejectingRoyaltyReceiverDoesNotBlockResale`,
  `packages/contracts/test/HotelNights.resale.t.sol:475`).
- **Pausa.** `buyResale` lleva `whenNotPaused` (`HotelNights.sol:241`); la vista avisa con
  `ContractPausedBanner` (`ResaleMarketClient.tsx:61`–`:62`).

### 2.3 Efectos on-chain / persistencia

- **Escrituras.** Borrado de `_listings` (`HotelNights.sol:257`), `_soldOnce = true` (`:258`),
  `_pending`/`_totalPending` vía `_credit` (`:259`–`:260` y `:401`–`:405`) y transferencia del NFT
  (`:266`).
- **Nada de ETH sale del contrato en `buyResale`.** El importe se queda en el contrato hasta que
  vendedor y receptor llaman a `claim()` (`HotelNights.sol:277`). `withdraw` solo puede retirar el
  residuo `balance - _totalPending` (`:326`).
- **Eventos.** `Sale` con `SaleType.SECONDARY = 1` (`IHotelNights.sol:28` y `:14`–`:16`) y
  `RoyaltyPaid(tokenId, receiver, amount)` (`IHotelNights.sol:35`).
- **Invariantes.** `Σ _pending == _totalPending` y `balance >= _totalPending`
  (`packages/contracts/test/HotelNights.invariants.t.sol:203` y `:208`).
- **Datos personales.** Solo direcciones de wallet; no hay PII on-chain.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `buyResale(uint256)` payable | `packages/contracts/src/HotelNights.sol:241`; `IHotelNights.sol:139` | Precio exacto del listado |
| `claim()` | `HotelNights.sol:270`; `IHotelNights.sol:142` | Cobro pull del vendedor y del receptor |
| `royaltyInfo(uint256,uint256)` | `HotelNights.sol:449` | ERC-2981; fuente única del reparto |
| `listingOf(uint256)` | `HotelNights.sol:429` | Precio y estado del listado |
| `pendingWithdrawals(address)` | `HotelNights.sol:434`; `IHotelNights.sol:148` | Saldo acreditado pendiente |
| `withdraw()` | `HotelNights.sol:324` | Residuo del hotel; solo `TREASURER_ROLE` |
| `fetchResaleMarket()` | `apps/web/src/lib/nights.ts:226` | Fuente del mercado secundario |
| `useClaim()` | `apps/web/src/components/my-nights/useClaim.ts:24` | Firma `claim()` |
| `/reventa` | `apps/web/src/app/reventa/page.tsx:14` | No es endpoint JSON |

No existe endpoint HTTP de compra secundaria: la firma es cliente → contrato.

### 4.2 Eventos y errores canónicos

- `Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price,
  uint8 saleType)` (`IHotelNights.sol:28`) con `SECONDARY = 1` (`:14`–`:16`).
- `RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount)`
  (`IHotelNights.sol:35`).
- Errores: `NotListed(uint256)` (`IHotelNights.sol:71`), `NightNotResellable(uint256)` (`:77`),
  `NightExpired(uint256)` (`:67`), `IncorrectPayment(uint256,uint256)` (`:70`),
  `DirectTransferDisabled()` (`:78`), `NoFunds()` (`:89`) y `EthTransferFailed()` (`:91`).
- `ReentrancyGuardReentrantCall` y `EnforcedPause` vienen de OpenZeppelin y no se declaran en
  `IHotelNights.sol`.

### 4.3 Estructuras de datos y almacenamiento

- `struct Listing { uint256 price; bool active; }` (`IHotelNights.sol:127`–`:130`).
- Royalty por tipo de habitación, **inmutable**: `ROYALTY_BPS_STANDARD = 500` (5 %, simple y doble)
  y `ROYALTY_BPS_SUITE = 1000` (10 %, suite) (`HotelNights.sol:70`–`:71`), derivados del registro
  dinámico de habitaciones en `_royaltyBpsOf` (`:512`–`:517`). El receptor es siempre `treasury`
  (`:455`).
- Las constantes de UI/pruebas replican el contrato sin gobernarlo
  (`packages/shared/src/constants.ts:40`–`:42`).
- `ResaleMarketClient` recibe `NightView = { tokenId, room, dateYYYYMMDD, type, priceWei,
  saleType }` (`nights.ts:38`–`:45`); los importes viajan como `string` en wei.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Importe ≠ precio listado (07a) | `IncorrectPayment(expected, sent)` | `HotelNights.sol:248` |
| Listado retirado o inexistente (07b) | `NotListed(tokenId)` | `HotelNights.sol:243` |
| Noche expirada (07c) | `NightExpired(tokenId)` | `HotelNights.sol:247` |
| `transferFrom` directo (07d) | `DirectTransferDisabled()` | `HotelNights.sol:484`–`:495` |
| Reentrada de vendedor o receptor (07e) | `ReentrancyGuardReentrantCall()` | `HotelNights.sol:241` |
| Precio no divisible (07f) | `royalty + pago_vendedor == importe` | `HotelNights.sol:254` y `:456` |
| Noche consumida tras listarse | `NightNotResellable(tokenId)` | `HotelNights.sol:246` |
| Vendedor sin saldo pendiente | `NoFunds()` | `HotelNights.sol:272` |
| Receptor que rechaza ETH | No bloquea: queda acreditado | `HotelNights.resale.t.sol:475` |
| Contrato en pausa | `EnforcedPause`; banner en la vista | `HotelNights.sol:241`; `ResaleMarketClient.tsx:61` |
| Mercado sin listados | Vacío con enlace al catálogo | `ResaleMarketClient.tsx:29`–`:52` |
| No se pudo leer ningún listado | Estado degradado (lanza la lectura) | `nights.ts:281`–`:285` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.resale.t.sol:318` — reparto del royalty vía pull;
  `:348` (fuzz del reparto), `:365` (precio no divisible sin wei atrapados), `:383` (importe
  incorrecto), `:393` (sin listado), `:400` (expirada), `:409` (reentrancy), `:419` (`NoFunds`),
  `:425` (receptor hostil), `:464` (transferencia directa sigue bloqueada) y `:475` (receptor que
  rechaza ETH no bloquea la reventa).
- `packages/contracts/test/HotelNights.royalty.t.sol:49`/`:55` (5 % simple y doble), `:61` (10 %
  suite), `:69` (receptor sigue a `treasury`), `:79` (redondeo hacia abajo), `:99` (habitación
  desconocida devuelve 0 sin revertir) y `:135` (reparto exacto en suite).
- `packages/contracts/test/HotelNights.invariants.t.sol:203`, `:208` y `:218` — contabilidad pull.
- MCP: `apps/mcp/src/tools/tools.test.ts:222` — `LISTADA` genera tx `buyResale` con el precio
  on-chain.
- Plan: `docs/PLAN-DE-PRUEBAS.md:115`–`:127` (TC-CT-040…TC-CT-049).
- **No cubierto.** No hay test unitario de `ResaleMarketClient` ni de `ClaimPanel`; el E2E de reventa
  (TC-E2E-023) está en el plan pero no implementado en `apps/web/e2e/`.

## 7. Pendiente de confirmar

- **`royaltyBps()` no existe.** El fuente formula el royalty con `royaltyBps()` y un 10 %
  (`docs/CASOS-DE-USO.md:425`, `:437`–`:444`), pero el contrato no expone ese getter: deriva los bps
  del **tipo de habitación** (5 % simple/doble, 10 % suite) con `_royaltyBpsOf`
  (`HotelNights.sol:512`–`:517`) y los expone por ERC-2981 (`royaltyInfo`, `:449`). Confirmar si el
  fuente debe corregirse o si el manual debe explicar ambos matices.
- **Pago al vendedor: push vs pull.** El fuente dice «envía el resto al vendedor»
  (`docs/CASOS-DE-USO.md:425`), pero el código **acredita** y exige `claim()`
  (`HotelNights.sol:259`–`:260` y `:270`). Confirmar el redactado canónico.
- **Royalty del 10 % por defecto.** El brief fija «royalty por defecto 10 %», que solo aplica a suite;
  simple y doble pagan 5 % (`HotelNights.sol:70`–`:71`). Confirmar cómo contarlo en el manual literal.
- **Cobro del hotel.** El receptor del royalty cobra por el mismo `claim()` (`HotelNights.sol:260`),
  pero la UI solo muestra el saldo del **vendedor conectado** (`useMyNights.ts:192`–`:197`); no hay
  pantalla pública para que el hotel reclame su royalty (la tesorería usa CU-15). Confirmar la ruta.
- **`_price` tras la reventa.** `buyResale` no actualiza `_price[tokenId]`, que sigue siendo el
  precio de la venta primaria (`HotelNights.sol:91` y `:166`); `priceOf` no es el precio vigente de
  una noche revendida. Confirmar si algún consumidor lo asume.
