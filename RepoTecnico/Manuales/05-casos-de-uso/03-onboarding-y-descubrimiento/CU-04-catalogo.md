# CU-04 · Ver y filtrar las noches disponibles — Manual técnico

> Bloque 3 · Onboarding y descubrimiento · Actor: Visitante · Requisitos: RF-02, RF-14, RNF-01, RNF-02, RNF-11, RNF-12, Decisión 23

## 1. Ficha y trazabilidad

- **Objetivo.** Mostrar al visitante las noches que el hotel tiene a la venta dentro de la ventana
  de catálogo, con imagen, fecha, habitación, precio y estado, y dejarle acotar el listado con
  filtros.
- **Actor primario.** Visitante anónimo (público). **Secundario:** el comprador, que entra desde la
  misma parrilla al flujo de compra (CU-05).
- **Requisitos que cubre.** RF-02 (lectura del inventario disponible), RF-14 (filtros y búsqueda),
  RNF-01/RNF-02 (rendimiento y accesibilidad del listado), RNF-11/RNF-12 (estado degradado y
  resiliencia de la fuente) y Decisión 23.
- **Precondición.** Ninguna: la ruta es pública y no exige sesión (`RepoTecnico/Manuales/.../00-BRIEF...`
  y `apps/web/src/lib/public-suite.test.ts:19`).
- **Disparador.** El visitante abre `/catalogo`.
- **Postcondición.** Se ha servido una lista de `NightView` (o el estado degradado/vacío) y el
  visitante puede paginar y filtrar sin nuevas llamadas al servidor.
