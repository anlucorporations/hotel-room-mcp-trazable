# Ver las noches disponibles y filtrar

> El huésped mira el catálogo público de noches a la venta y lo acota con filtros hasta encontrar la que le encaja.

## Qué hace el sistema

El catálogo vive en `/catalogo` y es una página pública: no pide sesión ni cartera (`apps/web/src/app/catalogo/page.tsx:17`). Es dinámica, así que relee el inventario en cada visita en lugar de servir una copia vieja (`apps/web/src/app/catalogo/page.tsx:9`).

La página lanza dos lecturas en paralelo y las resuelve por separado: la lista de noches y el estado de pausa del contrato (`apps/web/src/app/catalogo/page.tsx:22`). Resolverlas por separado evita que un fallo al comprobar la pausa tumbe el catálogo entero (`apps/web/src/app/catalogo/page.tsx:19`).

La lectura del catálogo se hace primero contra la base de datos indexada, con estado `AVAILABLE` y un límite de 100 noches; si esa fuente no responde, el sistema degrada a una lectura directa de la cadena por eventos (`apps/web/src/lib/nights.ts:289`, `:294`, `:349`). En ambos caminos se aplica la misma ventana de fechas: desde hoy hasta 90 días después, en UTC (`apps/web/src/lib/nights.ts:121`; `packages/shared/src/constants.ts:48`).

Antes de enseñar una noche, el sistema comprueba que el contrato no la haya dado ya por vendida. Si el índice va desfasado y ofrece una noche que la cadena vendió, se retira del listado y se cuenta aparte (`apps/web/src/lib/nights.ts:194`, `:341`). Ese contador sirve para avisar con honestidad de que se ha ocultado inventario (`apps/web/src/app/catalogo/page.tsx:28`).

Los filtros se aplican **en el navegador**, sobre la lista ya recibida: no vuelven a preguntar al servidor, así que responden al instante (`apps/web/src/components/CatalogClient.tsx:115`). Se puede acotar por tipo de habitación, por mes, por precio máximo, por rango de fechas y por número de habitación (`apps/web/src/components/catalog/FilterBar.tsx:135`). El listado se pagina de 12 en 12 con un botón «Cargar más noches» (`apps/web/src/components/CatalogClient.tsx:17`, `:271`).

El catálogo solo enseña la venta primaria del hotel. Las noches de reventa tienen su propia pantalla, `/reventa` (`apps/web/src/lib/nights.ts:252`).

## Recorrido real

1. Abre `/catalogo`. Verás el título «Catálogo de noches» y la parrilla de tarjetas (`apps/web/src/app/catalogo/page.tsx:36`; `apps/web/messages/es.json:239`).
2. En la parte alta hay una barra de reserva con entrada, salida y huéspedes. Es un acceso al flujo de reserva, no un filtro del catálogo (`apps/web/src/app/catalogo/page.tsx:42`; `apps/web/src/components/booking/BookingBar.tsx:38`).
3. Bajo la barra están los filtros, en una banda que se queda fija al hacer scroll (`apps/web/src/components/catalog/FilterBar.tsx:96`):
   - Chips de `Todas`, `Simple`, `Doble` y `Suite`, más un chip por cada mes presente (`apps/web/src/components/catalog/FilterBar.tsx:108`).
   - Contador de resultados a la derecha, que se anuncia a los lectores de pantalla (`apps/web/src/components/catalog/FilterBar.tsx:126`).
   - Buscador por número de habitación, selector de precio máximo y rango de fechas «Desde» y «Hasta» (`apps/web/src/components/catalog/FilterBar.tsx:136`, `:150`, `:170`).
