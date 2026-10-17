# ADR-28 · Subastas on-chain con *pull payments* y liquidación en `HotelNights`

- **Estado**: vigente · **Fecha**: 2026-10-15 · **Decisiones de origen**: RF-13 · B4, B5, B6 (ciclo C2)
- **Trazabilidad**: `NightAuction.sol`, `INightAuction.sol`, `HotelNights.sol` (`AUCTION_ROLE`,
  `settleAuction`), `script/DeployAuction.s.sol`, `packages/shared/src/domain/auction.ts`,
  `docs/SRS.md` §9 (CU-48/CU-49), `apps/web/src/app/subastas`

## Contexto

RF-13 pide **subastas para habitaciones premium**. El pliego no concreta la mecánica y el borrador de
C2 (§2 de `propuesta_cumplimiento_4_puntos.md`) propuso un contrato nuevo `NightAuction.sol` que
custodiase las pujas y cerrase la venta con un `transferFrom` del NFT (previa aprobación del hotel),
sin tocar `HotelNights`.

Al contrastarlo con el contrato canónico apareció un problema de fondo: `HotelNights` guarda la venta
primaria en `_soldOnce`, y **de ahí dependen tres invariantes**:

| Consumidor | Exigencia |
|---|---|
| `list()` (reventa) | `_soldOnce[tokenId]` o revierte `NightNotResellable` |
| `markCheckedIn()` (recepción) | `_soldOnce[tokenId]` o revierte `NightNotSold` |
| `burnExpired()` | se **niega** a quemar noches con `_soldOnce` (ya no son inventario del hotel) |

Una transferencia ERC-721 «pelada» desde la subasta deja la noche con `_soldOnce == false`: el
ganador **no podría revender ni hacer check-in**, y su noche seguiría siendo quemable como inventario
del hotel. El borrador, por tanto, no era implementable tal cual sin romper el modelo de venta.

## Decisión

1. **Contrato propio** `NightAuction.sol` (sin proxy, inmutable como el de noches) con la mecánica
   aprobada: subasta **inglesa** con precio de reserva, incremento mínimo (5 % con suelo 0,001) y
   **anti-sniping** (una puja en los últimos 5 minutos desplaza el cierre a *puja + 5 min*), duración
   entre 1 hora y 14 días.
2. **Solo venta primaria del hotel** (B4): `createAuction` exige que la noche sea **inventario del
   hotel** (`ownerOf(tokenId) == treasury()`), futura, no vendida y sin check-in. La reventa por
   subasta queda fuera de alcance, y el contrato no se acopla a ella.
3. **Sin escrow y sin aprobaciones**: el NFT permanece en el hotel hasta la liquidación. No hay
   `approve`/`setApprovalForAll` de por medio (menos superficie de ataque que el borrador).
4. **Pull payments** (B5): las pujas se custodian en el contrato; la **puja superada** queda
   pendiente de retirada por su dueño y el **importe del hotel** se acredita a su favor en la
   liquidación. Nadie recibe ETH por *push*; `withdraw()` funciona **incluso en pausa** (los fondos
   son de sus dueños y no dependen del estado del contrato).
5. **Gancho de liquidación en `HotelNights`**: nuevo rol `AUCTION_ROLE` (concedido **al contrato**,
   nunca a una wallet) y `settleAuction(tokenId, winner, priceWei)`, que completa la **venta
   primaria**: valida (dueño, no vendida, sin check-in, no caducada), marca `_soldOnce`, limpia el
   listado, emite `Sale(PRIMARY)` con el importe real de la subasta y entrega la noche con
   `_transfer` — **no** `_safeTransfer`: un ganador con `onERC721Received` revirtiente no puede
   bloquear la liquidación (a diferencia de `buy`, donde el comprador se elige a sí mismo).
   El importe **no** entra por ahí: lo custodia la subasta y llega al hotel por `withdraw()`.
6. **Pausa compartida**: `PAUSER_ROLE` tiene el mismo `keccak` en ambos contratos, así que la misma
   wallet pausa la plataforma entera. En pausa no se crea, ni se puja, ni se liquida; sí se retira.
7. **Solo on-chain** (B6): **sin tablas nuevas**. La vista `/subastas` enumera las subastas escaneando
   `AuctionCreated` desde el bloque de despliegue y leyendo `auctionOf`; no hay indexador ni caché
   intermedia. `diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` **no se tocan**.

## Consecuencias

- **Redeploy del contrato de noches** en la ventana acordada (ADR-22): `HotelNights` cambia (rol +
  gancho) y hay que desplegar también `NightAuction` y concederle `AUCTION_ROLE`. Es el precio de
  mantener la venta primaria con **una única fuente de verdad** en el contrato de noches.
- El **worker indexa la venta de la subasta como una primaria más** (evento `Sale` con
  `SaleType.PRIMARY`), así que el histórico, los agregados y la ocupación siguen cuadrando sin tocar
  el indexador.
- Quien subasta una noche **no puede cancelar con pujas** salvo que la noche haya caducado (entonces
  devuelve la puja al mejor pujante). Con pujas vivas, cancelar sería una vía para quedarse el
  inventario después de haber recibido ofertas.
- El ganador recibe la noche sin `_safeTransfer`: si es un contrato que no sabe recibir ERC-721,
  la noche queda igualmente a su nombre (puede transferirla después). Se documenta aquí porque es
  una diferencia deliberada con `buy`.
- La vista pública depende de `NEXT_PUBLIC_AUCTION_ADDRESS`: si no está configurada, `/subastas` lo
  dice explícitamente en lugar de apuntar a otro contrato (D-07).

## Alternativas descartadas

- **`transferFrom` desde la subasta** (borrador §2.1): rompe `_soldOnce` ⇒ ganador sin reventa ni
  check-in y noche quemable. Descartada tras el análisis de invariantes.
- **Extender `HotelNights` con la subasta completa**: mezcla dos ciclos de vida en un contrato
  inmutable y agranda la superficie de un contrato que ya está en producción.
- **Escrow del NFT en la subasta**: añade una transferencia más y deja la noche fuera del hotel si la
  subasta se abandona; el gancho hace innecesario mover el NFT antes de venderlo.
- **Subasta holandesa o de sobre cerrado**: la inglesa con anti-sniping es la mecánica aprobada (B5).

## Deuda declarada (ventana de C2 en Besu, 2026-10-17)

Al activar la primera subasta real en Besu se comprobó que `HotelNights.buy()` **sigue** permitiendo
comprar en primaria una noche que está en subasta: el contrato de noches no conoce el estado de la
subasta (por diseño, para no acoplarlos). Consecuencia: un comprador directo podría dejar la noche
vendida y la liquidación revertiría con `NightNotAvailable`; los pujantes recuperarían su importe por
*pull payment*, pero el ganador perdería la subasta.

**Mitigación aplicada**: el **catálogo de la web excluye** las noches con subasta viva
(`fetchCatalog` → `excludeAuctionedNights`), de modo que la vía normal de compra no las ofrece y la
noche en subasta se muestra únicamente en `/subastas`.

**Pendiente para la próxima ventana de contrato** (no bloquea la demo): bloquear `buy` **on-chain**
para noches en subasta —p. ej. un flag `_auctioned[tokenId]` que fije `AUCTION_ROLE` al abrir y
libere al cerrar—, o escrowar la noche en la subasta. Se prefiere el flag: mantiene la custodia en el
hotel y no mueve el NFT antes de venderlo.
