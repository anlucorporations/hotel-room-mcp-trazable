# Análisis visual — rediseño «Brisa Marina» (Fase 1 de `@visualUiUx`)

> **Proyecto**: `hotel-room-mcp-trazable` · Hotel Marina del Sol (Alicante, 50 habitaciones)
> **Fecha**: 2026-10 · **Autor**: Arquitecto UI/UX (`@visualUiUx`) bajo dirección de `@asistenteProyecto`
> **Entrada del responsable**: *«identidad visual para todo el proyecto, fresca con estilo profesional;
> estilo AdminLTE para la suite de administrador y landing page para la página principal»*.
> **Decisiones de calibración** (bloque de 3 preguntas): **rediseño completo desde cero** ·
> dirección **más luminosa y aérea** · alcance **solo `apps/web`**.
> **Salida de esta fase**: este informe. La especificación normativa vive en
> [`Manual_Identidad_Visual.md`](./Manual_Identidad_Visual.md) v2.0.0.

---

## 1. Punto de partida (lo que ya existía)

El proyecto **no partía de cero visual**: tenía el sistema «Mediterráneo editorial» (v1.2.2) con
12 tokens cálidos (arena/teal/terracota), tipografías Fraunces + Hanken Grotesk, una cascada cirílica
de respaldo, 6 guardianes de tests, una auditoría de contraste ejecutable y el **back-office ya
distribuido al estilo AdminLTE** (v1.2.0: sidebar izquierda plegable, navbar, `content-header`,
`content-wrapper`, KPI tipo `small-box`). La home ya era una **landing** (hero a sangre + barra de
reserva flotante + secciones editoriales).

**Consecuencia de método**: el rediseño **no toca la arquitectura de información ni la distribución
AdminLTE** —que están aprobadas y protegidas por guardianes— y sustituye **el sistema visual
completo**: vocabulario de tokens, valores, tipografías, elevación y todos los puntos de uso. La
estructura se conserva porque es la que el responsable pidió expresamente.

## 2. Diagnóstico: por qué el sistema anterior no daba «fresco»

| Observación | Evidencia | Decisión en el rediseño |
|---|---|---|
| Lienzo **cálido** (arena `#FBF6EC`) que apaga la sensación de limpieza | El propio material lo llamaba «calidez costera» | Lienzo **porcelana fría** `mist #F4F9FC` |
| Primario **teal apagado** (`#0E5A63`, hsl 186 75% 22%) | Luminosidad 22 %: pesa sin destacar | Primario **azur vívido** `azure #0F6C9C` (hsl 200 82% 34%) |
| Registro oscuro **verdoso** (`ocean #0F2C3F`) | hsl 204 62% 15% | **Marino frío** `navy #0E2A3F` (hsl 206 64% 15%) |
| Serif de alto contraste óptico (**Fraunces**) poco «fresca» en UI pequeña | Uso en titulares y precios | **Playfair Display** (serif elegante y estable) + **Manrope** (geométrica fresca) en UI |
| Cascada cirílica **compleja** (2 respaldos `preload:false`) | `Fraunces`/`Hanken` sin rango ruso básico | Ambas fuentes nuevas **publican `cyrillic`**: la cascada desaparece |
| Sombras con tinte teal cálido | `rgba(14,90,99,…)` | Sombras **frías y más difusas** (marino/azur) |

## 3. Paleta `«Brisa Marina»` — por rol semántico (medida, no descrita)

Cada par se midió con la misma matemática WCAG 2.1 que usa el producto
(`node scripts/design/contrast-audit.mjs` → **50 pares, 0 por debajo de su mínimo**).