- **Dónde vive.**
  - Ruta: `apps/web/src/app/catalogo/page.tsx:17` (Server Component, `force-dynamic` en `:9`).
  - Lectura: `apps/web/src/lib/nights.ts:147` (`fetchCatalog`), con `fetchResaleMarket` aparte en
    `:226`.
  - Parrilla y filtros: `apps/web/src/components/CatalogClient.tsx:69` y
    `apps/web/src/components/catalog/FilterBar.tsx:127`.
  - Tarjeta e imagen: `apps/web/src/components/NightCard.tsx:58` y
    `apps/web/src/components/NightImage.tsx:14`.
  - Estado degradado: `apps/web/src/components/DegradedState.tsx:10`.
  - Contrato: `packages/contracts/src/IHotelNights.sol:110` (`priceOf`) y `:127` (`Listing`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. La petición llega a `/catalogo`; el módulo es `force-dynamic`, así que se relee en cada request
   (`apps/web/src/app/catalogo/page.tsx:9`).
2. La página lanza dos lecturas en paralelo y las resuelve por separado con `Promise.allSettled`
   (`catalogo/page.tsx:22`–`:25`): el catálogo y el estado `paused()` del contrato
   (`fetchContractPaused`, `apps/web/src/lib/nights.ts:131`).
3. `fetchCatalog` calcula primero la ventana `[hoy, hoy + CATALOG_WINDOW_DAYS]` con
   `CATALOG_WINDOW_DAYS = 90` (`nights.ts:110`–`:115`, `packages/shared/src/constants.ts:48`).
4. **Fuente primaria off-chain:** `nftsRepo.queryCatalog({ status: "AVAILABLE", limit: 100 })`
   (`nights.ts:152`). Si devuelve filas, se mapean a `NightView`, se filtran por ventana
   (`:178`) y se ordenan por fecha ascendente (`:179`).
5. **Degradación a RPC:** si la base de datos falla, se escanean los eventos `Mint` y `Sale` desde
   `deploymentBlock` hasta la cabeza, paginando de `GETLOGS_MAX_RANGE = 5000` bloques en 5000 y con
   concurrencia acotada a 6 (`nights.ts:87`–`:104` y `:62`).
6. Con los logs, las noches minteadas sin venta y dentro de ventana forman el catálogo
   (`nights.ts:196`–`:213`). El tipo se deriva del maestro con `roomTypeOf` (`:208`).
7. `CatalogClient` recibe `nights` y `paused`; si `nights === null` la página pinta `DegradedState`
   (`catalogo/page.tsx:40`–`:43`).
8. Si una lectura de la BD falla pero el RPC responde, se registra el aviso
   `[fetchCatalog] Fallback a escaneo RPC` y se sigue (`nights.ts:183`).
9. En cliente, `CatalogClient` deriva los meses presentes (`CatalogClient.tsx:85`–`:92`) y los
   umbrales de precio de medio ETH hasta el máximo real (`:97`–`:113`).
10. El filtrado es **local** sobre el array ya recibido (`CatalogClient.tsx:115`–`:128`); cada cambio
    de filtro vuelve a la primera página (`:131`–`:135`).
11. La paginación es «cargar más» de 12 en 12 (`PAGE_SIZE = 12`, `CatalogClient.tsx:17`), con foco
    al primer elemento nuevo (`:174`–`:181`).
12. Cada tarjeta pinta imagen, badge de estado, habitación, tipo, fecha y precio
    (`NightCard.tsx:106`–`:127`) y el CTA de compra (`:140`).

### 2.2 Validaciones

- **Ventana de fechas.** `inWindow(date, today, end)` exige `date >= today && date <= end`
  (`nights.ts:117`–`:118`); se aplica también al camino de base de datos (`:178`) para no ofrecer
  noches que `buy` revertiría con `NightExpired`.
- **Tipo de habitación.** `roomTypeOf` descarta habitaciones fuera del maestro (`nights.ts:208`);
  en el camino de BD se usa `toNightType` con respaldo (`:164`–`:165`).
- **Filtros de UI.** Tipo, mes, precio máximo en wei, rango de fechas y búsqueda por número de
  habitación (`CatalogClient.tsx:21`–`:31` y `:119`–`:126`). `isoToYYYYMMDD` ignora un rango
  incompleto (`:51`–`:56`).
- **Concurrencia RPC.** `RPC_CONCURRENCY = 6` acota las peticiones en vuelo (`nights.ts:62`).
- **Timeout.** El cliente del worker usa `RPC_TIMEOUT_MS = 5000`
  (`packages/shared/src/constants.ts:49`); el catálogo por RPC no tiene timeout propio.

### 2.3 Efectos on-chain / persistencia

- **Solo lectura.** El catálogo no firma ni escribe: llama a `getLogs`, `getBlockNumber` y
  `readContract` (`nights.ts:189`, `:191`–`:194`, `:133`). No hay efectos on-chain.
- **Origen de los datos.** El índice PostgreSQL (`nfts`) es la fuente preferente; el RPC es el
  respaldo (comentario en `nights.ts:34`–`:36`).
- **Pausa del contrato.** `paused()` decide si la tarjeta ofrece compra o muestra «no disponible»
  (`nights.ts:131`–`:139`; `NightCard.tsx:132`–`:141`).
- La caché de cliente es TanStack Query con `staleTime: 30_000` y sin relectura al recuperar foco
  (`apps/web/src/app/providers.tsx:23` y `:29`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `/catalogo` (RSC) | `catalogo/page.tsx:17` | No es endpoint JSON; renderiza el listado |
| `fetchCatalog()` | `nights.ts:147` | BD primero, RPC como respaldo |
| `fetchResaleMarket()` | `nights.ts:226` | Mercado secundario, **otra vista** (D-07) |
| `fetchContractPaused()` | `nights.ts:131` | Lee `paused()` del contrato |
| `priceOf(uint256)` | `IHotelNights.sol:110` | Precio primario leído por la tarjeta/revisión |
| `listingOf(uint256)` | `IHotelNights.sol:145` | Estado autoritativo de la reventa |
| `queryCatalog(...)` | `nights.ts:152` | Índice off-chain (`NFTsRepository`) |
| `GET /api/public/rooms` | `apps/web/src/app/api/public/rooms/route.ts` | Otra fuente de datos de habitaciones, no la usa el catálogo |

### 4.2 Eventos y errores canónicos

- Eventos parseados para reconstruir el catálogo: `Mint` (`nights.ts:47`), `Sale` (`:50`) y
  `Listed` (`:53`); declarados en `packages/contracts/src/IHotelNights.sol:21`, `:28` y `:36`.
- No hay errores de dominio propios: si la fuente falla, la página no propaga el error al cliente,
  muestra `DegradedState` (`catalogo/page.tsx:26` y `:41`).
- `fetchResaleMarket` sí lanza si ningún listado se pudo leer, para no mentir con una lista vacía
  (`nights.ts:281`–`:285`).

### 4.3 Estructuras de datos y almacenamiento

- `NightView = { tokenId, room, dateYYYYMMDD, type, priceWei, saleType }`
  (`nights.ts:38`–`:45`). `priceWei` viaja como `string` para no perder precisión.
- `tokenId = room · 10^8 + AAAAMMDD`; se decodifica con `decodeTokenId` (`nights.ts:261`).
- La ventana se compara como entero `AAAAMMDD` derivado en UTC (`nights.ts:106`–`:108`).
- No se persiste nada desde la vista: el catálogo es de solo lectura.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| El RPC/índice no responden | `data-testid="degraded-state"` + `data-testid="retry"` | `catalogo/page.tsx:26`; `DegradedState.tsx:21` y `:33` |
| El reintento | `router.refresh()` recarga el Server Component | `DegradedState.tsx:34` |
| No hay noches que mostrar | `data-testid="empty-state"` | `CatalogClient.tsx:212`–`:241` |
| Sin resultados por filtros | Vacío con botón «Quitar filtros» | `CatalogClient.tsx:221`–`:233` |
| Catálogo realmente vacío | Vacío sin botón de quitar filtros | `CatalogClient.tsx:237`–`:239` |
| Imagen no resoluble | `data-testid="img-fallback"`, sin bloquear la compra | `NightImage.tsx:25`–`:36` |
| Noche de reventa | Badge de reventa en la tarjeta | `NightCard.tsx:28`–`:34` |
| Habitación suite | Badge dorado de suite | `NightCard.tsx:35`–`:41` |
| Contrato en pausa | `data-testid="night-paused"` en vez del CTA | `NightCard.tsx:132`–`:141` |
| Contrato en pausa (aviso general) | Banner de pausa | `CatalogClient.tsx:208`–`:210` |
| Filtro con fecha incompleta | Se ignora el límite, no rompe | `CatalogClient.tsx:51`–`:56` |

## 6. Pruebas y evidencia

- `apps/web/e2e/home.spec.ts:10` — acepta como arranque válido `degraded-state`, `empty-state` o
  tarjetas `night-*`.
- `apps/web/e2e/a11y.spec.ts:29` — `/catalogo` entra en el barrido de accesibilidad.
- `apps/web/scripts/measure-perf.mjs:79` — el medidor espera `catalog-grid`, `empty-state`,
  `degraded-state` o `night-card-*`, las marcas del presupuesto RNF-01/RNF-11.
- **No cubierto:** no hay test unitario de `fetchCatalog`, ni de `CatalogClient` (filtros,
  paginación, estados vacío/degradado), ni un E2E que compruebe los `data-testid` de imagen o
  paginación. Los requisitos de rendimiento (`RENDER_TARGET_MS = 1000`, `LCP_TARGET_MS = 2500`,
  `constants.ts:50`–`:51`) solo se miden con el script manual, no en CI.

## 7. Pendiente de confirmar

- **Reventa dentro del catálogo.** El fuente dice que el catálogo lee `DISPONIBLE` «y, si aplica,
  `LISTADA_SECUNDARIO`» (`docs/CASOS-DE-USO.md:264`), pero la Decisión 07 del código separa ambos
  flujos: `fetchCatalog` devuelve solo primaria (`nights.ts:147`) y la reventa vive en
  `fetchResaleMarket` (`nights.ts:226`) con su propia vista. Confirmar si el manual de CU-04 debe
  incluir la reventa o remitir a CU-06/CU-07.
- **Imagen por IPFS.** El fuente pide «imagen del tipo (IPFS)» (`docs/CASOS-DE-USO.md:265`). La
  tarjeta sirve un SVG local, `/images/${type}.svg` (`NightImage.tsx:40`), y la metadata de
  `/api/nfts/[tokenId]/metadata` usa una URL fija ajena a los CIDs
  (`apps/web/src/app/api/nfts/[tokenId]/metadata/route.ts:39`), aunque los CIDs reales existen en
  `packages/shared/src/domain/ipfs.ts:21`. Confirmar cuál es la fuente de imagen canónica del
  catálogo.
- **Timeout del catálogo.** `RPC_TIMEOUT_MS` se aplica al cliente del worker
  (`apps/web/src/lib/worker-api.ts:16`), no al escaneo de `fetchCatalog`. Confirmar el valor que
  debe regir el 04a.
- **Subtítulo «LISTADA_SECUNDARIO»/estado de la noche.** El fuente describe el estado como
  `DISPONIBLE`/`LISTADA_SECUNDARIO`; la tarjeta solo distingue reventa, suite y disponible
  (`NightCard.tsx:27`–`:48`). Confirmar el vocabulario visible.
- **Búsqueda por habitación.** RF-14 incluye búsqueda por número (`CatalogClient.tsx:125`), no
  mencionada en el flujo del fuente: confirmar que pertenece a este CU.
