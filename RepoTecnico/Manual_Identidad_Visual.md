# Manual de identidad visual — Hotel Marina del Sol

> **Sistema**: «Mediterráneo editorial» con registro marino · **Versión**: 1.0.0 · **Fecha**: 2026-09-27
> **Alcance**: las 5 suites (pública, recepción, housekeeping, mantenimiento, administración) · Web
> responsive (ES/EN/RU). No hay aplicación nativa en esta entrega (3.ª versión, D-49/D-50).
> **Fuentes de verdad** (este manual **no** las sustituye, las explica):
> `packages/config/tailwind/preset.cjs` (tokens) · `apps/web/src/lib/a11y/palette.ts` (espejo medible)
> · `apps/web/src/app/globals.css` (`:root` de runtime) · `docs/DISENO-UX.md` (guía de producto)
> · `RepoTecnico/propuesta_imagen_visual.md` (propuesta y decisiones).
> **Cómo se verifica**: `node scripts/design/contrast-audit.mjs` (32 pares medidos con WCAG 2.1) ·
> `pnpm --filter @hotel/web exec vitest run src/lib` (guardianes de paleta, contraste, frontera de
> controles, tipografía cirílica, tablas, paridad i18n y piezas de marca).
>
> Las tablas de este manual se **derivan del código** (no se transcriben a mano): si un token cambia,
> cambian el preset, el espejo y el guardián — y este documento se actualiza en el mismo commit.

---

## 1. Brief y concepto

**Qué es.** La plataforma de reservas del Hotel Marina del Sol (50 habitaciones, Alicante): noches en
propiedad y trazables, con reserva directa desde la web y suites operativas para el personal.

**Personalidad.** *Lujo sobrio, calidez costera y modernidad atemporal.* La marca no grita: usa la luz
del Mediterráneo (arena), la profundidad del mar (teal y marino) y un acento de atardecer (terracota)
para lo que pide atención. El detalle premium (oro y champagne) aparece poco y bien.

**Tono.** Claro, hospitalario y sin jerga técnica delante del huésped — pero **honesto**: cuando algo
no se puede comprobar (RPC caído, contrato en pausa, tarifa no publicada), la interfaz lo dice; nunca
ofrece una acción que vaya a fallar (ADR-23, D-11).

**Público y contextos de uso.**

| Contexto | Quién | Qué necesita del sistema visual |
|---|---|---|
| Escaparate (`/`, `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`) | Huésped, comprador | Confianza, fotografía, jerarquía editorial, reserva sin fricción |
| Front Office (`/recepcion`) | Recepcionista | Densidad legible, estados claros, tablero del día |
| Housekeeping / Mantenimiento | Personal en movilidad | Un toque por acción, áreas de 44 px, contraste alto |
| Administración (`/admin/**`) | Propietario | Sidebar estable, formularios seguros, cifras verificables |

**Referencias y qué se tomó de cada una.**

| Referencia | Se adoptó | Se descartó |
|---|---|---|
| `RepoTecnico/propuestaVisual-Hotel.md` («Marina Sol») | El **marino editorial** (`ocean`) como superficie oscura, el **champagne** como detalle sobre oscuro, la narrativa de **hero + barra de reserva flotante** y el inventario de componentes de la suite pública | Sus terracotas claras como color interactivo (3,12–3,91:1 ❌), el champagne como texto en claro (2,06–2,26:1 ❌), el gris `#6B7280` sobre arena (4,40:1 ❌), la fuente Outfit (sin cirílico) y la app nativa en esta entrega |
| Sistema vigente «Mediterráneo editorial» | Los **12 tokens originales** (no cambia ninguno), la pareja **Fraunces + Hanken Grotesk**, la escala con `clamp`, los radios y las sombras con tinte teal | Nada: la evolución es **aditiva** |

---

## 2. Guía de estilo

### 2.1 Color por roles semánticos

Los roles son los que usa el código; el **token** es el nombre con el que se escribe la clase
(`bg-ocean`, `text-ink-soft`…).

