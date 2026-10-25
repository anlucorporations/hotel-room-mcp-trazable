# Identidad visual v3 — dos propuestas para elegir una

> **Encargo**: aplicar una identidad visual **fresca y mediterránea** integrada con los entornos de
> gestión administrativa **al estilo AdminLTE**, con una **UX/UI intuitiva** y fácil de visualizar en
> **web, móvil y APK**. Generar **al menos dos propuestas** para elegir una.
> **Fecha**: 2026-10-23 · **Autores**: `@visualUiUx` (arquitectura visual + design system) ·
> **Estado**: **2 propuestas completas, medidas y previsualizadas.** La suite pública se ha aplicado con **A · Cal & Sal** y el back-office con **B · Posidonia** (2026-10-23); ver `../evidencias/implementacion-2026-10-23-identidad-por-superficie.md`.
> **Base real**: sistema vigente «Brisa Marina» v2.0.0 (`packages/config/tailwind/preset.cjs`,
> `apps/web`, `RepoTecnico/Manual_Identidad_Visual.md`), AdminLTE ya implementado en `/admin/**`.

---

## 1. Decisión en una página

| | **Propuesta A — «Cal & Sal»** | **Propuesta B — «Posidonia»** |
|---|---|---|
| **Idea** | Mediterráneo **encalado**: caliza tibia, azul mar profundo, terracota, olivo | Pradera de posidonia: **verde-teal profundo**, agua clara, arena, coral |
| **Personalidad** | Cálida, editorial, hospitalaria, artesanal | Fresca, crisp, sostenible, operativa |
| **Lienzo** | `#F8F3E9` (caliza) | `#F2F8F7` (bruma de agua) |
| **Acción** | `#0B5C74` (azul mar) | `#0B6A5A` (posidonia) |
| **AdminLTE** | **Light skin «salón de luz»**: sidebar claro en caliza, activo azul mar | **Dark skin «sala de máquinas»**: rail oscuro de siempre, activo posidonia |
| **Tipografía** | **Cormorant Garamond** (display) + **Onest** (UI) | **Spectral** (display) + **Inter Tight** (UI) |
| **Pares WCAG medidos** | **42**, 0 fallos | **44**, 0 fallos |
| **Cambio de shell** | Sí: sidebar claro (clases de `AdminLayout` + 1 guardián) | No: solo cambian valores |
| **Esfuerzo de aplicación** | ≈1,5–2 días-persona | ≈1–1,5 días-persona |
| **Riesgo principal** | Validar densidad y foco del sidebar claro con datos reales | Menos diferenciada del azul actual: la marca se percibe como «la misma, más verde» |
| **Previsualización** | [Abrir](previsualizaciones/propuesta-a-cal-y-sal.html) | [Abrir](previsualizaciones/propuesta-b-posidonia.html) |

**Recomendación: Propuesta A — «Cal & Sal».**

1. **Es la que más se aleja de «Brisa Marina» sin romper nada.** El lienzo cálido y la tipografía
   editorial cambian la percepción del producto (hotel boutique, no panel cripto) sin tocar la
   arquitectura de información ni los tokens de código.
2. **El AdminLTE en claro es un diferenciador funcional, no un capricho.** La suite de administración
   deja de ser «otra pantalla oscura» y comparte la luz del escaparate; el rail oscuro que hoy usa
   Brisa Marina se conserva solo para hero, pie y velo. Si el equipo prefiere el rail oscuro, A admite
   el cambio con una línea (`admin.sidebarBg → navy`) sin rehacer la identidad.
3. **La marca gana donde se juega la reserva.** Cormorant Garamond da al hero y a los precios una voz
   editorial que B (Spectral + Inter Tight) resuelve con más corrección operativa que emoción.
4. **La accesibilidad no depende de la elección**: ambas cumplen AA con 0 fallos y la misma
   verificación automatizada. La diferencia es de carácter, no de calidad.

**Cuándo elegir B**: si el responsable prefiere **minimizar el riesgo de migración** (no hay que tocar
el shell), prioriza la **densidad del back-office** y quiere una marca más técnica/sostenible. B es
también la más cercana al azul actual, por lo que se percibirá como una evolución suave.

**Opción 0**: mantener «Brisa Marina». Es una identidad válida y ya verificada; estas propuestas no la
declaran defectuosa, sino agotada en diferenciación. Si no hay apetito de cambio, no se aplica nada y
este documento queda como registro de la exploración.

---

## 2. Cómo se miran (2 minutos)

1. **Comparativa visual**: [`previsualizaciones/comparativa.html`](previsualizaciones/comparativa.html)
   o [`capturas/comparativa.png`](capturas/comparativa.png) (captura real del HTML con Chromium).