| Rol | Token | HEX | HSL | Ratio representativo |
|---|---|---|---|---|
| `background` | `mist` | `#F4F9FC` | hsl(203 57% 97%) | — (lienzo) |
| `background-alt` | `mist-2` | `#E6F0F6` | hsl(203 47% 93%) | — |
| `surface` | `shell` | `#FFFFFF` | hsl(0 0% 100%) | — |
| `text-primary` | `ink` | `#101F2C` | hsl(208 47% 12%) | **16,74:1** sobre shell |
| `text-secondary` | `ink-soft` | `#41566A` | hsl(209 24% 34%) | **7,60:1** sobre shell |
| `interactive` | `azure` | `#0F6C9C` | hsl(200 82% 34%) | **5,76:1** con blanco |
| `interactive-hover` | `azure-deep` | `#0A4F75` | hsl(201 84% 25%) | **8,79:1** con blanco |
| `surface-dark` | `navy` | `#0E2A3F` | hsl(206 64% 15%) | **14,77:1** con shell |
| `surface-dark-alt` | `navy-soft` | `#1A4160` | hsl(207 57% 24%) | **10,67:1** con shell |
| `premium-dark` | `pearl` | `#C3D4E0` | hsl(205 32% 82%) | **9,72:1** sobre navy |
| `accent-fill` | `coral` | `#C4522C` | hsl(15 63% 47%) | **4,57:1** con blanco |
| `accent-text` | `coral-text` | `#A34222` | hsl(15 65% 39%) | **6,25:1** sobre shell |
| `premium-light` | `amber` | `#B98324` | hsl(38 67% 43%) | **5,05:1** con ink encima |
| `available` | `fern` | `#276E4C` | hsl(151 47% 29%) | **5,79:1** sobre mist |
| `border` | `line` | `#DBE7EF` | hsl(204 38% 90%) | decorativo |
| `border-strong` | `line-strong` | `#6B8296` | hsl(208 17% 50%) | **3,99:1** sobre shell (WCAG 1.4.11) |
| `success` / `-bg` | `success` / `success-bg` | `#1F7A4D` / `#E2F2E9` | hsl(150 59% 30%) / hsl(146 38% 92%) | 4,59:1 sobre su fondo |
| `warning` / `-bg` | `warning` / `warning-bg` | `#8A5F0C` / `#FBF0D6` | hsl(40 83% 32%) / hsl(42 82% 91%) | 4,98:1 sobre su fondo |
| `error` / `-bg` | `error` / `error-bg` | `#B3261E` / `#FAE5E3` | hsl(3 71% 41%) / hsl(5 70% 94%) | 5,41:1 sobre su fondo |
| `info` / `-bg` | `info` / `info-bg` | `#0F6380` / `#E0EFF5` | hsl(195 79% 28%) / hsl(197 51% 92%) | 5,72:1 sobre su fondo |

**Ajustes realizados durante la medición** (el diseño se corrigió, no se maquilló el informe):

1. `warning` pasó de `#96690E` a **`#8A5F0C`**: sobre su propio fondo daba **4,29:1** (no AA).
2. `fern` pasó de `#2E7D57` a **`#276E4C`**: el chip «LIBRE» de recepción
   (`text-fern` sobre `bg-fern/10`) daba **4,18:1**; ahora **5,04:1**.

**Regla de oro del color**: el **azur** es la acción; el **coral** (relleno) y `coral-text` (texto)
son la atención; el **marino** es el registro oscuro —hero, pie y **suite AdminLTE**—; la **perla** y
el **ámbar** son detalle premium (perla solo sobre oscuro, ámbar nunca como texto en claro).

## 4. Jerarquía tipográfica

- **Display**: `Playfair Display` (serif elegante, ejes latin + **cyrillic**) — titulares, precios,
  nombres de habitación.
- **UI/cuerpo**: `Manrope` (geométrica fresca, latin + **cyrillic**) — navegación, texto, formularios.
- **Escala modular** (idéntica en estructura a la anterior, ahora con las fuentes nuevas):
  `display clamp(2.8→5rem)/0,98/−0,03em` · `h1 clamp(2.3→4.1rem)` · `h2 clamp(1.6→2.2rem)` ·
  `h3 1.3rem` · `h4 1.075rem` · `body-lg 1.1875rem` · `body 1.0625rem (17px)` · `body-sm 0.95rem` ·
  `small 0.9rem` · `caption 0.82rem` · `overline 0.78rem +0,14em` · `micro 0.78rem` · `code 0.9rem`.
- **Pesos cargados**: variables (Playfair y Manrope son fuentes variables) — no se cargan 9 pesos.
- **Accesibilidad**: cuerpo ≥ 16 px reales (17 px), interlineado 1,5, medida ≤ 66 ch, y **RU cubierto
  por la marca** (ya no hay cascada glifo a glifo).

## 5. Espaciado, formas, elevación, rejilla y movimiento

- **Espaciado** (base 4 px): 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96.
- **Radios**: `brand-xs 6` · `brand-sm 10` · `brand 16` · `brand-lg 22` · `pill 9999`.
- **Elevación «aérea»** (nueva, fría y difusa):
  `card` `0 1px 2px rgba(14,42,63,.05), 0 4px 12px rgba(15,108,156,.07)` ·
  `card-hover` `0 12px 28px rgba(14,42,63,.12)` · `modal` `0 24px 64px rgba(10,42,63,.22)`.
- **Rejilla y breakpoints**: móvil < 768 (1 col) · tablet 768–1023 (2 col, sidebar plegable) ·
  desktop ≥ 1024 (3 col, sidebar fija); contenido máx. `max-w-6xl`, lectura ≤ 66 ch.
- **Movimiento**: `cubic-bezier(.21,.68,.27,.99)`, revelado escalonado ≤ 0,6 s, hover de tarjeta
  `translateY(-5px)` + zoom de foto; `prefers-reduced-motion` respetado (también los retardos).
- **Área táctil** ≥ 44 px (`min-h-touch` / `min-w-touch`).

## 6. Inventario de componentes por Atomic Design (con estados)