| Rol | Token | HEX | HSL | Uso |
|---|---|---|---|---|
| `background` | `sand` | `#FBF6EC` | hsl(40 65% 95%) | Lienzo de página |
| `background-alt` | `sand-2` | `#F3EAD8` | hsl(40 53% 90%) | Bandas, filas alternas, estados |
| `surface` | `shell` | `#FFFFFF` | hsl(0 0% 100%) | Tarjetas, formularios, modales |
| `surface-dark` | `ocean` | `#0F2C3F` | hsl(204 62% 15%) | Hero, pie, cabecera de administración |
| `surface-dark-alt` | `ocean-soft` | `#16455E` | hsl(201 62% 23%) | Secundaria oscura, hover sobre oscuro |
| `text-primary` | `ink` | `#1B2327` | hsl(200 18% 13%) | Texto principal |
| `text-secondary` | `ink-soft` | `#4C575C` | hsl(199 10% 33%) | Texto secundario y ayudas |
| `text-inverse` | `shell` / `sand` | `#FFFFFF` / `#FBF6EC` | — | Texto sobre `ocean`/`sea` |
| `border` / `divider` | `line` | `#E7DCC6` | hsl(40 41% 84%) | Filetes **decorativos** (no controles) |
| `border-strong` | `line-strong` | `#8F7F5F` | hsl(40 20% 47%) | **Frontera de controles** (WCAG 1.4.11) |
| `primary-brand` / `interactive` | `sea` | `#0E5A63` | hsl(186 75% 22%) | Acción primaria, enlaces, foco |
| `interactive-hover` | `sea-deep` | `#08424A` | hsl(187 80% 16%) | Hover y pulsado |
| `accent-fill` | `terracotta` | `#C0542E` | hsl(16 61% 47%) | Relleno de atención **con texto blanco** |
| `accent-text` | `terracotta-text` | `#A8431F` | hsl(16 69% 39%) | Acento como **texto** |
| `premium-light` | `gold` | `#C68A2E` | hsl(36 62% 48%) | Detalle sobre claro, **con `ink` encima** |
| `premium-dark` | `champagne` | `#C5A880` | hsl(35 37% 64%) | Detalle **solo sobre oscuro** |
| `sage` | `olive` | `#5E6B45` | hsl(81 22% 35%) | Estado «disponible» |
| `success` / `success-bg` | — | `#2F6B4F` / `#E3EFE7` | hsl(152 39% 30%) / hsl(140 27% 91%) | Confirmaciones |
| `warning` / `warning-bg` | — | `#8A5A12` / `#F7E9C9` | hsl(36 77% 31%) / hsl(42 74% 88%) | Avisos |
| `error` / `error-bg` | — | `#9E2B1F` / `#F8E3DE` | hsl(6 67% 37%) / hsl(12 65% 92%) | Errores y bloqueos |
| `info` / `info-bg` | — | `#14556B` / `#DCEAF1` | hsl(195 69% 25%) / hsl(200 43% 90%) | Información y ayuda |

**Regla de oro del color:** el teal (`sea`) es la **acción**; el terracota (`terracotta` como relleno y
`terracotta-text` como texto) es la **atención**; el marino (`ocean`) es el **registro oscuro**; el
dorado/champagne es **detalle**, nunca texto sobre claro.

### 2.2 Tipografía

- **Display**: `Fraunces` (serif variable, eje óptico) — titulares, precios, nombres de habitación.
- **UI/cuerpo**: `Hanken Grotesk` — navegación, texto, formularios, botones.
- **Cascada cirílica**: `Fraunces` **no publica** el subconjunto `cyrillic` y `Hanken Grotesk` solo el
  *extendido* (sin el rango ruso básico U+0400–045F), así que el locale RU cargaba `Georgia`/`system-ui`.
  Se añaden `Playfair Display` (display) e `Inter` (UI) **solo** con el subconjunto `cyrillic` y
  `preload:false`, **detrás** de la fuente de marca: el navegador resuelve glifo a glifo y ES/EN no
  cambian. Pila: `display: Fraunces → Playfair Display → Georgia, serif`; `sans: Hanken Grotesk →
  Inter → system-ui`.
- **Cuerpo mínimo 16 px** (17 px reales), interlineado 1,5, medida de línea ≤ 66 ch.