2. **Propuesta A completa**: [`previsualizaciones/propuesta-a-cal-y-sal.html`](previsualizaciones/propuesta-a-cal-y-sal.html)
   — paleta, tipografía, landing, móvil/APK, AdminLTE, componentes y contraste.
3. **Propuesta B completa**: [`previsualizaciones/propuesta-b-posidonia.html`](previsualizaciones/propuesta-b-posidonia.html).
4. **Especificaciones**: [`propuesta-A-cal-y-sal.md`](propuesta-A-cal-y-sal.md) y
   [`propuesta-B-posidonia.md`](propuesta-B-posidonia.md) (manuales de identidad candidatos).
5. **Capturas sueltas** en [`capturas/`](capturas/): página completa, landing, hero, móvil y admin de
   cada propuesta. Las imágenes son capturas del HTML, **no mockups de Figma**: lo que se ve es lo que
   se implementaría.

> Las previsualizaciones cargan las tipografías desde Google Fonts y usan fotografías reales del hotel
> (`docs/imagenes/`). No requieren servidor: se abren como fichero local.

---

> **Propuesta de distribución de la suite pública (2026-10-23)**: se ha generado una propuesta
> aparte de **layout editorial** basada en una referencia Wix, con las tres identidades conmutables:
> [`../propuesta_suite_publica/README.md`](../propuesta_suite_publica/README.md). No decide la
> identidad; sirve para revisar cómo se comporta cualquiera de las tres en la suite pública.

## 3. Qué cambia y qué no cambia (para las dos propuestas)

| Se conserva **sin tocar** | Se cambia (nivel de valores) |
|---|---|
| La **distribución AdminLTE** (sidebar plegable, navbar, `content-header` con migas, `content-wrapper`, `small-box`, pie) y sus guardianes (`admin-shell.test.ts`) | **Valores de color** del preset (mismo nombre de token: `mist`, `shell`, `ink`, `azure`, `navy`, `pearl`, `coral`, `amber`, `fern`, `line`, estados) |
| La **arquitectura de información**: 8 secciones reales del acordeón (`adminNav.ts`) | **Tipografías** de marca (`next/font` + `--font-display`/`--font-sans`) |
| **Tokens semánticos y su API** de código: no hay renombrado ni migración de 142 ficheros | **Radios, sombras y detalles de movimiento** |
| La **verificación**: `contrast-audit.mjs`, `palette.ts` espejo, `a11y.test.ts`, axe/Playwright, i18n ES/EN/RU | Un **token nuevo** por propuesta: `arena` (A) y `agua` (B) |
| La lógica de negocio, las rutas, la i18n y las áreas táctiles de 44 px | El **skin del sidebar** en A (light skin); en B, nada estructural |

Esto es deliberado: el proyecto ya pagó una migración visual completa (142 ficheros) y tiene
guardianes que comparan preset ↔ espejo ↔ documentación. Las propuestas **reutilizan esa ingeniería**:
la aplicación es un cambio de valores + fuentes + un pequeño ajuste de shell, no un rediseño de código.

---

## 4. Entregables de esta carpeta

| Artefacto | Ruta | Qué contiene |
|---|---|---|
| Comparativa | [`previsualizaciones/comparativa.html`](previsualizaciones/comparativa.html) | las dos propuestas lado a lado con capturas reales |
| Índice de previews | [`previsualizaciones/index.html`](previsualizaciones/index.html) | acceso a las tres páginas |
| Preview A | [`previsualizaciones/propuesta-a-cal-y-sal.html`](previsualizaciones/propuesta-a-cal-y-sal.html) | identidad completa de A en web + AdminLTE + APK |
| Preview B | [`previsualizaciones/propuesta-b-posidonia.html`](previsualizaciones/propuesta-b-posidonia.html) | identidad completa de B |
| Manual A | [`propuesta-A-cal-y-sal.md`](propuesta-A-cal-y-sal.md) | especificación lista para aprobar/implementar |
| Manual B | [`propuesta-B-posidonia.md`](propuesta-B-posidonia.md) | especificación lista para aprobar/implementar |
| Tokens | [`tokens/`](tokens) | `design-tokens-*.json` (formato Figma Tokens / DTCG), preset candidato de Tailwind y tema Compose para la APK |
| Contraste A | [`contraste-propuesta-a-cal-y-sal.md`](contraste-propuesta-a-cal-y-sal.md) | 42 pares aprobados + 4 prohibidos, con ratio exacto |
| Contraste B | [`contraste-propuesta-b-posidonia.md`](contraste-propuesta-b-posidonia.md) | 44 pares aprobados + 4 prohibidos |
| Capturas | [`capturas/`](capturas) | PNG de página completa, landing, hero, móvil y admin |
| Generador | [`../../scripts/design/proposals-v3.mjs`](../../scripts/design/proposals-v3.mjs) + [`proposals-v3.data.mjs`](../../scripts/design/proposals-v3.data.mjs) | fuente única: si un dato cambia, se regenera todo |

