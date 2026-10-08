# Ver el histórico público de ventas

> Cualquier visitante, sin cartera y sin sesión, abre `/historico` y ve la lista completa de ventas de noches registradas en la cadena, de la más reciente a la más antigua, con su precio y las carteras que intervinieron.

## Qué hace el sistema

El histórico es el **libro público de ventas** del hotel. Cada fila es una venta: qué noche, cuándo se vendió, por cuánto y entre qué dos carteras (`apps/web/src/components/history/HistoryTable.tsx:36`). La página `/historico` es pública: no pide cartera ni sesión (`apps/web/src/app/historico/page.tsx:19`).

Los datos **no** se leen de la cadena en cada visita. La web pide el histórico al **worker**, que precomputa y guarda las ventas (`apps/web/src/lib/worker-api.ts:8`, `:12`, `:33`). El worker los sirve por la ruta `GET /history` (`apps/worker/src/http-server.ts:41`, `:78`). Se eligió una **fuente única** para que la tabla de `/historico` y el CSV descargado no puedan discrepar: hasta M7 la página prefería la tabla propia `sale_events` y el CSV podía traer una ventana distinta (`apps/web/src/app/historico/page.tsx:10`; `apps/web/src/app/api/sales/history/route.ts:9`).

El orden es un **orden total** y siempre el mismo: primero por número de bloque descendente y, si dos ventas caen en el mismo bloque, por su posición dentro del bloque descendente (`packages/shared/src/domain/aggregates.ts:138`, `:141`). El worker aplica ese criterio al servir la lista (`apps/worker/src/aggregate-processor.ts:139`, `:142`).

La lista **no lleva datos personales**. Solo direcciones de cartera, que son seudónimos, más habitación, fecha, tipo, precio y transacción (`packages/shared/src/domain/aggregates.ts:104`; `apps/web/src/components/history/HistoryTable.tsx:36`).

Se puede **exportar todo el histórico a CSV** desde el botón **Exportar CSV**, que apunta al mismo origen (`apps/web/src/app/historico/page.tsx:38`). El CSV no aplica la paginación de la API: vuelca el histórico entero (`apps/web/src/app/api/sales/history/route.ts:35`, `:53`).

## Recorrido real

1. El visitante abre `/historico`. La página se genera en cada visita, sin copia guardada (`apps/web/src/app/historico/page.tsx:8`).
2. La página pide el histórico al worker con `fetchHistory()`, que llama a `/history` con tiempo máximo de espera y sin caché (`apps/web/src/app/historico/page.tsx:24`; `apps/web/src/lib/worker-api.ts:33`, `:16`, `:19`).
3. Si el worker responde, se pinta la tabla de ventas (`apps/web/src/app/historico/page.tsx:63`).
4. La **primera fila es la venta más reciente**, porque el orden es descendente por bloque y posición (`packages/shared/src/domain/aggregates.ts:141`).
5. En pantalla grande se ve una tabla con estas columnas: Habitación, Noche, Tipo, Precio, Venta, Vendedor, Comprador y Transacción (`apps/web/src/components/history/HistoryTable.tsx:92`).
6. En el móvil, la tabla se convierte en **tarjetas apiladas** con pares etiqueta/valor para no forzar una tabla de ocho columnas (`apps/web/src/components/history/HistoryTable.tsx:51`, `:53`).
7. La columna **Venta** dice **Primaria** (venta del hotel) o **Reventa** (venta entre clientes) (`apps/web/src/components/history/HistoryTable.tsx:72`; `apps/web/messages/es.json:402`).
8. Las carteras se muestran acortadas, del estilo `0x1234…abcd`, y el identificador completo queda en el `title` al pasar el cursor (`apps/web/src/components/history/HistoryTable.tsx:6`, `:74`, `:76`).
9. El **Precio** se muestra en ETH, con el valor de la cadena convertido (`apps/web/src/components/history/HistoryTable.tsx:64`; `apps/web/src/lib/format.ts:8`).
10. La **fecha de la noche** se muestra como `DD/MM/AAAA` (`apps/web/src/components/history/HistoryTable.tsx:68`; `apps/web/src/lib/format.ts:12`).
11. Si la red tiene explorador configurado, el identificador de la transacción es un **enlace** que abre el explorador en otra pestaña (`apps/web/src/components/history/HistoryTable.tsx:14`, `:16`). Si no lo tiene, queda como texto con el hash completo en el `title` (`apps/web/src/components/history/HistoryTable.tsx:29`).
12. Si el visitante pulsa **Exportar CSV**, se descarga un fichero `sales_history_<marca>.csv` (`apps/web/src/app/historico/page.tsx:38`; `apps/web/src/app/api/sales/history/route.ts:77`).
13. El CSV trae 12 columnas: Token ID, Habitación, Fecha de la noche, Tipo, Precio (ETH), Precio (Wei), Tipo de venta, Vendedor, Comprador, Bloque, Marca temporal del bloque y Tx Hash (`apps/web/src/app/api/sales/history/route.ts:39`).
14. Si el CSV no se puede generar porque el worker no responde, la API contesta `503` con `DATA_UNAVAILABLE` (`apps/web/src/app/api/sales/history/route.ts:25`, `:26`).