| Nivel | Tamaño | Interlineado / tracking | Uso |
|---|---|---|---|
| `display` | `clamp(2.8rem, 1.7rem + 4.4vw, 5rem)` | 0,98 · −0,03em | Hero de la home |
| `h1` | `clamp(2.3rem, 1.55rem + 3.2vw, 4.1rem)` | 1,04 · −0,02em | Título de página |
| `h2` | `clamp(1.6rem, 1.25rem + 1.6vw, 2.2rem)` | 1,10 · −0,01em | Sección |
| `h3` | `1.3rem` | 1,20 | Subtítulo / tarjeta destacada |
| `h4` | `1.075rem` | 1,30 | Cabecera de tarjeta |
| `body-lg` | `1.1875rem` | 1,55 | Entradilla editorial |
| `body` | `1.0625rem` (17 px) | 1,50 | Texto base |
| `body-sm` | `0.95rem` | 1,50 | Tablas densas de personal |
| `small` | `0.9rem` | 1,45 | Ayudas y etiquetas |
| `caption` | `0.82rem` | 1,40 · 0,01em | Pie de foto, metadatos |
| `overline` | `0.78rem` | 1,40 · **0,14em** | *Eyebrow* en mayúsculas |
| `micro` | `0.78rem` | 1,40 · 0,04em | Etiquetas |
| `code` | `0.9rem` | 1,45 · monoespaciada | Hash, `tokenId`, direcciones |

### 2.3 Espaciado, radios, elevación y movimiento

- **Espaciado** (base 4 px): 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96.
- **Radios**: `brand-xs` 6 px (chips y campos densos) · `brand-sm` 10 px · `brand` 16 px ·
  `brand-lg` 22 px · `pill` 9999 px. El **área táctil mínima es 44 px** (`min-h-touch`).
- **Elevación**: `card` (reposo) · `card-hover` (hover y resumen flotante) · `modal` (modales y menús);
  todas con tinte teal. No hay sombras duras ni negras.
- **Movimiento**: `cubic-bezier(.21,.68,.27,.99)`, revelado escalonado ≤ 0,6 s, hover de tarjeta
  `translateY(-5px)` + zoom de foto. **Se respeta `prefers-reduced-motion`** (los retardos también se
  anulan).

### 2.4 Rejilla y breakpoints

| Nombre | Ancho | Catálogo | Suites de personal |
|---|---|---|---|
| Móvil | < 768 px (base 320) | 1 columna | Una tarjeta por pantalla, acciones grandes |
| Tablet | 768–1023 px | 2 columnas | Tablas densas, barra lateral plegable |
| Desktop | ≥ 1024 px | 3 columnas | Sidebar fija, dos columnas de contenido |

Contenido máximo `max-w-6xl` (excepto hero a sangre) y medida de lectura ≤ 66 ch.

### 2.5 Superficies oscuras y velo del hero

- El **hero** es el único bloque oscuro del escaparate: foto a sangre con **velo `bg-ocean/65`**.
  Medido: sobre arena el compuesto es `#62737C` → **4,93:1** con texto blanco y **4,57:1** con arena.
  Al 55 % bajaba a 3,71:1 (solo válido para texto grande) — **no usar menos de 65 %** con texto normal.
- Sin portada en la base, el hero cae a `bg-ocean` plano (13,42:1 con arena) y **no** desaparece.
- El **champagne** solo se usa sobre `ocean`/`ocean-soft` (6,39:1 / 4,54:1); sobre claro **nunca**.

---

## 3. Tokens: dónde viven y cómo se consumen

| Pieza | Fichero | Para qué |
|---|---|---|
| Tokens de Tailwind | `packages/config/tailwind/preset.cjs` | Clases (`bg-sand`, `text-ink-soft`, `text-h4`, `rounded-brand`, `shadow-card`…) |
| Espejo medible | `apps/web/src/lib/a11y/palette.ts` | Tests de contraste y colores de las gráficas (SVG con valores, no clases) |
| Runtime | `apps/web/src/app/globals.css` (`:root`) | Variables CSS (`var(--ocean)`) y estilos base (foco, tipografía, formularios) |
| Tokens de tipografía | `preset.cjs` (`fontSize`, `fontFamily`) + `layout.tsx` (`next/font`) | Escala modular y fuentes |

**Reglas de token:**

1. **Un solo origen**: un color nuevo se declara en el **preset** y en el **espejo** (`palette.ts`) en
   el **mismo commit**; el test `a11y.test.ts` compara los dos objetos y se pone rojo si divergen.
