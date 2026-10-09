# Requerimientos · Incremento v4 (Asistente IA en toda la plataforma)

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable-DSH`)
> **Base**: `## 14` de `estado_proyecto.md` (propuesta v3 del asistente, releases v44/v45 desplegadas).
> **Origen**: petición del responsable (2026-10-09), entrevista de arranque de tres decisiones.
> **Regla de oro del incremento**: no se toca el modelo de datos, ni el contrato `HotelNights`, ni
> la frontera de seguridad del asistente (MCP **read-only** + `buildPurchaseTx` **sin firma**).

---

## 1. Decisiones de la entrevista (cerradas)

| ID | Decisión | Valor elegido |
|---|---|---|
| D-82 | Cómo se muestran los resultados de una consulta | **Navegación automática al catálogo filtrado**: el asistente lleva a `/catalogo` con el filtro en la URL; el resultado se ve en la página, no en el panel. |
| D-83 | Alcance de «toda la plataforma» | **Web pública + suite de recepción** (comparten `PublicShell`). El back-office de administración queda fuera. |
| D-84 | Página `/asistente` | **Se mantiene** como página completa y accesible desde el menú; el widget es un acceso **adicional** desde cualquier pantalla. |

---

## 2. Requerimientos funcionales (RF)

### 2.1 Disponibilidad global del asistente

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-61 | El sistema deberá ofrecer el asistente IA en **todas las vistas públicas y de recepción** sin tocar página por página (se monta en la plantilla compartida). | Alta |
| RF-61.1 | En **escritorio** (`≥768 px`) el acceso deberá ser un **icono flotante abajo a la derecha**, fijo (permanece al hacer scroll) y visible en toda la plataforma. | Alta |
| RF-61.2 | En **móvil** (`<768 px`) el acceso deberá ser el **avatar del hotel en la cabecera**, que despliega la misma conversación. | Alta |
| RF-61.3 | El panel desplegable deberá **cerrarse con `Escape`**, al cambiar de ruta y al ejecutar una acción de página, devolviendo el foco al disparador. | Alta |
| RF-61.4 | En `/asistente` **no** deberá duplicarse el acceso (la página ya es la conversación completa): ni icono flotante ni avatar de cabecera. | Media |

### 2.2 Avatares de marca

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-62 | El asistente deberá usar los avatares del hotel de `docs/imagenes/` según el caso: `avatar_hotel_80x80.webp` en el **lanzador flotante** de escritorio y `avatar_hotel_40x40.webp` en la **cabecera móvil** y en el **encabezado del panel**. | Media |
| RF-62.1 | Los avatares deberán servirse como recurso estático de la web (`apps/web/public/images/`) y declararse decorativos (`alt=""` + `aria-hidden`), porque el nombre accesible lo aporta el botón. | Media |

### 2.3 El asistente interactúa con la plataforma

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-63 | Cuando una consulta se resuelve con las herramientas de catálogo (`listAvailableNights`, `checkAvailability`), el sistema deberá **mostrar el resultado en la página**: navegar al catálogo con el filtro aplicado (tipo, rango de fechas, número de habitación) en la URL. | Alta |
| RF-63.1 | La acción de página deberá derivarse de la **entrada real** de las herramientas que respondieron **con éxito**, nunca del texto del modelo. Una herramienta que falla no mueve al usuario. | Alta |
| RF-63.2 | El catálogo deberá aceptar el filtro por URL (`?tipo=&desde=&hasta=&buscar=`), **sanearlo** y aplicarlo desde el primer render. | Alta |
| RF-63.3 | El catálogo deberá mostrar un aviso con el filtro aplicado y un enlace para **quitarlo** (volver al catálogo completo). | Media |
| RF-63.4 | La conversación deberá **conservarse al navegar** (memoria por pestaña), para que el salto a la página no borre el hilo. | Media |
| RF-63.5 | Un turno que **no** consulta el catálogo (p. ej. una duda de manuales) **no** deberá mover al usuario de página. | Alta |

---