---

## 5. Cómo se ha verificado (no es una opinión)

| Comprobación | Resultado |
|---|---|
| Contraste WCAG 2.1 (misma matemática que `apps/web/src/lib/a11y/contrast.ts`, ratio sin redondear) | **A: 42 pares · 0 fallos**; **B: 44 pares · 0 fallos**. El generador **aborta** si un par no llega a su mínimo. |
| Fronteras de control (`line-strong`, WCAG 1.4.11) | A: 3,38–4,15:1 · B: 3,92–4,62:1 (mínimo 3:1) |
| Velo del hero (texto blanco sobre el compuesto al 70 %) | A: **5,74:1** · B: **6,09:1** (AA) |
| Cirílico (locale RU) | **Las 4 familias** publican el subconjunto `cyrillic` en Google Fonts (verificado contra la API de Google Fonts). Guardián `cyrillic-fonts.test.ts` en la aplicación. |
| Render real | Las 2 previsualizaciones y la comparativa se capturan con **Chromium (Playwright)** desde el HTML, con las fuentes cargadas (`document.fonts.ready`). |
| Tokens | El preset candidato de Tailwind se **carga con `require()`** en el generador para validar sintaxis; el JSON sigue el formato de Figma Tokens/DTCG. |
| Tema APK | Borrador Compose (`android-theme-*.kt`) con los mismos valores que web y AdminLTE. No se compila porque `apps/mobile` **aún no existe** (ciclo A1.4 del plan de la APK). |

**Límites declarados**

- Las previsualizaciones son **demostraciones de identidad con datos ficticios**, no pantallas del
  producto real: no sustituyen a la verificación axe sobre el build real (que se ejecutará al aplicar).
- El **modo noche** del personal, la app nativa y el rediseño de componentes existentes no forman parte
  de esta entrega; el alcance es la identidad y su especificación.
- Las capturas full-page son muy altas (≈9.200 px); para revisarlas se abren mejor los HTML o las
  capturas de sección.

---

## 6. Si se aprueba una propuesta: plan de aplicación

Orden propuesto (el mismo para A y B; el detalle vive en la §9 de cada manual):

1. **Tokens** — valores en `packages/config/tailwind/preset.cjs`, `apps/web/src/lib/a11y/palette.ts`
   (espejo + pares declarados), `apps/web/src/app/globals.css` (`:root`) y `scripts/design/contrast-audit.mjs`.
2. **Tipografía** — `apps/web/src/app/layout.tsx` (`next/font` con `subsets: ["latin","cyrillic"]`),
   `fontFamily` del preset y variables `--font-display` / `--font-sans`.
3. **AdminLTE** — en A, re-vestir el sidebar (`AdminLayout.tsx`) y actualizar su guardián; en B, nada.
4. **Guardianes y docs** — `palette.test.ts`, `a11y.test.ts`, `control-boundary.test.ts`,
   `cyrillic-fonts.test.ts`, `Docs`: `docs/DISENO-UX.md` §2, `docs/ACCESIBILIDAD-WCAG.md`,
   `RepoTecnico/Manual_Identidad_Visual.md` v3.
5. **Evidencias** — `scripts/design/brand-sheet.mjs`, `scripts/design/contrast-audit.mjs`,
   capturas de landing/admin, regeneración de manuales y PDF.
6. **APK** — tokens Compose del ciclo A1.4 cuando exista `apps/mobile` (se entrega el borrador listo).

**Criterio de aceptación de la aplicación**: `pnpm typecheck`, `pnpm lint`, `pnpm --filter @hotel/web test`,
`pnpm --filter @hotel/web build`, `playwright test e2e/a11y.spec.ts` en verde, `contrast-audit` con 0
fallos y 0 restos de la paleta anterior en las piezas de marca.

---

## 7. Decisión

**Pregunta al responsable**: ¿aprobamos **A (Cal & Sal, recomendada)**, **B (Posidonia)** o **mantener
Brisa Marina**? Con la respuesta, la propuesta elegida se aplica al producto en el orden de §6 y este
documento pasa a formar parte del histórico de `Manual_Identidad_Visual.md`.

---

## 8. Changelog

| Fecha | Cambio |
|---|---|
| 2026-10-23 | Primera edición: dos propuestas completas (A/B), tokens, previews navegables, capturas reales, tablas WCAG, tema Compose borrador y recomendación. **Ninguna aplicada.** |