2. **Sin valores mágicos**: ni `#0F2C3F` ni `text-[#123456]` en un componente. Todo sale de un token.
3. **Sin alias redundantes**: si un rol ya tiene token, se usa ese (por eso no hay `--primary` ni
   `--brand-blue`).
4. **Un token nuevo entra con su par**: si se va a usar como texto, se declara la combinación
   texto/fondo en `DECLARED_TEXT_ON_BACKGROUND` (con su ratio medido) en el mismo commit.

**Ejemplos.**

```tsx
// ✅ correcto: rol semántico, frontera de control de 3:1 y foco de marca
<input className="min-h-touch rounded-brand-sm border border-line-strong bg-sand px-3 text-ink" />

// ❌ incorrecto: color fuera de la paleta, frontera decorativa y valor mágico
<input className="border border-[#E7DCC6] bg-[#f5f5f5] text-[#333]" />
```

---

## 4. Inventario de componentes (Atomic Design)

| Nivel | Componentes | Estados obligatorios |
|---|---|---|
| **Átomos** | `Button` (primario/ghost/peligro, 3 tamaños) · `Link` · `Badge` (reventa, tipo, suite) · `Chip` de filtro (`aria-pressed`) · `Input`/`Select`/`Textarea` (frontera `line-strong`) · `Checkbox`/`Toggle` · **`Stars`** (`components/home/Stars.tsx`, `role="img"` + `aria-label`) · `Divider` · `Icon` (trazo 2 px) · `Money` (ETH/EUR) | default · hover · **focus-visible** (doble anillo) · active · **disabled** · loading · error |
| **Moléculas** | `Field` (etiqueta + ayuda + error) · `SearchBar` · `FilterBar` · `DateRangePicker` · `GuestSelector` · `NightCard` · **`SuiteCard`** (horizontal) · **`ExperienceCard`** · **`TestimonialCard`** · **`BookingBar`** · **`StickySummary`** · `ReservationSummary` · `OTPStep` · `QRPanel` · `LiveBadge` (SSE) · `RoomStatusChip` · `SupplyRow` · `IncidentRow` · `MetricCard` · `ChatBubble`/`ChatComposer` | default · hover · focus · **vacío** · **degradado** |
| **Organismos** | `SiteHeader` · `PublicShell` · `Footer` · **`Hero`** (home) · `CatalogGrid` · `HistoryTable` · **`DataTable`** (tablas densas de personal) · `DashboardGrid` · `MintForm` · `AdminSidebar` · `DayBoard` · `HousekeepingBoard` · `MaintenanceBoard` · `ResaleManager` · `TxModal` · `OnboardingSheet` · `EmptyState` / `DegradedState` | default · cargando · vacío · **degradado** · error |
| **Plantillas** | `PublicShell` (pública) · `FrontOfficeShell` (recepción) · `StaffShell` (housekeeping/mantenimiento, móvil) · `AdminLayout` (sidebar derecha en acordeón) | — |
| **Páginas** | 38 rutas (12 públicas, 2 de recepción, 2 de housekeeping, 3 de mantenimiento, 17 de administración, + legales/ayuda) | — |

**Componentes clave de la fase de imagen visual** (con su contrato):

| Componente | Ficheros | Reglas que respeta |
|---|---|---|
| `Hero` | `components/home/Hero.tsx` | Velo `bg-ocean/65`; portada de `hotel_images(HERO)`; sin `lazy` (es el LCP); cae a `bg-ocean` sin foto |
| `BookingBar` | `components/booking/BookingBar.tsx` + `lib/booking.ts` | Noche de hoy no vendible (D-4); salida > entrada; errores en línea (`role="alert"`); búsqueda en la URL |
| `StickySummary` | `components/reserve/StickySummary.tsx` | Importe con la **misma tasa** que el cobro; sin tarifa no inventa cifra |
| `DataTable` | `components/ui/DataTable.tsx` | `<caption>` + `scope` col/row + región desplazable con nombre y `tabIndex={0}` |

---

## 5. Directrices de implementación

1. **Añadir un color**: preset → espejo → `:root` → par declarado (si es texto) → `docs/DISENO-UX.md`
   §2.1. Un solo commit, y los guardianes en verde.