4. Cada tarjeta muestra foto, `Habitación N`, tipo, fecha larga y precio en ETH (`apps/web/src/components/NightCard.tsx:106`). Las suites llevan una etiqueta ámbar `Suite`; el resto, la etiqueta `Disponible` con un punto verde (`apps/web/src/components/NightCard.tsx:27`).
5. Al mover cualquier filtro, la lista vuelve a la primera página sola (`apps/web/src/components/CatalogClient.tsx:131`).
6. Si quedan más noches, pulsa «Cargar más noches». Se añaden 12 y el foco va a la primera tarjeta nueva (`apps/web/src/components/CatalogClient.tsx:174`; `apps/web/messages/es.json:235`).
7. Al llegar al final, aparece el aviso «Has visto todas las noches disponibles en los próximos 90 días.» (`apps/web/src/components/CatalogClient.tsx:283`; `apps/web/messages/es.json:237`).
8. Si no hay resultados con tus filtros, el aviso es «No hay noches para estos filtros» y aparece el botón `Quitar filtros` (`apps/web/src/components/CatalogClient.tsx:221`; `apps/web/messages/es.json:227`, `:232`).

## Piezas de código implicadas

- Página del catálogo: `apps/web/src/app/catalogo/page.tsx:9`, `:22`, `:28`, `:42`, `:44`, `:50`, `:60`.
- Lectura del inventario: `apps/web/src/lib/nights.ts:121`, `:194`, `:216`, `:289`, `:294`, `:341`.
- Ventana de 90 días: `packages/shared/src/constants.ts:48`.
- Estado degradado: `apps/web/src/components/DegradedState.tsx:10`, `:30`, `:31`.
- Cliente del catálogo (filtros y paginación): `apps/web/src/components/CatalogClient.tsx:17`, `:85`, `:97`, `:115`, `:131`, `:174`, `:221`, `:271`, `:283`.
- Barra de filtros: `apps/web/src/components/catalog/FilterBar.tsx:75`, `:96`, `:108`, `:126`, `:136`, `:150`, `:170`.
- Tarjeta de noche: `apps/web/src/components/NightCard.tsx:27`, `:58`, `:106`, `:132`, `:140`.
- Aviso de contrato en pausa: `apps/web/src/components/ContractPausedBanner.tsx:13`, `:16`, `:19`.
- Aviso de noches retiradas por vendidas: `apps/web/src/app/catalogo/page.tsx:50`.
- Barra de reserva (flujo distinto): `apps/web/src/components/booking/BookingBar.tsx:29`, `:38`.

## Datos y estados

- **Campos de una noche en el catálogo** (`NightView`): identificador de la ficha, habitación, fecha `AAAAMMDD`, tipo, precio en wei, tipo de venta y portada opcional (`apps/web/src/lib/nights.ts:41`).
- **Tipo de venta que sirve el catálogo:** siempre `PRIMARY` (`apps/web/src/lib/nights.ts:314`).
- **Etiquetas de estado de la tarjeta:** `Disponible`, `Suite` y `Reventa` (`apps/web/messages/es.json:208`, `:210`, `:209`).
- **Filtros disponibles:** tipo (`all`, `simple`, `doble`, `suite`), mes, precio máximo en wei, fecha desde, fecha hasta y número de habitación (`apps/web/src/components/CatalogClient.tsx:21`).
- **Umbrales de precio:** se calculan a partir del precio máximo real del catálogo, en escalones de medio ETH hacia arriba (`apps/web/src/components/CatalogClient.tsx:97`).
- **Mensajes reales:**
  - «No hay noches para estos filtros» + «Prueba con otras fechas, tipos de habitación o un precio máximo mayor. Pronto añadiremos más disponibilidad.» (`apps/web/messages/es.json:227`, `:228`).
  - «Aún no hay noches publicadas» + «Vuelve pronto: estamos preparando nuevas noches frente al Mediterráneo.» (`apps/web/messages/es.json:229`, `:230`).
  - «Hemos retirado {count} noche que ya está vendida. Estamos sincronizando el calendario: puede aparecer disponibilidad nueva en unos minutos.» (`apps/web/messages/es.json:231`).
  - «No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.» + botón `Reintentar` (`apps/web/messages/es.json:233`, `:234`).
  - «Has visto todas las noches disponibles en los próximos 90 días.» (`apps/web/messages/es.json:237`).
  - «Ventas en pausa» en las tarjetas cuando el contrato está pausado (`apps/web/messages/es.json:238`).
  - «El contrato está en pausa. El hotel ha pausado las operaciones: no se pueden comprar noches mientras dure la pausa.» (`apps/web/messages/es.json:917`, `:918`).
  - «No se pudo comprobar si el contrato está en pausa. La cadena no respondió a la consulta de estado; si intentas comprar y el contrato está en pausa, la transacción se rechazará.» (`apps/web/messages/es.json:919`, `:920`).
  - «La noche pasa a ser tuya: podrás revenderla cuando quieras.» en cada tarjeta (`apps/web/messages/es.json:213`).