| Nivel | Componentes | Estados obligatorios |
|---|---|---|
| **Átomos** | `Button` (primario/ghost/peligro, 3 tamaños) · `Link` · `Badge` (reventa, tipo, suite) · `Chip` (`aria-pressed`) · `Input`/`Select`/`Textarea` (frontera `line-strong`) · `Checkbox`/`Toggle` · `Stars` · `Divider` · `Icon` (trazo 2 px) · `Money` (ETH/EUR) | default · hover · **focus-visible** (doble anillo porcelana + azur) · active · disabled · loading · error |
| **Moléculas** | `Field` · `SearchBar` · `FilterBar` · `DateRangePicker` · `GuestSelector` · `NightCard` · `SuiteCard` · `ExperienceCard` · `TestimonialCard` · `BookingBar` · `StickySummary` · `ReservationSummary` · `OTPStep` · `QRPanel` · `LiveBadge` · `RoomStatusChip` · `SupplyRow` · `IncidentRow` · `MetricCard` · `ChatBubble`/`ChatComposer` | default · hover · focus · vacío · degradado |
| **Organismos** | `SiteHeader` · `PublicShell` · `Footer` · **`Hero`** (landing) · `CatalogGrid` · `HistoryTable` · `DataTable` · `DashboardGrid` · `MintForm` · **`AdminSidebar`/`AdminLayout` (AdminLTE)** · `DayBoard` · `HousekeepingBoard` · `MaintenanceBoard` · `ResaleManager` · `TxModal` · `OnboardingSheet` · `EmptyState`/`DegradedState` | default · cargando · vacío · degradado · error |
| **Plantillas** | `PublicShell` · `FrontOfficeShell` · `StaffShell` · **`AdminLayout` (distribución AdminLTE: sidebar izquierda fija plegable a mini + navbar superior + `content-header` con migas + `content-wrapper` + pie)** | — |
| **Páginas** | 38 rutas (públicas, recepción, housekeeping, mantenimiento, administración, legales/ayuda) | — |

**Las dos superficies que pidió el responsable:**

1. **Landing (página principal)**: `Hero` a sangre con **velo `bg-navy/65`** (4,79:1 con texto
   blanco), titular en Playfair con la palabra destacada en `pearl`, CTA primario en `coral` y
   secundarios en `shell`/`azure-deep`; `BookingBar` flotante sobre el borde del hero; secciones
   editoriales (`SuiteCard`, `ExperienceCard`, `TestimonialCard`, `Stars`) sobre lienzo `mist`.
2. **Suite de administrador (AdminLTE)**: sidebar **`bg-navy`** con enlaces `text-mist` (13,93:1),
   secciones en `pearl` (9,72:1), entrada activa como pastilla `bg-shell text-navy` (14,77:1),
   filetes `border-pearl/30`; navbar superior, migas, `content-wrapper` y pie. La distribución no se
   toca (la fija `admin-shell.test.ts`).

## 7. Decisiones tomadas y su justificación

| Decisión | Justificación |
|---|---|
| **Vocabulario de tokens nuevo** (`mist/azure/navy/coral/pearl/amber/fern`) | «Desde cero» pedido por el responsable; los nombres viejos eran metáforas cálidas que ya no describen el color (una «arena» fría es deuda de mantenimiento) |
| **Rediseño del sistema de color completo**, no aditivo | La dirección «luminoso y aéreo» es incompatible con un lienzo cálido; un cambio aditivo habría dejado dos registros conviviendo |
| **Playfair Display + Manrope** | Frescura geométrica en UI y elegancia editorial en display; **ambas publican cirílico**, lo que elimina la cascada de respaldo del sistema anterior |
| **AdminLTE intacto en estructura** | Es lo que el responsable pidió y ya estaba aprobado y verificado; el rediseño lo re-viste con `navy`/`pearl` |
| **Sombras frías** | Coherencia con el lienzo porcelana: las sombras cálidas sobre gris frío se leen sucias |
| **`fern` y `warning` oscurecidos** | Fueron los dos únicos pares que la medición reprobó; se corrigió el diseño, no el umbral |

## 8. Criterios de aceptación de la Fase 1 (verificados)

- [x] Paleta por roles semánticos en tabla con HEX, HSL y **ratio de contraste calculado**.
- [x] Todos los pares de texto conformes a **WCAG AA** (mínimo del sistema) y AAA cuando es viable.
- [x] Escala tipográfica definida con familia, tamaño, peso, interlineado y tracking.
- [x] Inventario de componentes por Atomic Design con estados.
- [x] Escalas de espaciado, radios, elevación y breakpoints definidas.
- [x] Combinaciones **prohibidas** medidas y documentadas (4 pares).

**Siguiente fase**: generación de tokens en el formato del stack real (Tailwind v3 + espejo TS +
`:root`), migración de los 1.800 puntos de uso y guardianes — ejecutado y verificado; el detalle
normativo está en [`Manual_Identidad_Visual.md`](./Manual_Identidad_Visual.md).
