# Qué es una noche tokenizada

> El huésped entiende que compra una ficha digital única (un token) de una habitación concreta para una fecha concreta, y que quien tiene esa ficha tiene esa noche.

## Qué hace el sistema

El sistema convierte cada noche de cada habitación en una ficha digital única. Esa ficha es un *token* ERC-721: una colección de fichas no fungibles, donde cada una es distinta de las demás. La colección se llama «Hotel Marina del Sol Nights» y su símbolo es `HMSN` (`packages/contracts/src/HotelNights.sol:117`). El contrato que las emite y las mueve es `HotelNights` (`packages/contracts/src/HotelNights.sol:48`).

Una ficha equivale a **una habitación y una fecha**. El identificador se construye con una fórmula fija: `tokenId = habitación · 10^8 + AAAAMMDD`. Por ejemplo, la habitación 102 para la noche del 15 de junio de 2026 da `10220260615` (`packages/shared/src/domain/token-id.ts:4`, `:11`). La fórmula se aplica al crear la ficha (`packages/shared/src/domain/token-id.ts:63`) y se deshace para leer habitación y fecha (`packages/shared/src/domain/token-id.ts:77`).

El hotel tiene 50 habitaciones: de la 101 a la 130 en la planta baja y de la 201 a la 220 en la primera planta (`packages/shared/src/domain/room-master.ts:13`). Hay tres tipos de habitación: **simple, doble y suite** (`packages/shared/src/domain/types.ts:4`). Los tipos se derivan de un maestro de habitaciones, que asigna un rango de números a cada tipo (`packages/shared/src/domain/room-master.ts:22`).

<!-- PENDIENTE DEL CLIENTE: confirmar el reparto real de tipos por habitación (el código asigna hoy 101-115 a simple, 116-130 a doble y 201-220 a suite, y lo marca como propuesta en packages/shared/src/domain/room-master.ts:7) -->

Cada noche tiene un estado a lo largo de su vida. Los estados posibles son `DISPONIBLE`, `EN_PODER_CLIENTE`, `LISTADA_SECUNDARIO`, `EXPIRADA` y `QUEMADA` (`packages/shared/src/domain/types.ts:10`). El estado se deriva de señales de la cadena: si no existe, no hay nada; si está expirada, manda `EXPIRADA`; si tiene un listado de reventa activo, `LISTADA_SECUNDARIO`; si ya se vendió una vez, `EN_PODER_CLIENTE`; y si no, `DISPONIBLE` (`packages/shared/src/domain/night-state.ts:16`). Solo son comprables las noches `DISPONIBLE` (venta del hotel) y `LISTADA_SECUNDARIO` (reventa) (`packages/shared/src/domain/night-state.ts:25`).

La propiedad se demuestra con el dueño de la ficha: quien aparece como dueño en la cadena tiene la noche. Por eso la compra transfiere la ficha a la cartera del comprador.

Las fechas se manejan en UTC, la hora del meridiano de Greenwich, para que la codificación de la ficha no dependa de la zona horaria del visitante (`docs/adr/ADR-08-fechas-utc-y-calendario.md:1`).

## Recorrido real

1. El huésped abre `/catalogo`. Allí ve una tarjeta por noche: foto, `Habitación N`, tipo, la fecha en formato largo, el precio en ETH y la nota «La noche pasa a ser tuya: podrás revenderla cuando quieras.» (`apps/web/src/components/NightCard.tsx:112`, `:119`, `:123`, `:130`; `apps/web/messages/es.json:213`).
2. Cada tarjeta lleva una etiqueta de estado: `Disponible` (con un punto verde), `Suite` (etiqueta ámbar para las suites) o `Reventa` (etiqueta coral para las noches de otro cliente) (`apps/web/src/components/NightCard.tsx:27`).
3. El catálogo solo enseña noches `DISPONIBLE` de los próximos 90 días (`apps/web/src/lib/nights.ts:289`; `packages/shared/src/constants.ts:48`). Las noches de reventa tienen su propia pantalla, `/reventa`.
4. Si el huésped quiere el concepto por escrito, `/ayuda` reúne los manuales que se generan desde `docs/` (`apps/web/src/app/ayuda/page.tsx:4`).
5. Después de comprar, la ficha aparece en `/mis-noches` con la etiqueta `Tuya` o `En reventa` (`apps/web/src/components/my-nights/MyNightCard.tsx:112`).
6. Desde esa misma tarjeta puede emitir el resguardo de check-in con su código QR (`apps/web/src/components/my-nights/TicketView.tsx:21`).

## Piezas de código implicadas

- Fórmula e identificador de la ficha: `packages/shared/src/domain/token-id.ts:11`, `:63`, `:77`.
- Maestro de habitaciones y tipos: `packages/shared/src/domain/room-master.ts:13`, `:22`, `:37`.
- Tipos y estados del dominio: `packages/shared/src/domain/types.ts:4`, `:7`, `:10`, `:24`.
- Máquina de estados de la noche: `packages/shared/src/domain/night-state.ts:16`, `:25`.
- Contrato canónico y colección ERC-721: `packages/contracts/src/HotelNights.sol:48`, `:117`.
- Compra primaria y transferencia de la ficha: `packages/contracts/src/HotelNights.sol:156`.
- Compra de reventa: `packages/contracts/src/HotelNights.sol:241`.
- Royalty por tipo de habitación: `packages/contracts/src/HotelNights.sol:449`, `:512`; `packages/shared/src/constants.ts:40`.
- Ventana de catálogo de 90 días: `packages/shared/src/constants.ts:48`; `apps/web/src/lib/nights.ts:121`.
- Tarjeta de noche (lo que ve el huésped): `apps/web/src/components/NightCard.tsx:27`, `:112`, `:130`.
- Metadatos ERC-721 de una noche: `apps/web/src/app/api/nfts/[tokenId]/metadata/route.ts:36`.

