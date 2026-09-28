# Propuesta de imagen visual — Hotel Marina del Sol

> **Entrada analizada**: [`propuestaVisual-Hotel.md`](./propuestaVisual-Hotel.md) («Marina Sol»: lujo
> costero, océano profundo + arena + terracota + champagne, Cormorant/Playfair + Inter, app móvil).
> **Base real del proyecto**: sistema vigente **«Mediterráneo editorial»**
> (`packages/config/tailwind/preset.cjs`, `apps/web/src/lib/a11y/palette.ts`, `docs/DISENO-UX.md` §2,
> `docs/SRS.md` §7), verificado por guardianes de test y por escaneo axe.
> **Instrumento de medición**: `node scripts/design/contrast-audit.mjs` (WCAG 2.1, misma matemática que
> `apps/web/src/lib/a11y/contrast.ts`; **32 pares medidos**, ratio sin redondear).
> **Estado**: **ciclo CERRADO** (2026-09-27). Dirección aprobada y **cinco fases implementadas y
> verificadas**: A (tokens), A.2 (frontera de controles), B (cascada cirílica), C (componentes de las
> tres superficies), D (piezas de marca y vista social) y E ([`Manual_Identidad_Visual.md`](./Manual_Identidad_Visual.md)
> v1.0.0). **Fecha**: 2026-09-27.

---

## 0. Veredicto en una página

El documento de referencia acierta en el **relato** (Mediterráneo sereno, lujo sobrio, narrativa
editorial, fotografía de hora mágica) y en **cinco piezas concretas** que sí conviene adoptar. Pero
está escrito para **otro producto** (resort con villas, spa, mayordomo y app nativa) y se plantea como
**sustitución** de la identidad, no como evolución. Medido, eso tendría tres consecuencias:

1. **Rompería WCAG AA en 5 pares** de texto/fondo (terracotas del documento, champagne como texto, gris
   secundario sobre arena) — §3.3.
2. **Tiraría un sistema que ya está verificado por tests** (espejo preset↔palette, escáner de
   `className`, axe 16/16) y obligaría a retocar imágenes, mockups y piezas de marca — §2.3.
3. **No cubriría 4 de las 5 suites** (recepción, housekeeping, mantenimiento, administración): son
   interfaces operativas de personal, no escaparate — §3.8.

Y deja intacto el defecto real que la nueva imagen **sí** debería cerrar: **el ruso no tiene glifos en
ninguna de las dos tipografías de marca** (Fraunces no incluye cirílico; Hanken Grotesk solo el bloque
*extendido*, sin el rango ruso básico) en un producto con paridad ES/EN/RU — §3.4.

**Recomendación**: **evolución aditiva** de «Mediterráneo editorial» en 5 fases (§5), adoptando del
documento el **marino editorial** como superficie oscura, el **champagne** como detalle sobre oscuro,
la **narrativa de hero + barra de reserva flotante** y su inventario de componentes; y descartando sus
terracotas claras como color interactivo, el champagne como texto, el gris `#6B7280` sobre arena, la
tipografía Outfit (sin cirílico) y la app nativa en esta fase.