## 3. Requerimientos no funcionales (RNF)

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RNF-47 | **Saneamiento del filtro de URL**: tipo fuera del catálogo, fechas mal formadas o imposibles y números de habitación desmesurados se descartan en silencio. | Pruebas unitarias de `parseCatalogSearch`; el catálogo nunca falla por una URL manipulada. |
| RNF-48 | **Accesibilidad** (continúa RNF-20): disparadores con nombre accesible y `aria-expanded`, panel con `role="dialog"` y `aria-label`, cierre con `Escape`, foco devuelto al disparador, áreas táctiles ≥44 px. | `e2e/a11y.spec.ts` sin violaciones `critical`/`serious`; `e2e/asistente-global.spec.ts` verifica etiqueta y estado. |
| RNF-49 | **Cobertura**: el trinquete de la web (ramas ≥73 %) sigue en verde con la lógica nueva cubierta por pruebas. | `pnpm --filter @hotel/web run test:coverage` con código de salida 0. |
| RNF-50 | **Idiomas**: las claves nuevas existen en `es`, `en` y `ru` (paridad de mensajes). | `i18n-parity.test.ts` / `i18n-keys.test.ts` en verde. |
| RNF-51 | **Sin cambios de modelo ni de contrato**: no hay migración de base de datos, no se altera `HotelNights` y el asistente sigue sin firmar ni custodiar claves. | `git diff` sin `base_datos.sql` ni contratos; `buildPurchaseTx` intacto. |
| RNF-52 | **Compatibilidad del contrato HTTP**: la respuesta de `/api/assistant` crece de forma **aditiva** (`pageAction`); los clientes anteriores siguen funcionando. | `route-metrics.test.ts` fija el contrato exacto. |

---

## 4. Requerimientos técnicos (RT)

| ID | Especificación |
|---|---|
| RT-16 | `POST /api/assistant` incorpora `pageAction: { kind: "catalog", href, search } \| null`, derivado en servidor de las herramientas de catálogo ejecutadas con éxito. |
| RT-17 | Los avatares se publican en `apps/web/public/images/avatar_hotel_40x40.webp` y `avatar_hotel_80x80.webp`, copiados de `docs/imagenes/`. |
| RT-18 | La traducción estado↔URL vive en `src/lib/catalog-search.ts` (puro, sin React) y la derivación consulta→página en `src/lib/assistant/page-action.ts`, ambas con pruebas unitarias. |
| RT-19 | La memoria de conversación (`src/components/assistant/history.ts`) usa `sessionStorage` con almacenamiento inyectable, tope de 20 mensajes y tolerancia total a contenido corrupto o almacenamiento bloqueado. |

---

## 5. Trazabilidad

| Requerimiento | Caso de uso | Implementación | Prueba |
|---|---|---|---|
| RF-61, RF-61.1, RF-61.2 | CU-51 | `AssistantDock.tsx`, `PublicShell.tsx`, `SiteHeader.tsx` | `e2e/asistente-global.spec.ts` |
| RF-61.3, RF-61.4 | CU-51/CA-3, CU-54 | `AssistantDock.tsx` | `e2e/asistente-global.spec.ts` |
| RF-62 | CU-51 | `AssistantDock.tsx` + `public/images/*.webp` | `e2e/asistente-global.spec.ts` |
| RF-63, RF-63.1, RF-63.5 | CU-52 | `orchestrator.ts`, `page-action.ts`, `route.ts`, `useAssistant.ts` | `orchestrator.test.ts`, `page-action.test.ts` |
| RF-63.2, RNF-47 | CU-52 | `catalog-search.ts`, `catalogo/page.tsx`, `CatalogClient.tsx` | `catalog-search.test.ts`, `e2e/asistente-global.spec.ts` |
| RF-63.3 | CU-52 | `catalogo/page.tsx` | `e2e/asistente-global.spec.ts` |
| RF-63.4 | CU-53 | `history.ts`, `useAssistant.ts` | `history.test.ts`, `e2e/asistente-global.spec.ts` |
| RNF-48 | CU-51/CA-3 | `AssistantDock.tsx` | `e2e/a11y.spec.ts`, `e2e/asistente-global.spec.ts` |
| RNF-52 | CU-52 | `route.ts` | `route-metrics.test.ts` |

---

## 6. Fuera de alcance (declarado)

1. **Back-office de administración** (D-83): las suites `admin/**` conservan su plantilla propia.
2. **Contenido del asistente**: no se cambian el prompt, el proveedor LLM, las herramientas del MCP
   ni la base de conocimiento (eso fue el `## 14`).
3. **Resultados dentro del panel**: descartado por D-82 (las tarjetas de noches se ven en el catálogo,
   que ya las sabe pintar con foto, precio y compra).
4. **Modelo de datos**: sin tablas ni columnas nuevas → `diccionario_datos.md`, `diagrama_er.md` y
   `base_datos.sql` **no cambian** en este incremento.