2. **Añadir un nivel tipográfico**: `preset.cjs` (`fontSize`). Si el nombre colisiona con un color
   (`text-<algo>`), el guardián de la escala lo detecta: la lista de exclusión del escáner se **deriva
   del preset**, así que no hay que tocar el escáner.
3. **Un control de formulario**: `border-line-strong` (nunca `line`) y `min-h-touch`. Lo vigila
   `control-boundary.test.ts`.
4. **Una tabla de datos**: usa `DataTable`; si escribes una `<table>` a mano, necesita nombre
   accesible y `scope="col"` (`table-semantics.test.ts`).
5. **Un texto nuevo**: las tres lenguas a la vez (`i18n-parity.test.ts` compara claves, valores no
   vacíos y **marcadores de interpolación**).
6. **Una ilustración o pieza de marca**: solo colores de la paleta y `role="img"` + `<title>`
   (`brand-pieces.test.ts`).

---

## 6. Do's & don'ts

| ✅ Hazlo | ❌ No lo hagas |
|---|---|
| Usa `sea` para la acción principal y `terracotta`/`terracotta-text` para la atención | Pintar un CTA con terracota claro (`#C86446`: 3,91:1) o con texto blanco sobre champagne |
| Texto secundario con `ink-soft` (6,90:1 sobre arena) | Introducir grises nuevos tipo `#6B7280` (4,49:1 sobre arena) |
| Estrellas y detalles en claro con `gold` + `ink` encima | Usar `gold` (2,97:1) o `champagne` (2,26:1) como texto sobre blanco |
| El registro oscuro, con `ocean`, y texto `sand`/`shell` | Texto `ink` sobre `ocean` (1,10:1) |
| Frontera de controles con `line-strong` | Usar `line` como frontera de un control (1,26:1) |
| Un `<h1>` por página y jerarquía `h2`/`h3` | Saltar de `h1` a `h4` o usar la serif en párrafos largos |
| Degradar con honestidad (decir «no se pudo comprobar») | Mostrar una acción que va a revertir o cifras que no se pueden verificar |

---

## 7. Accesibilidad

### 7.1 Pares aprobados (texto sobre fondo, medidos)

| Texto | Fondo | Ratio | Uso |
|---|---|---|---|
| `ink` | `shell` / `sand` / `sand-2` | 15,95 · 14,81 · 13,35:1 | Texto principal |
| `ink-soft` | `shell` / `sand` / `sand-2` | 7,43 · 6,90 · 6,22:1 | Texto secundario |
| `sea` / `sea-deep` | `shell` | 7,89 · 11,12:1 | Enlaces y títulos de marca |
| `terracotta-text` | `shell` / `sand` | 6,02 · 5,59:1 | Avisos y etiquetas |
| `shell` | `sea` / `sea-deep` / `terracotta-text` / `olive` | 7,89 · 11,12 · 6,02 · 5,73:1 | Texto sobre acciones y etiquetas |
| `sand` / `shell` | `ocean` | 13,42 · 14,46:1 | Registro oscuro (hero, pie, administración) |
| `champagne` | `ocean` / `ocean-soft` | 6,39 · 4,54:1 | Detalle premium sobre oscuro |
| `success` / `warning` / `error` / `info` | `sand` | 5,84 · 5,49 · 6,92 · 7,67:1 | Estados como texto |
| `success` / `warning` / `error` / `info` | su `*-bg` | 5,32 · 4,91 · 6,04 · 6,72:1 | Bandas de estado |
| `ink` | `success-bg` / `warning-bg` / `error-bg` / `info-bg` | 13,50 · 13,26 · 12,94 · 12,98:1 | Texto principal sobre banda |
| `shell` | `success` / `error` | 6,29 · 7,45:1 | Texto sobre relleno de estado |
| `shell` | velo `ocean` al 65 % | 4,93:1 | Texto del hero sobre fotografía |

### 7.2 Pares prohibidos (medidos)