## Casos límite y errores

- **No se pudo cargar el catálogo.** La página pinta el estado degradado con el botón `Reintentar`, que vuelve a pedir la página (`apps/web/src/app/catalogo/page.tsx:44`; `apps/web/src/components/DegradedState.tsx:31`).
- **No hay noches publicadas.** Estado vacío distinto del de «filtros demasiado estrechos»: sin filtros activos no se ofrece «Quitar filtros» (`apps/web/src/components/CatalogClient.tsx:235`).
- **Filtros demasiado estrechos.** Estado vacío con guía y botón `Quitar filtros` (`apps/web/src/components/CatalogClient.tsx:221`).
- **Rango de fechas incompleto.** Si solo hay una de las dos fechas, el filtro de ese extremo no se aplica; no da error (`apps/web/src/components/CatalogClient.tsx:51`, `:116`).
- **Límite de 90 días.** Más allá de la ventana no aparece ninguna noche (`packages/shared/src/constants.ts:48`).
- **Tope de inventario por lectura.** La consulta a base de datos pide como máximo 100 noches (`apps/web/src/lib/nights.ts:294`).
- **Contrato en pausa.** Se avisa arriba y las tarjetas cambian el botón de compra por «Ventas en pausa» (`apps/web/src/components/NightCard.tsx:132`).
- **No se pudo comprobar la pausa.** Tercer estado honesto: se dice que no se pudo comprobar, en vez de prometer que las ventas están abiertas (`apps/web/src/components/ContractPausedBanner.tsx:21`).
- **Noches fantasma.** Las noches que el índice anuncia pero la cadena ya vendió se retiran y se cuentan para avisar (`apps/web/src/lib/nights.ts:194`).
- **Reventa fuera del catálogo.** El catálogo no mezcla reventas: una noche de otro cliente solo se ve en `/reventa` (`apps/web/src/lib/nights.ts:252`).
- **Fotos provisionales.** Si una habitación no tiene foto registrada, la tarjeta usa su imagen de tipo; nunca se enseña la foto de otra habitación (`apps/web/src/lib/nights.ts:48`).

## Referencias

- CU-04 · Ver y filtrar las noches disponibles (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-04-catalogo.md:1`).
- CU-05 · Comprar una noche al hotel (`docs/Manuales/05-casos-de-uso/04-ventas/CU-05-compra-primaria.md:1`).
- CU-07 · Comprar una noche que otro cliente revende (`docs/Manuales/05-casos-de-uso/04-ventas/CU-07-compra-secundaria.md:1`).
- Guía del comprador, apartado 3 (elegir) (`docs/manual-comprador.md:71`).
- ADR-09 · El bloque de despliegue es la fuente única del escaneo (`docs/adr/ADR-09-bloque-despliegue-fuente-unica.md:1`).
- ADR-16 · Una sola venta primaria por noche (`docs/adr/ADR-16-venta-primaria-unica.md:1`).
- SRS §7 (interfaz y accesibilidad) y §9 (catálogo de casos de uso) (`docs/SRS.md:306`, `:342`).
- Requisitos que declara el manual técnico del CU-04 (RF-02, RF-14, RNF-01, RNF-02, RNF-11, RNF-12, Decisión 23) (`RepoTecnico/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-04-catalogo.md:3`).
- Trazabilidad requisito → CU → prueba (`docs/SRS.md:386`, `:391`).
