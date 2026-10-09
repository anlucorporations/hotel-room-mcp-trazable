# Plan de desarrollo · Incremento v4 (Asistente IA en toda la plataforma)

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable-DSH`)
> **Base**: `requerimientos_incremento.md` (§2–§4) y `casos_uso_incremento.md` (CU-51…CU-54).
> **Estrategia**: ciclos **verticales** (cada uno deja funcionalidad completa y verificable). Ningún
> ciclo toca el modelo de datos.
> **Fecha**: 2026-10-09.

---

## Ciclo C1 · El catálogo entiende su filtro por URL

**Objetivo**: que una URL como `/catalogo?tipo=simple&desde=2026-06-01` deje la parrilla ya filtrada,
sin tocar el estado local a mano. Es la base de todo lo demás: sin esto, el asistente no tiene dónde
enseñar el resultado.

| # | Tarea | Entregable |
|---|---|---|
| C1.1 | `src/lib/catalog-search.ts`: `parseCatalogSearch` / `buildCatalogHref` / `describeCatalogSearch` / `gridFiltersFromSearch` (puro, sin React) | Contrato estado↔URL |
| C1.2 | `app/catalogo/page.tsx`: leer `searchParams`, sembrar la parrilla y remontarla con `key` al cambiar la búsqueda | Página que acepta el filtro |
| C1.3 | `CatalogClient.tsx`: aceptar `initialSearch` y arrancar de ahí (sin efectos de sincronización) | Parrilla filtrada desde el primer render |
| C1.4 | Aviso `catalog-assistant-notice` con el filtro aplicado y el enlace «Quitar filtros» | Trazabilidad visible |

**Pruebas del ciclo**: `src/lib/catalog-search.test.ts` (14 pruebas: saneamiento, ida y vuelta,
descarte de tipo/fecha/habitación inválidos).

---

## Ciclo C2 · La consulta del asistente se convierte en navegación

**Objetivo**: que `/api/assistant` devuelva **qué página** y **con qué filtro** debe verse el
resultado, derivado de las herramientas que el LLM ejecutó de verdad.

| # | Tarea | Entregable |
|---|---|---|
| C2.1 | `src/lib/assistant/page-action.ts`: `derivePageAction` / `catalogSearchOf` | Derivación determinista |
| C2.2 | `orchestrator.ts`: registrar **solo** las herramientas que respondieron con éxito (`AssistantResult.toolCalls`) | Materia prima fiable |
| C2.3 | `route.ts`: exponer `pageAction` en la respuesta (aditivo) | Contrato ampliado |
| C2.4 | `useAssistant.ts` + `AssistantChat.tsx`: ejecutar la navegación al recibir la acción | El resultado se ve en la página |

**Pruebas del ciclo**: `page-action.test.ts` (11), casos nuevos en `orchestrator.test.ts`
(registro solo de éxitos; turno de manuales sin navegación) y contrato exacto en
`route-metrics.test.ts`.

---

## Ciclo C3 · El asistente, en toda la plataforma

**Objetivo**: acceso permanente al asistente —flotante en PC, avatar en la cabecera en móvil— con la
conversación intacta al navegar.

| # | Tarea | Entregable |
|---|---|---|
| C3.1 | `components/assistant/AssistantDock.tsx`: proveedor de estado, lanzador flotante, panel y disparador de cabecera | Widget |
| C3.2 | `layout/PublicShell.tsx` (públicas + recepción) y `layout/SiteHeader.tsx` (móvil) | Montaje global |
| C3.3 | Avatares en `apps/web/public/images/` y uso por caso (80 lanzador / 40 cabecera y panel) | Marca |
| C3.4 | `components/assistant/history.ts`: memoria de la conversación por pestaña | Continuidad |
| C3.5 | Claves i18n en `es`/`en`/`ru` | Idioma |

**Pruebas del ciclo**: `history.test.ts` (9), `e2e/asistente-global.spec.ts` (4 escenarios × 2
proyectos: escritorio y Pixel 5) y el escaneo `e2e/a11y.spec.ts`.

---

## Ciclo C4 · Guardián de imágenes y documentación

**Objetivo**: que los avatares dejen de ser una familia «no declarada» y que la documentación del
proyecto refleje el incremento.

| # | Tarea | Entregable |
|---|---|---|
| C4.1 | `images-naming.test.ts`: familia `avatar_hotel_<n>x<n>.webp` + prueba de los dos tamaños | Guardián ampliado |
| C4.2 | `docs/imagenes/README.md` y `RepoTecnico/catalogo_imagenes.md`: cuarta familia documentada | Índice al día |
| C4.3 | `RepoTecnico/incremento_v4/*` + sección `## 15` de `estado_proyecto.md` | Trazabilidad del incremento |

**Pruebas del ciclo**: `images-naming.test.ts` (7).

---

## Criterios de cierre del incremento

1. `pnpm --filter @hotel/web run test:coverage` en **verde** (ramas ≥ 73 %).
2. `pnpm --filter @hotel/web run typecheck` y `eslint` sin errores **en lo tocado**.
3. `pnpm --filter @hotel/web run build` correcto (el widget se compila en producción).
4. E2E del asistente global en verde en **escritorio y móvil**.
5. Los tres artefactos de datos (`diccionario_datos.md`, `diagrama_er.md`, `base_datos.sql`)
   **sin cambios**: este incremento no toca el modelo (RNF-51).

---

## Cierre (2026-10-09) — los cuatro ciclos completados

| Ciclo | Estado | Verificación |
|---|---|---|
| C1 · Filtro del catálogo por URL | ✅ | `catalog-search.test.ts` (14) + E2E «el catálogo aplica el filtro que llega en la URL» |
| C2 · Consulta → navegación | ✅ | `page-action.test.ts` (11) + 2 casos en `orchestrator.test.ts` + contrato en `route-metrics.test.ts` |
| C3 · Widget global | ✅ | `history.test.ts` (9) + E2E 12/12 (escritorio y Pixel 5) + a11y 10/10 |
| C4 · Guardián de imágenes y documentación | ✅ | `images-naming.test.ts` (7) + índices actualizados |

| Comprobación de cierre | Resultado |
|---|---|
| `test:coverage` | 102 ficheros · 946 pruebas · **ramas 74,11 %** (umbral 73) · salida **0** |
| `typecheck` / `eslint` (tocado) | Sin errores |
| `next build` | Correcto (con `NODE_OPTIONS=--max-old-space-size=1536`) |
| E2E asistente (2 proyectos) | **12/12** en 25,7 s |
| A11y (`/`, `/catalogo`, `/recepcion`, `/asistente`, `/ayuda`) | **10/10**, 0 violaciones `critical`/`serious` |

**Tres defectos reales** se encontraron al ejecutar (no al compilar) y se corrigieron: el compositor del
panel quedaba bajo el historial en móvil, el autoscroll arrastraba el scroll de la página entera y la
conversación se perdía al navegar (el efecto de guardado no llegaba a correr porque el panel se
desmontaba en el mismo ciclo). El detalle está en `estado_proyecto.md` §15.4, junto con los cinco
hallazgos del entorno (§15.5): el heap del build, las librerías del navegador, el idioma de la suite, el
presupuesto de tiempo de una prueba preexistente y el hit-test del clic en la emulación móvil.