## Piezas de código implicadas

- Página pública del histórico: `apps/web/src/app/historico/page.tsx:8`, `:19`, `:24`, `:38`, `:61`, `:63`.
- Tabla y tarjetas móviles: `apps/web/src/components/history/HistoryTable.tsx:6`, `:13`, `:37`, `:41`, `:51`, `:53`, `:64`, `:68`, `:72`, `:87`, `:92`, `:104`.
- Enlace al explorador (o texto si no hay): `apps/web/src/components/history/HistoryTable.tsx:14`, `:29`; `apps/web/src/config/chain.ts:83`.
- Cliente del worker: `apps/web/src/lib/worker-api.ts:8`, `:12`, `:33`.
- Ruta del worker que sirve el histórico: `apps/worker/src/http-server.ts:11`, `:41`, `:78`.
- Orden y mapeo del histórico en el worker: `apps/worker/src/aggregate-processor.ts:139`, `:142`, `:185`.
- Consulta a la base de datos: `apps/worker/src/aggregate-store.ts:101`, `:106`.
- Endpoint del CSV y su paginación: `apps/web/src/app/api/sales/history/route.ts:20`, `:23`, `:32`, `:38`, `:39`, `:53`, `:64`, `:77`.
- Tipo de una venta del histórico: `packages/shared/src/domain/aggregates.ts:105`, `:122`.
- Criterio de orden compartido: `packages/shared/src/domain/aggregates.ts:138`, `:141`.
- Formato de precio y fecha: `apps/web/src/lib/format.ts:8`, `:12`, `:73`.
- Estado degradado con botón **Reintentar**: `apps/web/src/components/DegradedState.tsx:10`, `:31`, `:34`.
- Textos de la pantalla: `apps/web/messages/es.json:388`, `:389`, `:390`, `:391`, `:402`.

## Datos y estados