| Combinación | Ratio | Por qué se prohíbe |
|---|---|---|
| `#C86446` sobre `#F7F4EE` / `#FFFFFF` | 3,56 · 3,91:1 | Terracota clara como texto: no cumple AA |
| Texto blanco sobre `#C86446` / `#D96B43` | 3,91 · 3,42:1 | Botón con etiqueta normal ilegible |
| `#C5A880` (champagne) sobre blanco / arena | 2,26 · 2,10:1 | Solo vale sobre oscuro |
| `#6B7280` sobre arena | 4,49:1 | Gris propuesto fuera del sistema; usar `ink-soft` |
| `#C68A2E` (gold) sobre blanco | 2,97:1 | Detalle decorativo, nunca texto |
| `#E7DCC6` (`line`) como frontera de control sobre arena | 1,26:1 | Incumple WCAG 1.4.11 (mínimo 3:1) |
| `ink` sobre relleno `terracotta` | 3,46:1 | El relleno terracota exige texto blanco |
| Blanco sobre velo `ocean` al 35 % | 2,09:1 | Peor caso con imagen clara debajo |
| Texto deshabilitado | — | **Exento** por WCAG 2.1 · 1.4.3 (componentes inactivos) |

### 7.3 Teclado, foco y semántica

- **Foco visible**: doble anillo arena + teal (`outline` 2 px + `box-shadow`), ≥ 3:1 contra los colores
  adyacentes (WCAG 1.4.11 / 2.4.7). No se usa terracota como anillo (daba 1,71:1 sobre el CTA teal).
- **Área táctil** ≥ 44 × 44 px en toda acción (`min-h-touch`).
- **Formularios**: etiqueta asociada, error junto al campo y `role="alert"`; los controles declaran su
  frontera con `line-strong`.
- **Tablas**: `<caption>` (visible solo para lectores), `scope="col"` y `scope="row"`, región
  desplazable con nombre y `tabIndex={0}`.
- **Gráficas**: `role="img"` con nombre accesible, leyenda en HTML y **tabla de datos equivalente**
  dentro de un `<details>`.
- **Idioma**: `<html lang>` según la preferencia (ES/EN/RU) y cascada cirílica para el ruso.
- **Escaneo real**: axe + Playwright en `chromium` y `mobile` sobre las rutas públicas y de personal,
  sin violaciones `critical`/`serious`.

---

## 8. Versionado

| Versión | Fecha | Cambios |
|---|---|---|
| **1.0.0** | 2026-09-27 | Primera edición. Recoge la evolución **aditiva** aprobada a partir de `propuestaVisual-Hotel.md`: 12 tokens nuevos (`ocean`, `ocean-soft`, `champagne`, `line-strong` y los cuatro estados con sus fondos), 7 niveles tipográficos y el radio `brand-xs`; cascada cirílica (Playfair Display + Inter); componentes de la suite pública (`Hero`, `Stars`, `SuiteCard`, `ExperienceCard`, `TestimonialCard`, `BookingBar`, `StickySummary`) y de personal (`DataTable`); frontera de controles con `line-strong` (cierre del hallazgo **H-7**, WCAG 1.4.11); vista previa social generada en código; guardianes de paleta, contraste, frontera, tipografía, tablas, i18n y piezas de marca. |

---

## 9. Verificación y límites declarados

```bash
node scripts/design/contrast-audit.mjs                 # 32 pares WCAG con veredicto y corrección
pnpm --filter @hotel/web exec vitest run src/lib       # guardianes de la identidad visual
pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts   # axe en navegador real
```

**Límites declarados** (no se certifican):

- La **cobertura de `apps/web`** sigue siendo el hueco grande del proyecto (~25 % medido en M8): los
  invariantes visuales se comprueban sobre el código y la paleta, no renderizando cada componente.
- El escaneo axe **con datos reales** en el dashboard sigue pendiente (el spec fuerza vistas
  degradadas): heredado de M8 y ajeno a la identidad visual.
- La **app nativa** (llave NFC, conserjería) no entra en esta entrega: 3.ª versión (D-49/D-50). El
  **modo noche** del personal queda **propuesto y no aprobado** (`propuesta_imagen_visual.md` §3.6);
  si se aprueba, duplica la matriz de pares a verificar.
- Los pares de este manual son los **declarados en el código**; una combinación nueva que aparezca en
  un `className` se mide automáticamente, pero una **imagen** con texto incrustado no se puede medir
  (por eso las piezas de marca se generan o se editan sobre la paleta, con guardián propio).