## Datos y estados

- **Identificador.** `tokenId = habitación · 10^8 + AAAAMMDD`. Ejemplo del propio código: habitación 102, noche 2026-06-15 → `10220260615` (`packages/shared/src/domain/token-id.ts:4`).
- **Tipo de habitación** (`NightType`): `simple`, `doble`, `suite` (`packages/shared/src/domain/types.ts:4`). En pantalla se ven como `Simple`, `Doble` y `Suite` (`apps/web/src/components/NightCard.tsx:116`).
- **Tipo de venta** (`SaleType`): `PRIMARY` (venta del hotel) y `SECONDARY` (reventa entre clientes) (`packages/shared/src/domain/types.ts:7`).
- **Estados de la noche:** `DISPONIBLE`, `EN_PODER_CLIENTE`, `LISTADA_SECUNDARIO`, `EXPIRADA`, `QUEMADA` (`packages/shared/src/domain/types.ts:10`).
- **Atributos de la ficha:** habitación, fecha `AAAAMMDD` y tipo de habitación (`packages/shared/src/domain/types.ts:24`).
- **Ventana de venta:** desde hoy hasta 90 días después, en UTC (`packages/shared/src/constants.ts:48`).
- **Royalty de reventa:** 5 % en simple y doble, 10 % en suite. Es inmutable y se deriva del tipo de habitación (`packages/shared/src/constants.ts:40`; `docs/adr/ADR-18-royalty-por-tipo-inmutable.md:1`).
- **Precio:** se muestra en ETH. En la compra primaria, el importe va entero a la tesorería del hotel, sin comisión (`packages/contracts/src/HotelNights.sol:181`).

## Casos límite y errores

- **Habitación fuera del maestro.** Si el número no pertenece a 101-130 ni a 201-220, no hay tipo y la noche se descarta antes de ofrecerse (`apps/web/src/lib/nights.ts:371`).
- **Fecha fuera de rango.** El identificador exige una fecha `AAAAMMDD` válida de 8 dígitos, mes 1-12 y día 1-31 (`packages/shared/src/domain/token-id.ts:40`). El contrato devuelve `InvalidDate` o `PastDate` si no cuadra (`packages/contracts/src/IHotelNights.sol:65`, `:66`).
- **Noche expirada.** El contrato devuelve `NightExpired(tokenId)` y no deja comprarla (`packages/contracts/src/IHotelNights.sol:67`).
- **Noche ya vendida.** El contrato devuelve `NightNotAvailable(tokenId)` si ya tuvo venta primaria (`packages/contracts/src/IHotelNights.sol:68`). Solo hay una venta primaria por noche (`docs/adr/ADR-16-venta-primaria-unica.md:1`).
- **Noche quemada.** Las noches del hotel que caducan sin venderse se retiran; una noche ya vendida a un cliente no se quema: el contrato devuelve `AlreadySold(tokenId)` (`packages/contracts/src/HotelNights.sol:294`; `packages/contracts/src/IHotelNights.sol:87`).
- **Red de pruebas.** Todo funciona hoy sobre una red de pruebas: no es todavía una red de venta al público (`docs/manual-comprador.md:257`).
- **Reparto de tipos.** El propio código marca el reparto habitación→tipo como propuesta a confirmar con el hotel (`packages/shared/src/domain/room-master.ts:7`); ver el marcador de este documento.

## Referencias

- CU-04 · Ver y filtrar las noches disponibles (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-04-catalogo.md:1`).
- CU-05 · Comprar una noche al hotel (`docs/Manuales/05-casos-de-uso/04-ventas/CU-05-compra-primaria.md:1`).
- CU-17 · Conectar la cartera y ponerse en la red correcta (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md:1`).
- Guía del comprador, apartado 1 (`docs/manual-comprador.md:12`).
- ADR-01 · Red canónica local y contrato único (`docs/adr/ADR-01-red-y-contrato-canonicos.md:1`).
- ADR-02 · Contrato único `HotelNights` (`docs/adr/ADR-02-contrato-unico-hotel-nights.md:1`).
- ADR-05 · Check-in anclado on-chain y resguardo de un solo uso (`docs/adr/ADR-05-check-in-on-chain.md:1`).
- ADR-08 · Fechas `AAAAMMDD` en UTC y caducidad por umbral (`docs/adr/ADR-08-fechas-utc-y-calendario.md:1`).
- ADR-16 · Una sola venta primaria por noche (`docs/adr/ADR-16-venta-primaria-unica.md:1`).
- ADR-18 · Royalty por tipo de habitación, inmutable (`docs/adr/ADR-18-royalty-por-tipo-inmutable.md:1`).
- SRS §3 (contrato `HotelNights`) y §9 (catálogo de casos de uso) (`docs/SRS.md:111`, `:342`).
- Tipos de dominio y RF-18a (`packages/shared/src/domain/types.ts:1`).