- **Campos de una venta.** `tokenId`, `room` (habitación), `dateYYYYMMDD` (fecha de la noche), `roomType`, `priceWei`, `saleType`, `seller`, `buyer`, `blockNumber`, `logIndex`, `txHash` y `blockTimestamp` (`packages/shared/src/domain/aggregates.ts:105`).
- **Tipo de venta.** `PRIMARY` (venta del hotel) y `SECONDARY` (reventa entre clientes) (`packages/shared/src/domain/types.ts:7`). En pantalla: **Primaria** y **Reventa** (`apps/web/messages/es.json:402`, `:403`).
- **Precio.** Se guarda en wei y se muestra en ETH (`apps/web/src/lib/format.ts:8`). En el CSV van las **dos** columnas: `Precio (ETH)` y `Precio (Wei)` (`apps/web/src/app/api/sales/history/route.ts:44`, `:45`).
- **Marca temporal.** La del bloque, en segundos UNIX UTC. Puede faltar si la fila es anterior a la migración de M7, y entonces en el CSV sale vacía (`packages/shared/src/domain/aggregates.ts:117`; `apps/web/src/app/api/sales/history/route.ts:64`).
- **Tipos de habitación.** Se etiquetan como `Simple`, `Doble` o `Suite` (`apps/web/src/lib/format.ts:73`; `apps/web/src/components/history/HistoryTable.tsx:39`).
- **Orden.** Descendente por `blockNumber`; en empate, descendente por `logIndex` (`packages/shared/src/domain/aggregates.ts:141`).
- **Clave de cada fila en pantalla.** `txHash` + `logIndex`, la misma pareja que identifica una venta en la base (`apps/web/src/components/history/HistoryTable.tsx:56`, `:104`).
- **Paginación de la API JSON.** Sin parámetros, `limit = 20` y `offset = 0`; la respuesta lleva `items`, `total`, `limit` y `offset` (`apps/web/src/app/api/sales/history/route.ts:32`, `:33`, `:82`). El CSV, en cambio, ignora esos límites y exporta todo (`apps/web/src/app/api/sales/history/route.ts:53`).
- **Estado de la página.** `dynamic = "force-dynamic"`: se lee en cada visita, sin caché (`apps/web/src/app/historico/page.tsx:8`).

## Casos límite y errores

- **El worker no responde.** La página muestra el estado degradado con el mensaje «No se pudo cargar el histórico. Inténtalo de nuevo.» y un botón **Reintentar** (`apps/web/src/app/historico/page.tsx:24`, `:61`; `apps/web/messages/es.json:391`). El botón vuelve a pedir la página (`apps/web/src/components/DegradedState.tsx:34`).
- **Todavía no hay ventas.** En vez de una tabla vacía se muestra «Todavía no se ha registrado ninguna venta.» (`apps/web/src/components/history/HistoryTable.tsx:41`, `:43`; `apps/web/messages/es.json:390`).
- **La red no tiene explorador.** Anvil y la Besu privada no lo tienen: el identificador de la transacción deja de ser enlace y pasa a ser texto con el hash en el `title` (`apps/web/src/components/history/HistoryTable.tsx:15`, `:29`; `apps/web/src/config/chain.ts:53`).
- **Una fila no tiene fecha de bloque.** Es un dato irrecuperable: en pantalla no se muestra y en el CSV sale la celda vacía, sin inventar fecha (`apps/web/src/app/api/sales/history/route.ts:64`; `packages/shared/src/domain/aggregates.ts:117`).
- **El CSV no se puede generar.** La API responde `503` con `DATA_UNAVAILABLE` y el mensaje «El histórico del worker no está disponible.» (`apps/web/src/app/api/sales/history/route.ts:25`, `:26`).
- **Precios de una red de pruebas.** Todo esto corre hoy en una red de pruebas: las cifras no tienen valor real (`docs/manual-comprador.md:257`).
- **El CSV y la tabla no pueden discrepar.** Ambos leen del worker, la misma fuente (`apps/web/src/app/historico/page.tsx:10`; `apps/web/src/app/api/sales/history/route.ts:12`).
- **Descarga bloqueada por el navegador.** El enlace lleva el atributo `download`; si el navegador bloquea la descarga, no hay respuesta del sistema (`apps/web/src/app/historico/page.tsx:39`).

## Referencias

- **CU-09** · Mirar el histórico público de ventas (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-09-historico.md:1`).
- **ADR-09** · El bloque de despliegue es la fuente única del escaneo (`docs/adr/ADR-09-bloque-despliegue-fuente-unica.md:1`).
- **ADR-25** · El dashboard lee una fuente única: la misma regla que comparte el histórico (`docs/adr/ADR-25-dashboard-fuente-unica.md:1`).
- Decisión **D-16** · Cifras del dashboard y del histórico cuadradas al leer del worker (`apps/web/src/app/historico/page.tsx:10`).
- **SRS** §7, rutas de la suite pública, que incluye `/historico` (`docs/SRS.md:310`).
- Guía del comprador, apartado 9: qué queda público en la cadena (`docs/manual-comprador.md:243`).