| Decisión | Recomendación | Motivo (medido/verificado) |
|---|---|---|
| Base cromática | **Mantener los 12 tokens vigentes** y **añadir** `ocean`, `champagne`, `line-strong`, estados y velo | La vigente ya cumple AA/AAA y está protegida por tests; añadir no rompe nada |
| Marino `#0F2C3F` | **Adoptar** como `ocean` (superficies oscuras: hero, pie, administración) | 13,42:1 con arena y 14,46:1 con blanco |
| Terracota interactiva | **Mantener** `terracotta` (#C0542E) como relleno y `terracotta-text` (#A8431F) como texto | 4,62:1 con blanco (botón) y 5,59:1 sobre arena; las del documento dan 3,12–3,91:1 ❌ |
| Champagne `#C5A880` | **Adoptar solo como decoración sobre oscuro** (nunca texto sobre claro) | 6,39:1 sobre `ocean`, pero 2,06–2,26:1 sobre arena/blanco ❌ |
| Tipografía | **Mantener** Fraunces + Hanken Grotesk y **añadir cascada cirílica** (Playfair Display + Inter, subconjunto `cyrillic`) | Es la única forma de que el ruso no caiga a `Georgia/system-ui` sin cambiar la cara ES/EN |
| Ámbito | Pública **+** las 4 suites de personal; **app nativa fuera** (3.ª versión, D-49/D-50) | El plan definitivo ya la difiere; el documento la trata como entregable de esta fase |

---

## 1. Análisis del documento de referencia

### 1.1 Qué acierta (y se adopta)

| Aporte del documento | Por qué encaja | Cómo entra en el proyecto |
|---|---|---|
| **Marino profundo mediterráneo** (#0F2C3F) | El sistema vigente solo tiene el eje teal (`sea`/`sea-deep`); le falta una superficie **oscura editorial** para hero, pie y cabeceras de administración | Token nuevo `ocean` (+ `ocean-soft`) |
| **Dorado champagne** (#C5A880) | El `gold` vigente (#C68A2E) falla como texto sobre claro (2,97:1) y el documento pide un dorado más pálido para filetes | Token nuevo `champagne`, **solo** sobre `ocean`/`ocean-soft` |
| **Hero inmersivo + barra de reserva flotante** | Es exactamente el hueco de la home actual (one-page sin motor de reserva visible) y encaja con `/reservar` (D-65/D-72) | Componentes nuevos `Hero` y `BookingBar` (§3.7) |
| **Resumen flotante del checkout en 3 pasos** | El proyecto ya compra en 3 pasos (ADR-11); falta la pieza visual que resume importe/destino | `StickySummary` reutilizando el objeto verificado |
| **Tratamiento fotográfico** (hora mágica, encuadres con aire) | Coherente con la paleta arena; el proyecto tiene 3 fotos de habitación y una portada | Guía de arte en §3.10 + regeneración de piezas SVG |
| **Estado vacío/error con jerarquía editorial** | El producto ya declara estados degradados honestos; el documento propone el tono | Se mantiene y se documenta (§3.7) |

### 1.2 Qué no encaja (y por qué)

| Punto del documento | Problema real | Evidencia |
|---|---|---|
| «Terracota #C86446/#D96B43 para **CTAs primarios y estados activos**» | Como **texto** da 3,56:1 (arena) y 3,91:1 (blanco); como **relleno con texto blanco**, 3,91:1 y 3,42:1 → **no cumple AA** en etiqueta normal | §3.3, pares medidos |
| «Champagne para **estrellas de calificación y cifras**» | Sobre blanco/arena da **2,26:1 / 2,06:1** → ilegible para texto; válido solo sobre `ocean` | §3.3 |
| «Texto secundario/placeholder `#6B7280`» | Sobre arena da **4,40:1** → por debajo de AA (4,5). El vigente `ink-soft` #4C575C da **6,90:1** | §3.3 |
| «Esquinas 8–12 px en web; 16–24 px en móvil» | El sistema vigente usa 10/16/22 y **ya está** en tarjetas y modales; el cambio no aporta y obliga a revisar 242 usos de borde/radio | `preset.cjs` (`brand`, `brand-sm`, `brand-lg`) |
| «Escala tipográfica de **8pt**» en Figma | El proyecto usa **escala 4px** (4·8·12·16·20·28·40·64) y breakpoints propios (`tablet`/`desktop`, mobile-first) | `docs/DISENO-UX.md` §2.3–2.4 |
| «**App móvil** iOS/Android con llave NFC, butler chat, room service» | Es la **3.ª versión** (D-49/D-50) y no existe dominio de spa/naútica/mayordomía; el trabajo actual es **web responsive** para el personal | `plan_definitivo.md` §9 |
| «Diseño en **Figma**» como Fase 1 | El proyecto entrega **código y tokens** (Tailwind preset compartido + espejo TS + guardianes); Figma sería un artefacto paralelo que se desincroniza | `preset.cjs`, `palette.ts`, `palette.test.ts` |
| Tipografías propuestas: **Outfit** | **No tiene cirílico** (subsets: latin, latin-ext) → inservible para el locale RU | Google Fonts metadata (§7.2) |
| «Cormorant Garamond **o** Playfair Display» | Ambas válidas (tienen cirílico), pero **cambiar** la display actual (Fraunces) altera todas las páginas por un motivo que se resuelve con una **cascada de respaldo** | §3.4 |

---

## 2. El proyecto real: línea base que no se puede ignorar

### 2.1 Stack y dónde viven los tokens

| Pieza | Realidad verificada |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript, **38 rutas** (`apps/web/src/app/**/page.tsx`) |
| Estilos | **Tailwind** con preset compartido `packages/config/tailwind/preset.cjs` + `apps/web/src/app/globals.css` (`:root` con custom properties) |
| Espejo de tokens | `apps/web/src/lib/a11y/palette.ts` — mismo HEX que el preset, con **test guardián** (`palette.test.ts`) que se pone rojo si divergen |
| Tipografías | `next/font/google`: **Fraunces** (display, eje óptico) + **Hanken Grotesk** (UI), ambas con `subsets: ["latin"]` |
| Iconografía | SVG en línea (sin librería); iconos decorativos ocultos a lectores |
| Gráficas | `recharts` en el dashboard, con `role="img"`, nombre accesible y **tabla de datos equivalente** |
| Imágenes | `docs/imagenes/` (3 fotos de habitación, portada PNG/SVG y 8 infografías SVG) + `docs/ux-mockups/catalogo.html` |

### 2.2 Suites y superficies reales (el documento solo cubre la primera)

| Suite | Rutas | Naturaleza visual |
|---|---|---|
| **Pública** | `/`, `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`, `/mis-noches/mis-reventas`, `/checkin`, `/historico`, `/asistente`, `/ayuda`, `/privacidad`, `/terminos` | Escaparate editorial: **hero, fotografía, narrativa** — aquí encaja el documento |
| **Front Office / Recepción** | `/recepcion`, `/recepcion/reservas` | Operativa densa: tablero del día, disponibilidad, check-in/out, cargos |
| **Housekeeping** | `/housekeeping`, `/admin/housekeeping/lenceria` | Móvil, un toque por acción, tablero **en directo** (SSE 1,5 s) |
| **Mantenimiento** | `/mantenimiento`, `/admin/mantenimiento/*` | Móvil, incidencias con foto/estado, preventivo |
| **Administración** | `/admin/**` (17 rutas) | Sidebar en acordeón, dashboard con gráficas, formularios, roles, ajustes |

### 2.3 Gates que la nueva imagen debe seguir pasando

| Gate | Qué comprueba | Consecuencia para el cambio |
|---|---|---|
| `palette.test.ts` | `palette.ts` ≡ `preset.cjs` | Un token nuevo se toca **en los dos** ficheros en el mismo commit |
| `a11y.test.ts` (escáner) | Ningún `className` con color fuera de la paleta y **cada par texto/fondo ≥ 4,5:1** (ratio exacto) | Los pares nuevos se declaran en `DECLARED_TEXT_ON_BACKGROUND` |
| axe + Playwright | **16/16** rutas × `chromium`/`mobile` sin violaciones critical/serious | Las rutas nuevas añaden su entrada al spec |
| `manuals-sync` / documentación | Manuales y docs declarativos sincronizados | La guía de estilo se actualiza en `docs/DISENO-UX.md` y `docs/ACCESIBILIDAD-WCAG.md` |

> **Conclusión de la línea base**: aquí no se diseña sobre papel. Cualquier token nuevo es un cambio
> de código con **guardián**; la propuesta se entrega como valores medidos y rutas exactas a tocar.

---

## 3. Propuesta de imagen visual

### 3.1 Concepto: «Mediterráneo editorial» con un segundo registro nocturno

Se conserva el concepto vigente (arena cálida + teal profundo + terracota de acento + serif óptico) y
se le añade lo que el documento aporta bien: **un registro oscuro marino** para los momentos
editoriales (hero de la home, pie, cabecera de administración, modales de confirmación) y **un dorado
pálido** para el detalle de lujo. La personalidad resultante:

- **Luz**: arena (`sand`) como lienzo; `shell` para tarjetas; el producto respira en claro.
- **Profundidad**: `sea`/`sea-deep` para acción y confianza; **`ocean`** para las superficies oscuras
  que hoy no existen.
- **Calor**: `terracotta` **solo como relleno de atención**; `terracotta-text` cuando es texto.
- **Detalle**: `gold` en superficies claras (con `ink` encima), **`champagne`** sobre oscuro.
- **Nunca**: texto champagne sobre claro, terracota clara como base interactiva, ni un tercer sistema de
  tokens en paralelo.

### 3.2 Paleta por roles semánticos

#### 3.2.1 Roles (mapeo completo)

| Rol semántico | Token | Valor | Uso | Contraste medido |
|---|---|---|---|---|
| `background` | `sand` | `#FBF6EC` | Lienzo de página | — |
| `background-alt` | `sand-2` | `#F3EAD8` | Bandas, estados, filas alternas | — |
| `surface` | `shell` | `#FFFFFF` | Tarjetas, formularios, modales | — |
| `surface-dark` **(nuevo)** | `ocean` | `#0F2C3F` | Hero, pie, cabecera de administración | 13,42:1 con arena · 14,46:1 con blanco |
| `surface-dark-alt` **(nuevo)** | `ocean-soft` | `#16455E` | Hover de superficie oscura, tarjetas sobre `ocean` | 4,54:1 con champagne |
| `text-primary` | `ink` | `#1B2327` | Texto principal | 14,31:1 sobre arena (doc. oficial 14,0:1) |
| `text-secondary` | `ink-soft` | `#4C575C` | Texto secundario, ayudas | **6,90:1** sobre arena |
| `text-muted` **(nuevo)** | `ink-disabled` | `#9AA3A8` | Placeholder/deshabilitado | 2,57:1 — **exento** por WCAG 2.1 · 1.4.3 |
| `text-inverse` | `shell` / `sand` | `#FFFFFF` / `#FBF6EC` | Texto sobre `ocean`/`sea` | 14,46:1 / 13,42:1 |
| `border` / `divider` | `line` | `#E7DCC6` | Filetes **decorativos** | exento (no identifica controles) |
| `border-strong` **(nuevo)** | `line-strong` | `#8F7F5F` | **Borde de controles** (input/select/textarea) | 3,91:1 blanco · 3,63:1 arena · 3,27:1 arena-2 ✅ (1.4.11) |
| `primary-brand` / `interactive` | `sea` | `#0E5A63` | CTA, enlaces, foco | 7,2:1 con blanco |
| `interactive-hover` / `active` | `sea-deep` | `#08424A` | Hover/pulsado | >9:1 con blanco |
| `focus-ring` | `sea` + anillo `sand-2` | — | Foco visible (doble anillo) | ≥3:1 contra ambos adyacentes |
| `accent-fill` | `terracotta` | `#C0542E` | Badge/relleno con **texto blanco** | **4,62:1** ✅ |
| `accent-text` | `terracotta-text` | `#A8431F` | Acento como texto (eyebrow, error) | 6,02:1 blanco · 5,59:1 arena |
| `premium-light` | `gold` | `#C68A2E` | Estrellas/detalle sobre claro, **con `ink` encima** | 2,97:1 sobre blanco (solo decorativo) · 5,38:1 sobre `ink` |
| `premium-dark` **(nuevo)** | `champagne` | `#C5A880` | Filetes, iconos, estrellas **sobre oscuro** | 6,39:1 sobre `ocean` |
| `decorative-sage` | `olive` | `#5E6B45` | Estado «disponible», etiquetas | 5,73:1 con blanco |
| `success` / `success-bg` **(nuevos)** | — | `#2F6B4F` / `#E3EFE7` | Confirmaciones | 6,29:1 blanco sobre relleno |
| `warning` / `warning-bg` **(nuevos)** | — | `#8A5A12` / `#F7E9C9` | Avisos (ventana corta, stock) | 5,49:1 sobre arena |
| `error` / `error-bg` **(nuevos)** | — | `#9E2B1F` / `#F8E3DE` | Errores, bloqueos | 7,45:1 blanco sobre relleno |
| `info` / `info-bg` **(nuevos)** | — | `#14556B` / `#DCEAF1` | Información, ayuda | 7,67:1 sobre arena |
| `scrim` **(nuevo)** | `ocean` al 65 % | `rgba(15,44,63,.65)` → `#637682` sobre blanco | Velo del hero para texto | **4,73:1** con blanco ✅ |

#### 3.2.2 Tokens vigentes (sin cambios) y nuevos (aditivos)

| Sistema vigente (se mantiene tal cual) | HEX | HSL |
|---|---|---|
| `sand` | `#FBF6EC` | hsl(40 65% 95%) |
| `sand-2` | `#F3EAD8` | hsl(40 53% 90%) |
| `shell` | `#FFFFFF` | hsl(0 0% 100%) |
| `line` | `#E7DCC6` | hsl(40 41% 84%) |
| `ink` | `#1B2327` | hsl(200 18% 13%) |
| `ink-soft` | `#4C575C` | hsl(199 10% 33%) |
| `sea` | `#0E5A63` | hsl(186 75% 22%) |
| `sea-deep` | `#08424A` | hsl(187 80% 16%) |
| `terracotta` | `#C0542E` | hsl(16 61% 47%) |
| `terracotta-text` | `#A8431F` | hsl(16 69% 39%) |
| `olive` | `#5E6B45` | hsl(81 22% 35%) |
| `gold` | `#C68A2E` | hsl(36 62% 48%) |

| Token nuevo | HEX | HSL | Rol |
|---|---|---|---|
| `ocean` | `#0F2C3F` | hsl(204 62% 15%) | Superficie oscura editorial |
| `ocean-soft` | `#16455E` | hsl(201 62% 23%) | Superficie oscura secundaria / hover |
| `champagne` | `#C5A880` | hsl(35 37% 64%) | Detalle premium **sobre oscuro** |
| `line-strong` | `#8F7F5F` | hsl(38 19% 47%) | Borde de controles (1.4.11) |
| `ink-disabled` | `#9AA3A8` | hsl(201 7% 63%) | Placeholder/deshabilitado (exento) |
| `success` / `success-bg` | `#2F6B4F` / `#E3EFE7` | hsl(152 39% 30%) / hsl(140 27% 91%) | Estado correcto |
| `warning` / `warning-bg` | `#8A5A12` / `#F7E9C9` | hsl(36 77% 31%) / hsl(42 74% 88%) | Aviso |
| `error` / `error-bg` | `#9E2B1F` / `#F8E3DE` | hsl(6 67% 37%) / hsl(12 65% 92%) | Error |
| `info` / `info-bg` | `#14556B` / `#DCEAF1` | hsl(195 69% 25%) / hsl(200 43% 90%) | Información |

> La tabla completa de los **32 pares medidos** (con veredicto AA/AAA y uso previsto) la genera el
> instrumento: `node scripts/design/contrast-audit.mjs`. Es reproducible y no requiere dependencias.

### 3.3 Los seis hallazgos medidos (y su corrección exacta)

| # | Par | Ratio | Veredicto | Corrección propuesta |
|---|---|---|---|---|
| H-1 | Terracota del documento `#C86446` como **botón** con texto blanco | 3,91:1 | ❌ AA | Usar el `terracotta` **vigente** `#C0542E` (**4,62:1**) como relleno |
| H-2 | Terracota del documento `#D96B43` como botón | 3,42:1 | ❌ AA | Descartar el tono claro para interacción |
| H-3 | Terracota del documento como **texto** sobre arena/blanco | 3,56:1 / 3,91:1 | ❌ AA | Usar `terracotta-text` `#A8431F` (**5,59:1** arena, 6,02:1 blanco) |
| H-4 | **Champagne** como texto sobre blanco/arena | 2,26:1 / 2,06:1 | ❌ AA | Champagne **solo** sobre `ocean`/`ocean-soft` (6,39:1 / 4,54:1); estrellas en claro con `gold` + `ink` encima |
| H-5 | Gris secundario `#6B7280` sobre arena | 4,40:1 | ❌ AA (por 0,1) | No introducirlo: `ink-soft` `#4C575C` da **6,90:1** |
| H-6 | Velo del hero al 55 % → texto blanco | 3,52:1 | ⚠️ solo texto grande | **Velo al 65 %** (`#637682`) → **4,73:1** ✅, o 70 % (5,55:1) para AAA |
| **H-7** | **Bordes de formulario actuales** (`border-line` `#E7DCC6` sobre `sand`/`shell`) | **~1,10:1** | ❌ **WCAG 2.1 · 1.4.11** (contraste de componentes) | ✅ **Implementado** (Fase A.2): token `line-strong` `#8F7F5F` (**3,27–3,91:1**) en los **89 controles** con frontera y las **11** constantes `FIELD`; `line` se queda para filetes decorativos. Guardián nuevo `control-boundary.test.ts` (deriva del contraste medido qué tokens pueden ser frontera, exige `line-strong` por defecto y **se comprobó en falso**: un control con `border-line` lo pone rojo) |
| **H-8** | Botones/enlaces «fantasma» (`border-line` sobre blanco/arena) — **27** elementos en 24 ficheros | ~1,10:1 | ⚠️ **observado, no exigido** | 1.4.11 se aplica a la información visual *necesaria para identificar* el componente y un botón con etiqueta visible se identifica por su texto; el foco (2.4.11) cumple con el doble anillo. Si se quiere más afordancia, la palanca es aplicar `line-strong` también ahí (cambio visible en 27 elementos) |

> **H-7 es un hallazgo nuevo, no del documento**: axe no lo detecta (los controles tienen etiqueta y
> foco correctos) y el escáner propio mide pares texto/fondo, no **límites de componente**. Es la
> mejora de accesibilidad más tangible de esta propuesta y se puede **verificar en CI** con una prueba
> nueva (medir el borde de los controles ≥ 3:1), no con una opinión.

### 3.4 Tipografía

**Se mantiene la pareja vigente** y se cierra el hueco del ruso sin cambiar la cara ES/EN:

| Nivel | Familia | Tamaño (rem / px) | Peso | Line-height | Letter-spacing | Uso |
|---|---|---|---|---|---|---|
| `display` | Fraunces (opsz alto) | `clamp(2.8rem, 1.7rem + 4.4vw, 5rem)` / 45→80 | 600 | 0,98 | −0,03em | Hero de la home |
| `h1` | Fraunces | `clamp(2.3rem, 1.55rem + 3.2vw, 4.1rem)` / 37→66 | 600 | 1,04 | −0,02em | Título de página (ya existe) |
| `h2` | Fraunces | `clamp(1.6rem, 1.25rem + 1.6vw, 2.2rem)` / 26→35 | 600 | 1,10 | −0,01em | Secciones (ya existe) |
| `h3` | Fraunces | `1.3rem` / 21 | 600 | 1,20 | 0 | Subtítulos (ya existe) |
| `h4` **(nuevo)** | Hanken Grotesk | `1.075rem` / 17 | 600 | 1,30 | 0 | Cabecera de tarjeta |
| `body-lg` **(nuevo)** | Hanken Grotesk | `1.1875rem` / 19 | 400 | 1,55 | 0 | Entradilla editorial |
| `body` | Hanken Grotesk | `1.0625rem` / 17 | 400 | 1,50 | 0 | Texto base (ya existe) |
| `body-sm` **(nuevo)** | Hanken Grotesk | `0.95rem` / 15 | 400 | 1,50 | 0 | Tablas densas de personal |
| `small` | Hanken Grotesk | `0.9rem` / 14 | 400 | 1,45 | 0 | Ayudas (ya existe) |
| `caption` **(nuevo)** | Hanken Grotesk | `0.82rem` / 13 | 400 | 1,40 | 0,01em | Pie de foto, metadatos |
| `overline` **(nuevo)** | Hanken Grotesk | `0.78rem` / 12,5 | 600 | 1,40 | **0,14em** | *Eyebrow* en mayúsculas |
| `micro` | Hanken Grotesk | `0.78rem` / 12,5 | 500 | 1,40 | 0,04em | Etiquetas (ya existe) |
| `code` **(nuevo)** | `ui-monospace, SFMono-Regular, monospace` | `0.9rem` / 14 | 400 | 1,45 | 0 | Hash, `tokenId`, direcciones |

**Cascada cirílica (la corrección real).** Evidencia medida contra la API de Google Fonts:

| Familia | Subsets publicados | ¿Cubre el ruso (U+0400–045F)? |
|---|---|---|
| **Fraunces** (display vigente) | latin, latin-ext, vietnamese | **No** ❌ |
| **Hanken Grotesk** (UI vigente) | cyrillic-ext, latin, latin-ext, vietnamese | **No** (solo el bloque extendido U+0460–052F) ⚠️ |
| Playfair Display | **cyrillic**, latin, latin-ext, vietnamese | Sí ✅ |
| Cormorant Garamond | **cyrillic**, cyrillic-ext, latin, latin-ext, vietnamese | Sí ✅ |
| Inter | **cyrillic**, cyrillic-ext, greek, latin, latin-ext, vietnamese | Sí ✅ |
| Plus Jakarta Sans | cyrillic-ext, latin… | Solo extendido ⚠️ |
| **Outfit** | latin, latin-ext | **No** ❌ |

Hoy, con `subsets: ["latin"]`, **el locale RU cae a `Georgia`/`system-ui`** en titulares y cuerpo,
mientras el producto declara paridad ES/EN/RU (1.181 claves por idioma). Propuesta:

1. Añadir en `apps/web/src/app/layout.tsx` dos familias **solo para el subconjunto cirílico**, con
   `preload: false` (no penalizan el LCP de ES/EN): `Playfair_Display({ subsets: ["cyrillic"] })` e
   `Inter({ subsets: ["cyrillic"] })`.
2. Extender las pilas en `preset.cjs`:
   - `display: [var(--font-fraunces), var(--font-playfair), Georgia, serif]`
   - `sans: [var(--font-hanken), var(--font-inter), system-ui, …]`
3. El navegador resuelve **glifo a glifo**: ES/EN siguen viendo Fraunces/Hanken; el ruso toma
   Playfair/Inter. Se documenta como decisión (tipografía mixta intencionada) y se añade una prueba de
   presencia de los `unicode-range` cirílicos en el CSS construido.
4. **Alternativa** si se prefiere una sola familia por rol: cambiar la pareja a Playfair Display +
   Inter (ambas OFL, sin coste de licencia). Implica revisar todas las páginas (la personalidad
   tipográfica cambia) — decisión del §6.

### 3.5 Espaciado, radios, elevación y rejilla

| Escala | Valores | Nota |
|---|---|---|
| Espaciado (base 4px) | 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96 | Se añaden 24/32/48/96 a la doc vigente (ya existen en Tailwind) |
| Radios | `brand-xs` **(nuevo)** 6px · `brand-sm` 10 · `brand` 16 · `brand-lg` 22 · `pill` 999 | `brand-xs` para chips, badges y campos densos de personal |
| Elevación | `elev-0` sin sombra · `elev-1` card · `elev-2` card-hover · `elev-3` sticky/sidebar · `elev-4` modal | Se **nombran** las tres sombras actuales y se añade la del resumen flotante (reutiliza `card-hover`) |
| Rejilla | Móvil 1 col (<768) · Tablet 2 col (768–1023) · Desktop 3 col (≥1024) · contenido ≤ 66ch | Se mantiene (RNF-01) y se añade `max-w-7xl` para el hero a sangre |
| Motion | `cubic-bezier(.21,.68,.27,.99)`, revelado escalonado ≤0,6 s, hover −5px + zoom de foto, `prefers-reduced-motion` respetado | Se mantiene; el hero admite *cross-fade* de 8 s **sin vídeo** por presupuesto de LCP |

### 3.6 Modo noche (el documento lo pide para la «app»)

Se **propone y se difiere**: un tema `night` para las suites de personal con turno nocturno
(housekeeping/mantenimiento), definido como juego de tokens (`data-theme="night"`:

`surface #0B1F2C`, `surface-alt #12303F`, `text #E8EEF1`, `text-soft #AFC0C8`, `border #1E4356`,
`primary #4FA3AC`). **No entra en la Fase A** porque multiplica la matriz de pares a verificar
(32 → ~64) y el escaneo axe por tema. Se decide en el §6.

### 3.7 Inventario de componentes (Atomic Design)

| Nivel | Componentes | Estado |
|---|---|---|
| **Átomos** | `Button` (primary/ghost/danger, 3 tamaños), `Link`, `Badge` (reventa, estado, tipo), `Chip`, `Input`, `Select`, `Textarea`, `Checkbox`, `Toggle`, `Stars` (calificación), `Divider`, `Icon` (trazo 1,5 px), `Skeleton`, `Spinner`, `Money` (ETH/EUR) | Existen casi todos; **faltan** `Stars`, `Skeleton`, `Divider` con champagne y los estados `success/warning/error/info` con tokens propios |
| **Moléculas** | `Field` (label+ayuda+error), `SearchBar`, `FilterBar` (catálogo y reventa), `DateRangePicker`, `GuestSelector`, `NightCard` (vertical), `SuiteCard` (**horizontal**, nuevo), `ExperienceCard` (nuevo), `TestimonialCard` (nuevo), `ReservationSummary`, `OTPStep`, `QRPanel`, `LiveBadge` (SSE), `RoomStatusChip`, `SupplyRow`, `IncidentRow`, `ChartCard` | Faltan los cuatro marcados «nuevo» y `Stars` |
| **Organismos** | `SiteHeader`, `PublicShell`, `Footer`, `Hero` (nuevo), `BookingBar` (flotante, nuevo), `StickySummary` (nuevo), `ExperiencesGrid`, `SuitesCatalog`, `ReviewsWall`, `ContactMap`, `WalletMenu`, `AdminSidebar`, `DayBoard`, `HousekeepingBoard`, `MaintenanceBoard`, `DashboardCharts`, `ImageGalleryAdmin`, `ContentAdmin`, `DataTable` (densa, nueva) | Faltan los tres del flujo público y `DataTable` |
| **Plantillas** | `PublicShell` (pública), `FrontOfficeShell` (recepción), `StaffShell` (housekeeping/mantenimiento, móvil), `AdminLayout` (sidebar derecha en acordeón) | Existen las cuatro |
| **Páginas** | 38 rutas (§7.3) | — |

**Estados obligatorios por componente**: default, hover, focus-visible, active, disabled, loading,
error, vacío y **degradado** (cuando una lectura on-chain/worker falla: el producto ya lo declara y la
nueva imagen debe conservarlo). Área táctil ≥ 44×44 px en todas las acciones (ya existe `min-h-touch`).

### 3.8 Aplicación por suite

| Suite | Registro visual | Piezas clave |
|---|---|---|
| **Pública** | **Editorial, luminoso, con un hero oscuro marino** | `Hero` a sangre con velo `ocean` 65 % y titular Fraunces; `BookingBar` flotante (fechas + huéspedes + «Ver disponibilidad») que se pega al scroll; experiencias en rejilla asimétrica; suites en tarjeta horizontal con galería en la propia página; reseñas con `Stars`; contacto con mapa OSM |
| **Recepción** | Claro, **denso y de alta legibilidad** | `DayBoard` con 50 habitaciones, `RoomStatusChip` por estado operativo, tabla de reservas con `body-sm`, check-in con `QRPanel` y confirmación con el hash del ancla; nunca modo oscuro |
| **Housekeeping** | Móvil, **un toque por acción**, y **modo noche** si se aprueba | Tablero con `LiveBadge`, tarjeta de habitación con acciones grandes, lencería con `warning`/`error` |
| **Mantenimiento** | Móvil, funcional | Lista de incidencias con prioridad por color (`error`/`warning`/`olive`), tareas vencidas, reporte con foto |
| **Administración** | **Sidebar oscura (`ocean`)** y contenido claro | Navegación en acordeón, dashboard con `DashboardCharts`, formularios con `line-strong`, ajustes, roles, contenido |

### 3.9 Paleta de gráficas (dashboard, recharts)

Las series no pueden ser champagne ni dorado (fallan sobre blanco). Orden categórico propuesto —
**`sea` → `terracotta` → `olive` → `gold` → `ocean-soft` → `info`** — con `line` para la rejilla y
`ink-soft` para las etiquetas; cada gráfica conserva `role="img"`, nombre accesible y **tabla de datos
equivalente** (ya implementado). Se documenta el orden en la guía de estilo para que un cambio de
gráfica no introduzca un color fuera de paleta (el guardián actual solo mira `className`).

### 3.10 Tratamiento fotográfico y piezas de marca a regenerar

- **Fotografía**: luz natural cálida (hora mágica), encuadres con aire, sin saturación artificial;
  relación 3:2 para suites y 16:9 para el hero; `loading="lazy"` fuera del primer viewport.
- **Piezas a regenerar con los tokens nuevos** (hoy usan la paleta vigente): `docs/imagenes/*.svg`
  (8 infografías + portada), `docs/ux-mockups/catalogo.html`, la imagen OG/metadata y las capturas de
  los manuales. Se mantiene el criterio de nombres de D-66 (`hotel-<seccion>-<fecha>-<n>`).

---

## 4. Qué **no** se adopta de la propuesta (y por qué)

| Descartado | Motivo |
|---|---|
| Sustituir la paleta vigente por la del documento | Perdería AA en 5 pares y obligaría a tocar 242 usos de color + imágenes + axe, sin ganancia medida |
| Terracotas claras (`#C86446`, `#D96B43`) como color interactivo | 3,12–3,91:1 ❌ |
| Champagne como texto sobre claro | 2,06–2,26:1 ❌ |
| `#6B7280` como secundario | 4,40:1 sobre arena ❌ (y hay uno mejor ya en uso) |
| Radios 8–12 / 16–24 | El sistema vigente ya tiene 10/16/22 y está aplicado; cambiarlo no aporta |
| Escala de 8pt | El proyecto usa 4px y 2 breakpoints propios |
| Outfit como tipografía de cuerpo | Sin cirílico ❌ |
| Figma como Fase 1 del desarrollo | Los tokens viven en código con guardianes; un Figma paralelo se desincroniza |
| App móvil nativa (llave NFC, butler chat, spa, náutica) | 3.ª versión (D-49/D-50) y sin dominio de negocio en el modelo |
| Vídeo de fondo en el hero | Coste de LCP y datos; se resuelve con imagen + velo y *cross-fade* |

---

## 5. Hoja de ruta de implementación

| Fase | Alcance | Ficheros exactos | Gate de cierre | Esfuerzo |
|---|---|---|---|---|
| **A · Tokens** | Añadir `ocean`, `ocean-soft`, `champagne`, `line-strong`, `ink-disabled`, estados y `scrim`; declarar los pares nuevos | `packages/config/tailwind/preset.cjs`, `apps/web/src/lib/a11y/palette.ts` (**mismo commit**), `apps/web/src/app/globals.css`, `docs/DISENO-UX.md` §2.1, `docs/ACCESIBILIDAD-WCAG.md` | `palette.test.ts` + `a11y.test.ts` en verde (ratio exacto) | **S** |
| **A.2 · Controles (H-7)** | `line-strong` en `input`/`select`/`textarea` (no en filetes decorativos) + **prueba nueva** de contraste de borde de componente ≥ 3:1 | ~40 componentes con `border-line` en controles + `apps/web/src/lib/a11y/a11y.test.ts` | Prueba nueva en verde y axe 16/16 | **M** |
| **B · Tipografía cirílica** | Cascada `Playfair Display` + `Inter` (subconjunto `cyrillic`, `preload:false`) y pilas en el preset; niveles `display`, `h4`, `body-lg`, `body-sm`, `caption`, `overline`, `code` | `apps/web/src/app/layout.tsx`, `packages/config/tailwind/preset.cjs`, `docs/DISENO-UX.md` §2.2 | Prueba que verifica los `unicode-range` cirílicos en el CSS construido; RU sin fallback | **S–M** |
| **C · Componentes** | `Hero`, `BookingBar`, `StickySummary`, `SuiteCard`, `ExperienceCard`, `TestimonialCard`, `Stars`, `DataTable`, `Divider` champagne | `apps/web/src/components/**` (nuevos + `HomeSections`, `/catalogo`, `/reservar`) | `next build` + axe de las rutas tocadas + pruebas de las funciones puras | **L** |
| **D · Marca y piezas** | Regenerar SVG, mockup del catálogo, OG y capturas de manuales; guía de arte fotográfico | `docs/imagenes/*`, `docs/ux-mockups/catalogo.html`, metadata de `layout.tsx` | Revisión visual + axe | **M** |
| **E · Manual y cierre** | `RepoTecnico/Manual_Identidad_Visual.md` (Fase 3 del skill) con tokens, componentes, do's & don'ts y pares aprobados/prohibidos; derivación a `@manuales` si se pide | `RepoTecnico/Manual_Identidad_Visual.md`, `estado_proyecto.md` | Manual completo + estado actualizado | **M** |

**Orden recomendado**: A → A.2 → B (bajo riesgo, alto valor) y después C/D según la respuesta del §6.
Ninguna fase cambia lógica de negocio ni el modelo de datos: **la base de datos no se toca** (los tres
artefactos de datos siguen sincronizados sin cambios).

---

## 6. Decisiones de calibración (**APROBADAS el 2026-09-27**)

| # | Pregunta | Decisión del responsable | Consecuencia |
|---|---|---|---|
| 1 | Base cromática | **Evolución aditiva** ✅ | Los 12 tokens vigentes no cambian; se añaden `ocean`, `ocean-soft`, `champagne`, `line-strong` y los estados. Cero retrabajo en imágenes/guardianes |
| 2 | Ámbito | **Las 5 suites** ✅ | La imagen nueva cubre pública + recepción + housekeeping + mantenimiento + administración (§3.8) |
| 3 | Tipografía y ruso | **Cascada cirílica** ✅ | Fraunces/Hanken siguen para ES/EN; `Playfair Display` + `Inter` (subconjunto `cyrillic`, `preload:false`) cubren el ruso glifo a glifo (§3.4) |

*Pregunta secundaria pendiente (no bloquea A–B):* ¿se aprueba el **modo noche** para las suites de
personal (§3.6), con su coste de duplicar la matriz de contraste y el escaneo?

### 6.1 Estado de implementación de la hoja de ruta

| Fase | Estado | Evidencia |
|---|---|---|
| **A · Tokens** | ✅ **Implementada** (2026-09-27) | `packages/config/tailwind/preset.cjs` (13 colores nuevos, 7 niveles tipográficos, `brand-xs`), espejo `apps/web/src/lib/a11y/palette.ts` (+24 pares declarados), `globals.css` (`:root`), `docs/DISENO-UX.md` §2.1–2.3, `docs/ACCESIBILIDAD-WCAG.md` §0. Verificado: `a11y.test.ts` **17/17** (incluye la igualdad preset↔palette y el contraste de todos los pares declarados) |
| **B · Cascada cirílica** | ✅ **Implementada** | `apps/web/src/app/layout.tsx` (Playfair Display + Inter con `subsets:["cyrillic"]`, `preload:false`), pilas en el preset y en `globals.css`. Guardián nuevo `cyrillic-fonts.test.ts` **4/4** |
| **A.2 · Controles (H-7)** | ✅ **Implementada** (2026-09-27) | `line-strong` en los **89 controles** con borde y las **11** constantes `FIELD` (**28 ficheros**, codemod que solo toca etiquetas de control: los 184 filetes decorativos quedan intactos) + guardián nuevo `control-boundary.test.ts` **5/5** (con falsificación: un `border-line` en un control lo pone rojo) |
| **C · Componentes** | ✅ **Fase C COMPLETA** (C.1, C.2 y C.3, 2026-09-27): `Hero` (foto a sangre + velo `ocean/65`), `Stars`, `SuiteCard` horizontal, `ExperienceCard`, `TestimonialCard`, **`BookingBar`** (flotante en la home y en línea en el catálogo, con búsqueda transportada en la URL), **`StickySummary`** en `/reservar` con el importe convertido con la **misma tasa** que el cobro y **`DataTable`** (tabla densa de las suites de personal, migrada en `/admin/mantenimiento/incidencias`) | `@hotel/web` **478 → 504 pruebas**; guardianes nuevos de **paridad i18n** y **semántica de tablas**; **12 pruebas** de reglas de reserva con convergencia comprobada contra el servidor |
| **D · Marca y piezas** | ✅ **Implementada** (2026-09-27): **vista previa social generada en código** (`app/opengraph-image.tsx`, 1200×630 con `ocean`/`champagne`/arena, más `og:*` y `twitter:card` en el `<head>` y `NEXT_PUBLIC_SITE_URL` documentada); registro marino en la **portada** y en los títulos de las pantallas de recepción/reventa; **maqueta del catálogo** al día (tokens nuevos, hero oscuro y barra de reserva) | `@hotel/web` **504 → 510 pruebas**; guardián nuevo `brand-pieces.test.ts` **6/6** (HEX derivados del preset, `role="img"`+`<title>` por pieza, OG en código y variables de la maqueta); verificado en producción: `/opengraph-image` responde **200 `image/png` 1200×630 (105 KB)** con el `<head>` declarando `og:image` |
| **E · Manual de identidad** | ✅ **Implementada** (2026-09-27): [`Manual_Identidad_Visual.md`](./Manual_Identidad_Visual.md) v1.0.0 con brief y concepto, guía de estilo (roles con HEX/HSL y ratios), tokens rol→valor→uso→código, inventario por Atomic Design, directrices de implementación, do's & don'ts, accesibilidad (pares aprobados y **prohibidos con su ratio**) y changelog | **Ciclo cerrado**: las tablas se derivan del código (preset + espejo + guardianes), no se transcriben; los 6 guardianes visuales y el instrumento de contraste siguen en verde |

| **F · Aplicación al producto** | ✅ **Implementada** (2026-09-27): el registro marino entra en el **sidebar de administración** (`bg-ocean`, enlaces `text-sand`, secciones `champagne`, activo como pastilla `bg-shell text-ocean`) y los **30 estilos de estado improvisados** (18 ficheros) pasan a los tokens semánticos (`error`, `success`, `warning` con sus fondos) | `@hotel/web` **510 pruebas** y los 4 guardianes de accesibilidad en verde; par nuevo declarado (`ocean` sobre `shell`, 14,46:1) |

### 6.2 Hallazgos destapados por los guardianes nuevos (Fase C)

| # | Hallazgo | Cómo se detectó | Corrección |
|---|---|---|---|
| C-1 | **`text-caption` y `text-body-lg` se leían como colores desconocidos**: la escala tipográfica nueva (Fase A) comparte la forma `text-<token>` con los colores y el escáner de accesibilidad no la conocía; en cuanto un componente la usó (Fase C) la denunció | `a11y.test.ts` («ningún componente usa un color que no exista en la paleta») | Los niveles de `fontSize` entran en la lista de no-colores, y una **prueba nueva deriva esa lista del preset real**: un nivel futuro queda cubierto solo |
| C-2 | **La paridad i18n no estaba verificada por ninguna prueba**: se comprobaba a mano en cada incremento | Guardián nuevo `i18n-parity.test.ts` | 1.201 claves idénticas en ES/EN/RU, sin traducciones en blanco y con **los mismos marcadores de interpolación**; destapó dos defectos reales: `admin.expiredManual` no decía «hasta {max}» en EN/RU y `assistant.handoff.insufficientBalance` perdía `{have}` y `{need}` en EN/RU (el importe disponible y el necesario no se mostraban). Ambos corregidos |
| C-3 | **El resumen podía separarse del cobro**: el precio por noche solo lo calculaba el servidor al retener, así que cualquier resumen previo habría sido una estimación propia | Prueba de **convergencia** en `booking.test.ts` | `/api/public/rooms` publica `perNightCents` con la **misma tasa** que `POST /api/public/reservations`, y una prueba **cruza** `nightsCount` (cliente) con `nightsBetween` (servidor) en cuatro rangos, incluidos cambios de año y de mes |
| C-4 | **6 de 13 tablas no tenían nombre accesible**: el producto declaraba `scope` en casi todas, pero sin `<caption>` (ni `aria-label`) un lector de pantalla no sabe qué tabla está leyendo | Guardián nuevo `table-semantics.test.ts`, que **deriva la regla de todas las tablas del producto** | Las seis reciben su `<caption>` (`maintenance` ×2, `activities` ×2, `rooms`, `reception`) con claves nuevas en ES/EN/RU; `IncidentsAdmin` migra a `DataTable` y deja de pintar la tabla a mano. El guardián se **falsificó** (quitar un caption lo pone rojo con fichero y etiqueta) |

---

## 7. Anexos

### 7.1 Instrumento de medición

```bash
node scripts/design/contrast-audit.mjs          # tablas Markdown de los 3 conjuntos de paleta y 32 pares
node scripts/design/contrast-audit.mjs --json   # además, volcado JSON para reutilizar en pruebas
```

Misma matemática que `apps/web/src/lib/a11y/contrast.ts` (luminancia relativa + ratio **sin**
redondear), sin dependencias. Los pares por debajo de AA se listan al final con su uso previsto.

### 7.2 Evidencia de cobertura tipográfica (Google Fonts metadata)

`https://fonts.google.com/metadata/fonts` → campo `subsets` por familia:

| Familia | Subsets |
|---|---|
| Fraunces | `latin, latin-ext, vietnamese` |
| Hanken Grotesk | `cyrillic-ext, latin, latin-ext, vietnamese` |
| Playfair Display | `cyrillic, latin, latin-ext, vietnamese` |
| Cormorant Garamond | `cyrillic, cyrillic-ext, latin, latin-ext, vietnamese` |
| Inter | `cyrillic, cyrillic-ext, greek, greek-ext, latin, latin-ext, vietnamese` |
| Plus Jakarta Sans | `cyrillic-ext, latin, latin-ext, vietnamese` |
| Outfit | `latin, latin-ext` |

Todas las familias propuestas son **open source (SIL OFL)** y ya se sirven con `next/font` (sin CDN
externo en runtime, coherente con la CSP del proyecto).

### 7.3 Inventario de rutas por suite (38)

- **Pública (12)**: `/`, `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`, `/mis-noches/mis-reventas`,
  `/checkin`, `/historico`, `/asistente`, `/ayuda`, `/ayuda/[slug]`, `/privacidad`, `/terminos`.
- **Recepción (2)**: `/recepcion`, `/recepcion/reservas`.
- **Housekeeping (2)**: `/housekeeping`, `/admin/housekeeping/lenceria`.
- **Mantenimiento (3)**: `/mantenimiento`, `/admin/mantenimiento/incidencias`, `/admin/mantenimiento/preventivo`.
- **Administración (17)**: `/admin`, `/admin/dashboard`, `/admin/mint`, `/admin/habitacion`, `/admin/actividades`,
  `/admin/caducadas`, `/admin/contenido`, `/admin/fondos`, `/admin/pausa`, `/admin/resenas`, `/admin/roles`,
  `/admin/royalty`, `/admin/seguridad` y `/admin/sistemas/{,ajustes,contratos,finanzas,operaciones,usuarios}`.

### 7.4 Trazabilidad de esta propuesta

| Decisión del proyecto | Cómo la respeta la propuesta |
|---|---|
| D-11/D-16/D-75 (accesibilidad y escaneo axe) | Todo par nuevo se mide y se declara; H-7 añade verificación de contraste de componentes |
| D-29/D-32/D-62/D-63 (shells de suites) | Cada shell conserva su registro: pública editorial, recepción clara y densa, personal móvil, administración con sidebar oscura |
| D-49/D-50 (app nativa 3.ª versión) | La parte móvil del documento se convierte en guía para las rutas web responsive de personal; lo nativo queda fuera |
| D-66 (nombres de imágenes) | Las piezas regeneradas mantienen el criterio `hotel-<seccion>-<fecha>-<n>` |
| ADR-23 (verificabilidad) | Instrumento + 32 pares medidos + comandos reproducibles, no afirmaciones de estilo |

---

*Propuesta de imagen visual v1.0.0 · @asistenteProyecto + @visualUiUx · entrada:
`propuestaVisual-Hotel.md` · **ciclo cerrado el 2026-09-27**: fases A, A.2, B, C, D y E implementadas
y verificadas; manual de identidad en [`Manual_Identidad_Visual.md`](./Manual_Identidad_Visual.md).*
