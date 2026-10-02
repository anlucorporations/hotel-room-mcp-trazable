# Manual de identidad visual — Hotel Marina del Sol

> **Sistema**: **«Brisa Marina»** · **Versión**: **2.0.0** · **Fecha**: 2026-10
> **Alcance**: las 5 suites (pública, recepción, housekeeping, mantenimiento, administración) ·
> Web responsive (ES/EN/RU) · **Alcance del rediseño**: `apps/web` (la app nativa queda fuera, D-49/D-50).
> **Sustituye a**: «Mediterráneo editorial» v1.2.2 (rediseño completo desde cero aprobado por el
> responsable; el histórico de versiones se conserva en §8).
>
> **Fuentes de verdad** (este manual **no** las sustituye, las explica):
> `packages/config/tailwind/preset.cjs` (tokens) · `apps/web/src/lib/a11y/palette.ts` (espejo medible)
> · `apps/web/src/app/globals.css` (`:root` de runtime) · `docs/DISENO-UX.md` (guía de producto)
> · `docs/ACCESIBILIDAD-WCAG.md` (certificación) · [`analisis_visual.md`](./analisis_visual.md) (Fase 1).
>
> **Cómo se verifica**: `node scripts/design/contrast-audit.mjs` (**50 pares** medidos con WCAG 2.1,
> 0 por debajo de su mínimo) · `pnpm --filter @hotel/web exec vitest run src/lib` (guardianes de
> paleta, contraste, frontera de controles, tipografía cirílica, tablas, paridad i18n y piezas de
> marca) · `pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts` (axe en navegador real).
>
> Las tablas de este manual se **derivan del código**: si un token cambia, cambian el preset, el
> espejo y el guardián — y este documento se actualiza en el mismo commit.

---

## 1. Brief y concepto

**Qué es.** La plataforma de reservas del Hotel Marina del Sol (50 habitaciones, Alicante): noches en
propiedad y trazables, con reserva directa desde la web y suites operativas para el personal.

**Personalidad.** *Fresca, luminosa y profesional.* La marca no grita: usa la **luz del amanecer en
la costa** (porcelana fría), el **azur del agua** para lo accionable y el **marino profundo** para lo
que debe pesar (hero, pie y la suite de administración). El coral aparece poco y con intención; la
perla y el ámbar son detalle premium, nunca decoración de relleno.

**Tono.** Claro, hospitalario y sin jerga técnica delante del huésped — pero **honesto**: cuando algo
no se puede comprobar (RPC caído, contrato en pausa, tarifa no publicada), la interfaz lo dice; nunca
ofrece una acción que vaya a fallar (ADR-23, D-11).

**Público y contextos de uso.**

| Contexto | Quién | Qué necesita del sistema visual |
|---|---|---|
| Escaparate (`/`, `/catalogo`, `/reservar`, `/reventa`, `/mis-noches`) | Huésped, comprador | Confianza, fotografía, jerarquía editorial, reserva sin fricción |
| Front Office (`/recepcion`) | Recepcionista | Densidad legible, estados claros, tablero del día |
| Housekeeping / Mantenimiento | Personal en movilidad | Un toque por acción, áreas de 44 px, contraste alto |
| Administración (`/admin/**`, **AdminLTE**) | Propietario | Sidebar estable, formularios seguros, cifras verificables |

**Referencias y qué se tomó de cada una.**

| Referencia | Se adoptó | Se descartó |
|---|---|---|
| El sistema anterior («Mediterráneo editorial» v1.2.2) | El **registro oscuro editorial** para hero/pie/administración, la narrativa de **hero a sangre + barra de reserva flotante**, la **distribución AdminLTE** del back-office (D-78/D-80/D-81/D-82: sidebar plegable, navbar, migas, `content-wrapper`, KPI `small-box`), la escala tipográfica con `clamp`, las áreas de 44 px y toda la batería de guardianes | Sus **12 tokens cálidos** (arena/teal/terracota), el detalle champagne, la fuente Fraunces y la cascada cirílica de respaldo |
| `propuestaVisual-Hotel.md` («Marina Sol») | El **marino editorial** como superficie oscura y el inventario de componentes de la suite pública | Terracotas claras como color interactivo, champagne como texto en claro, gris `#6B7280` sobre lienzo |
| Dirección del responsable (2026-10) | **Rediseño completo**, más **luminoso y aéreo**, AdminLTE en administración y landing en la principal | Nada: es el encargo |

---

## 2. Guía de estilo

### 2.1 Color por roles semánticos

Los roles son los que usa el código; el **token** es el nombre con el que se escribe la clase
(`bg-mist`, `text-ink-soft`…).

| Rol | Token | HEX | HSL | Uso |
|---|---|---|---|---|
| `background` | `mist` | `#F4F9FC` | hsl(203 57% 97%) | Lienzo de página (porcelana fría) |
| `background-alt` | `mist-2` | `#E6F0F6` | hsl(203 47% 93%) | Bandas, filas alternas, estados suaves |
| `surface` | `shell` | `#FFFFFF` | hsl(0 0% 100%) | Tarjetas, formularios, modales |
| `surface-dark` | `navy` | `#0E2A3F` | hsl(206 64% 15%) | Hero, pie y **sidebar de administración (AdminLTE)** |
| `surface-dark-alt` | `navy-soft` | `#1A4160` | hsl(207 57% 24%) | Secundaria oscura, hover sobre oscuro |
| `text-primary` | `ink` | `#101F2C` | hsl(208 47% 12%) | Texto principal |
| `text-secondary` | `ink-soft` | `#41566A` | hsl(209 24% 34%) | Texto secundario y ayudas |
| `text-inverse` | `shell` / `mist` | `#FFFFFF` / `#F4F9FC` | — | Texto sobre `navy`/`navy-soft` |
| `border` / `divider` | `line` | `#DBE7EF` | hsl(204 38% 90%) | Filetes **decorativos** (no controles) |
| `border-strong` | `line-strong` | `#6B8296` | hsl(208 17% 50%) | **Frontera de controles** (WCAG 1.4.11) |
| `primary-brand` / `interactive` | `azure` | `#0F6C9C` | hsl(200 82% 34%) | Acción primaria, enlaces, foco |
| `interactive-hover` | `azure-deep` | `#0A4F75` | hsl(201 84% 25%) | Hover y pulsado |
| `accent-fill` | `coral` | `#C4522C` | hsl(15 63% 47%) | Relleno de atención **con texto blanco** |
| `accent-text` | `coral-text` | `#A34222` | hsl(15 65% 39%) | Acento como **texto** |
| `premium-light` | `amber` | `#B98324` | hsl(38 67% 43%) | Detalle sobre claro, **con `ink` encima** |
| `premium-dark` | `pearl` | `#C3D4E0` | hsl(205 32% 82%) | Detalle **solo sobre oscuro** |
| `available` | `fern` | `#276E4C` | hsl(151 47% 29%) | Estado «disponible» |
| `success` / `success-bg` | — | `#1F7A4D` / `#E2F2E9` | hsl(150 59% 30%) / hsl(146 38% 92%) | Confirmaciones |
| `warning` / `warning-bg` | — | `#8A5F0C` / `#FBF0D6` | hsl(40 83% 32%) / hsl(42 82% 91%) | Avisos |
| `error` / `error-bg` | — | `#B3261E` / `#FAE5E3` | hsl(3 71% 41%) / hsl(5 70% 94%) | Errores y bloqueos |
| `info` / `info-bg` | — | `#0F6380` / `#E0EFF5` | hsl(195 79% 28%) / hsl(197 51% 92%) | Información y ayuda |

**Estado de aplicación (v2.0.0):** todos los tokens de esta tabla están **en uso** en el producto. El
registro marino se aplica en el **hero**, el **pie**, el **sidebar de administración** y la **vista
previa social**; el azur es la acción en las cinco suites; el coral es la atención y el helecho el
estado «disponible» del tablero de recepción.

**Regla de oro del color:** el **azur** es la **acción**; el **coral** (relleno) y `coral-text`
(texto) son la **atención**; el **marino** es el **registro oscuro**; la **perla** solo existe sobre
oscuro y el **ámbar** nunca es texto sobre claro.

### 2.2 Tipografía

- **Display**: `Playfair Display` (serif elegante, variable) — titulares, precios, nombres de
  habitación.
- **UI/cuerpo**: `Manrope` (geométrica fresca, variable) — navegación, texto, formularios, botones.
- **Cobertura cirílica**: ambas familias publican el subconjunto `cyrillic` y se cargan con
  `subsets: ["latin", "cyrillic"]`, así que **RU se pinta con las fuentes de marca**. La cascada
  glifo a glifo con respaldos del sistema anterior **se retiró** (era deuda técnica: dos fuentes
  extra cargadas sin precarga para un solo locale).
- **Cuerpo mínimo 16 px** (17 px reales), interlineado 1,5, medida de línea ≤ 66 ch.

| Nivel | Tamaño | Interlineado / tracking | Uso |
|---|---|---|---|
| `display` | `clamp(2.8rem, 1.7rem + 4.4vw, 5rem)` | 0,98 · −0,03em | Hero de la landing |
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
- **Elevación** (fría y difusa, teñida de marino/azur): `card` `0 1px 2px rgba(14,42,63,.05), 0 4px 12px rgba(15,108,156,.07)` ·
  `card-hover` `0 12px 28px rgba(14,42,63,.12)` · `modal` `0 24px 64px rgba(10,42,63,.22)`.
  No hay sombras duras ni negras.
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

- El **hero** de la landing es el bloque oscuro del escaparate: foto a sangre con **velo `bg-navy/65`**.
  Medido: el compuesto sobre blanco es `#627582` → **4,79:1** con texto blanco y **4,51:1** con
  porcelana. Al 35 % cae a **2,10:1** — **prohibido** incluso para texto grande.
- Sin portada en la base, el hero cae a `bg-navy` plano (14,77:1 con blanco) y **no** desaparece.
- La **perla** solo se usa sobre `navy`/`navy-soft` (9,72:1 / 7,02:1); sobre claro **nunca** (1,52:1).

---

## 3. Tokens: dónde viven y cómo se consumen

| Pieza | Fichero | Para qué |
|---|---|---|
| Tokens de Tailwind | `packages/config/tailwind/preset.cjs` | Clases (`bg-mist`, `text-ink-soft`, `text-h4`, `rounded-brand`, `shadow-card`…) |
| Espejo medible | `apps/web/src/lib/a11y/palette.ts` | Tests de contraste y colores de las gráficas (SVG con valores, no clases) |
| Runtime | `apps/web/src/app/globals.css` (`:root`) | Variables CSS (`var(--navy)`) y estilos base (foco, tipografía, formularios) |
| Tokens de tipografía | `preset.cjs` (`fontSize`, `fontFamily`) + `layout.tsx` (`next/font`) | Escala modular y fuentes (Playfair Display + Manrope, latin + cyrillic) |
| Documentación del manual en PDF | `apps/web/scripts/build-manuals.mjs` | Hoja de estilo de los manuales generados (misma paleta, plano) |

**Reglas de token:**

1. **Un solo origen**: un color nuevo se declara en el **preset** y en el **espejo** (`palette.ts`) en
   el **mismo commit**; el test `a11y.test.ts` compara los dos objetos y se pone rojo si divergen.
2. **Sin valores mágicos**: ni `#0E2A3F` ni `text-[#123456]` en un componente. Todo sale de un token.
3. **Sin alias redundantes**: si un rol ya tiene token, se usa ese (por eso no hay `--primary` ni
   `--brand-blue`).
4. **Un token nuevo entra con su par**: si se va a usar como texto, se declara la combinación
   texto/fondo en `DECLARED_TEXT_ON_BACKGROUND` (con su ratio medido) en el mismo commit.
5. **Un color de estado entra con su banda**: si se usa como texto sobre su propio tinte
   (`bg-fern/10`), se mide también ese compuesto (fue el caso del chip «LIBRE»).

**Ejemplos.**

```tsx
// ✅ correcto: rol semántico, frontera de control de 3:1 y foco de marca
<input className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3 text-ink" />

// ❌ incorrecto: color fuera de la paleta, frontera decorativa y valor mágico
<input className="border border-[#DBE7EF] bg-[#f5f5f5] text-[#333]" />
```

---

## 4. Inventario de componentes (Atomic Design)

| Nivel | Componentes | Estados obligatorios |
|---|---|---|
| **Átomos** | `Button` (primario/ghost/peligro, 3 tamaños) · `Link` · `Badge` (reventa, tipo, suite) · `Chip` de filtro (`aria-pressed`) · `Input`/`Select`/`Textarea` (frontera `line-strong`) · `Checkbox`/`Toggle` · **`Stars`** (`role="img"` + `aria-label`) · `Divider` · `Icon` (trazo 2 px) · `Money` (ETH/EUR) | default · hover · **focus-visible** (doble anillo porcelana + azur) · active · **disabled** · loading · error |
| **Moléculas** | `Field` (etiqueta + ayuda + error) · `SearchBar` · `FilterBar` · `DateRangePicker` · `GuestSelector` · `NightCard` · `SuiteCard` · `ExperienceCard` · `TestimonialCard` · `BookingBar` · `StickySummary` · `ReservationSummary` · `OTPStep` · `QRPanel` · `LiveBadge` · `RoomStatusChip` · `SupplyRow` · `IncidentRow` · `MetricCard` · `ChatBubble`/`ChatComposer` | default · hover · focus · **vacío** · **degradado** |
| **Organismos** | `SiteHeader` · `PublicShell` · `Footer` · **`Hero`** (landing) · `CatalogGrid` · `HistoryTable` · **`DataTable`** (tablas densas) · `DashboardGrid` · `MintForm` · **`AdminSidebar`/`AdminLayout`** · `DayBoard` · `HousekeepingBoard` · `MaintenanceBoard` · `ResaleManager` · `TxModal` · `OnboardingSheet` · `EmptyState` / `DegradedState` | default · cargando · vacío · **degradado** · error |
| **Plantillas** | `PublicShell` (pública) · `FrontOfficeShell` (recepción) · `StaffShell` (housekeeping/mantenimiento, móvil) · `AdminLayout` (**distribución AdminLTE**: sidebar izquierda fija en `navy` —plegable a mini— con acordeón y bloque de sesión, navbar superior reservado a **Ayuda**, cabecera de contenido con migas, `content-wrapper` y pie; con `gate`, la pantalla de acceso se pinta bajo esta misma plantilla, D-82) | — |
| **Páginas** | **48 rutas** (22 públicas/institucionales, 2 de recepción, 1 de housekeeping, 1 de mantenimiento, 22 de administración) | — |

**Componentes clave de la identidad visual** (con su contrato):

| Componente | Ficheros | Reglas que respeta |
|---|---|---|
| `Hero` | `components/home/Hero.tsx` | Velo `bg-navy/65` (4,79:1); portada de `hotel_images(HERO)`; sin `lazy` (es el LCP); cae a `bg-navy` sin foto |
| `BookingBar` | `components/booking/BookingBar.tsx` + `lib/booking.ts` | Noche de hoy no vendible (D-4); salida > entrada; errores en línea (`role="alert"`); búsqueda en la URL |
| `StickySummary` | `components/reserve/StickySummary.tsx` | Importe con la **misma tasa** que el cobro; sin tarifa no inventa cifra |
| `DataTable` | `components/ui/DataTable.tsx` | `<caption>` + `scope` col/row + región desplazable con nombre y `tabIndex={0}` |
| `AdminLayout` | `components/admin/AdminLayout.tsx` | Las cinco piezas de AdminLTE (sidebar, navbar, cabecera con migas, `main`, pie); plegado **por clase**, nunca por `hidden` (`admin-shell.test.ts`) |

---

## 5. Directrices de implementación

1. **Añadir un color**: preset → espejo → `:root` → par declarado (si es texto) →
   `docs/DISENO-UX.md` §2.1 y `docs/ACCESIBILIDAD-WCAG.md` §0. Un solo commit, y los guardianes en
   verde.
2. **Añadir un nivel tipográfico**: `preset.cjs` (`fontSize`). Si el nombre colisiona con un color
   (`text-<algo>`), el guardián de la escala lo detecta: la lista de exclusión del escáner se
   **deriva del preset**, así que no hay que tocar el escáner.
3. **Un control de formulario**: `border-line-strong` (nunca `line`) y `min-h-touch`. Lo vigila
   `control-boundary.test.ts`.
4. **Una tabla de datos**: usa `DataTable`; si escribes una `<table>` a mano, necesita nombre
   accesible y `scope="col"` (`table-semantics.test.ts`).
5. **Un texto nuevo**: las tres lenguas a la vez (`i18n-parity.test.ts` compara claves, valores no
   vacíos y **marcadores de interpolación**).
6. **Una ilustración o pieza de marca**: solo colores de la paleta y `role="img"` + `<title>`
   (`brand-pieces.test.ts`); el registro marino se lee desde `colors.navy` del preset, no escrito a
   mano.
7. **Una fuente nueva**: debe declarar `subsets: ["latin", "cyrillic"]` (locale RU) o el guardián
   `cyrillic-fonts.test.ts` se pone rojo.

---

## 6. Do's & don'ts

| ✅ Hazlo | ❌ No lo hagas |
|---|---|
| Usa `azure` para la acción principal y `coral`/`coral-text` para la atención | Pintar un CTA con coral como texto sobre blanco (4,29:1) o con `pearl` sobre claro (1,52:1) |
| Texto secundario con `ink-soft` (7,16:1 sobre porcelana) | Introducir grises nuevos tipo `#6B7280` (4,49:1 sobre `mist`) |
| Detalles premium en claro con `amber` + `ink` encima (5,05:1) | Usar `amber` (3,31:1) o `pearl` (1,52:1) como texto sobre blanco |
| El registro oscuro, con `navy`, y texto `mist`/`shell` | Texto `ink` sobre `navy` (1,10:1) |
| Frontera de controles con `line-strong` (3,99:1 sobre `shell`) | Usar `line` como frontera de un control (1,19:1) |
| El velo del hero al **65 %** o más | Bajar el velo al 35 % (2,10:1) aunque el titular sea grande |
| Un `<h1>` por página y jerarquía `h2`/`h3` | Saltar de `h1` a `h4` o usar la serif en párrafos largos |
| Degradar con honestidad (decir «no se pudo comprobar») | Mostrar una acción que va a revertir o cifras que no se pueden verificar |

---

## 7. Accesibilidad

### 7.1 Pares aprobados (texto sobre fondo, medidos)

| Texto | Fondo | Ratio | Uso |
|---|---|---|---|
| `ink` | `shell` / `mist` / `mist-2` | 16,74 · 15,79 · 14,48:1 | Texto principal |
| `ink-soft` | `shell` / `mist` / `mist-2` | 7,60 · 7,16 · 6,57:1 | Texto secundario |
| `azure` / `azure-deep` | `shell` | 5,76 · 8,79:1 | Enlaces y títulos de marca |
| `coral-text` | `shell` / `mist` | 6,25 · 5,89:1 | Avisos y etiquetas |
| `shell` | `azure` / `azure-deep` / `coral` / `coral-text` / `fern` | 5,76 · 8,79 · 4,57 · 6,25 · 6,14:1 | Texto sobre acciones y etiquetas |
| `ink` | `amber` | 5,05:1 | Etiqueta premium «Suite» |
| `mist` / `shell` / `navy` | `navy` / `navy` / `shell` | 13,93 · 14,77 · 14,77:1 | Registro oscuro (hero, pie, AdminLTE) |
| `shell` / `pearl` | `navy-soft` | 10,67 · 7,02:1 | Hover del sidebar y detalle premium |
| `pearl` | `navy` | 9,72:1 | Iconos y cifras sobre el sidebar |
| `success` / `warning` / `error` / `info` | `mist` | 5,01 · 5,32 · 6,16 · 6,35:1 | Estados como texto |
| `success` / `warning` / `error` / `info` | su `*-bg` | 4,59 · 4,98 · 5,41 · 5,72:1 | Bandas de estado |
| `ink` | `success-bg` / `warning-bg` / `error-bg` / `info-bg` | 14,44 · 14,78 · 13,86 · 14,22:1 | Texto principal sobre banda |
| `shell` | `success` / `error` | 5,32 · 6,54:1 | Texto sobre relleno de estado |
| `fern` | tinte `fern` al 10 % | 5,04:1 | Chip «LIBRE» del tablero de recepción |
| `shell` / `mist` | velo `navy` al 65 % | 4,79 · 4,51:1 | Texto del hero sobre fotografía |
| `line-strong` | `shell` / `mist` / `mist-2` | 3,99 · 3,77 · 3,45:1 | **Fronteras de control** (mínimo 3:1) |

### 7.2 Pares prohibidos (medidos)

| Combinación | Ratio | Por qué se prohíbe |
|---|---|---|
| `#FFFFFF` sobre velo `navy` al 35 % (`#ABB4BC`) | 2,10:1 | Ni siquiera vale para texto grande |
| `pearl` (`#C3D4E0`) sobre blanco | 1,52:1 | El detalle premium solo existe sobre oscuro |
| `amber` (`#B98324`) sobre blanco | 3,31:1 | Detalle decorativo: nunca texto en claro |
| `line` (`#DBE7EF`) como frontera de control sobre `mist` | 1,19:1 | Incumple WCAG 1.4.11 (mínimo 3:1) |
| Texto deshabilitado | — | **Exento** por WCAG 2.1 · 1.4.3 (componentes inactivos) |

### 7.3 Teclado, foco y semántica

- **Foco visible**: doble anillo porcelana + azur (`outline` 2 px `azure` + `box-shadow` 4 px
  `mist-2`), ≥ 3:1 contra los colores adyacentes (WCAG 1.4.11 / 2.4.7).
- **Área táctil** ≥ 44 × 44 px en toda acción (`min-h-touch`).
- **Formularios**: etiqueta asociada, error junto al campo y `role="alert"`; los controles declaran su
  frontera con `line-strong`.
- **Tablas**: `<caption>` (visible solo para lectores), `scope="col"` y `scope="row"`, región
  desplazable con nombre y `tabIndex={0}`.
- **Gráficas**: `role="img"` con nombre accesible, leyenda en HTML y **tabla de datos equivalente**
  dentro de un `<details>`.
- **Idioma**: `<html lang>` según la preferencia (ES/EN/RU) y cirílico cubierto por las fuentes de
  marca (Playfair Display + Manrope).
- **Escaneo real**: axe + Playwright en `chromium` y `mobile` sobre las rutas públicas y de personal,
  sin violaciones `critical`/`serious`.

---

## 8. Versionado

| Versión | Fecha | Cambios |
|---|---|---|
| **2.0.0** | 2026-10 | **Rediseño completo «Brisa Marina»** (sustituye a «Mediterráneo editorial»): vocabulario de tokens nuevo (`mist`, `mist-2`, `azure`, `azure-deep`, `navy`, `navy-soft`, `pearl`, `coral`, `coral-text`, `amber`, `fern` + `shell`, `line`, `line-strong`, `ink`, `ink-soft` y los cuatro estados con valores nuevos); tipografías **Playfair Display + Manrope** con cirílico nativo (se retira la cascada de respaldo Fraunces/Hanken/Playfair/Inter); **sombras frías**; velo del hero al 65 % (4,79:1); frontera de controles `line-strong #6B8296`; migración token a token en **142 ficheros** (código, guardianes, `docs/imagenes/*.svg`, maqueta del catálogo, generador de manuales y documentación); `contrast-audit.mjs` reescrito (**50 pares**, 0 fallos); guardián `cyrillic-fonts.test.ts` reescrito para la nueva arquitectura. **Verificado**: 584/584 pruebas de `apps/web`, `pnpm typecheck` y `next build` en verde. **Dos ajustes de diseño por medición**: `warning` `#96690E`→`#8A5F0C` (4,29→4,98:1 sobre su banda) y `fern` `#2E7D57`→`#276E4C` (chip sobre tinte al 10 %: 4,18→5,04:1). |
| **1.2.2** | 2026-09-29 | Acceso unificado bajo la plantilla (D-82): `AdminSignInScreen` se compone a través de `AdminLayout` con el prop `gate`; se retira `WalletBar` del acceso. |
| **1.2.1** | 2026-09-29 | Reparto de las barras del back-office (D-80/D-81): la navbar queda para **Ayuda** y el bloque de sesión pasa al panel **Administración**. |
| **1.2.0** | 2026-09-29 | **Redistribución del back-office al estilo AdminLTE** (D-78/D-79): sidebar izquierda plegable a mini, navbar, `content-header` con migas, `content-wrapper`, KPI `small-box` y guardián `admin-shell.test.ts`. |
| **1.1.0** | 2026-09-27 | Aplicación al producto: sidebar de administración en registro marino y migración de los 30 estilos de estado improvisados a los tokens semánticos. |
| **1.0.0** | 2026-09-27 | Primera edición de «Mediterráneo editorial»: 12 tokens aditivos, 7 niveles tipográficos, radio `brand-xs`, cascada cirílica, componentes de las suites pública y de personal, frontera de controles (H-7) y guardianes. |

---

## 9. Verificación y límites declarados

```bash
node scripts/design/contrast-audit.mjs                 # 50 pares WCAG con veredicto y corrección
node scripts/design/brand-sheet.mjs                    # hoja de identidad (HTML + PNG) desde el preset
pnpm --filter @hotel/web exec vitest run src/lib       # guardianes de la identidad visual
pnpm --filter @hotel/web test                          # suite completa (584 pruebas)
pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts   # axe en navegador real
```

**Evidencia visual (artefacto, no maqueta)**:

| Pieza | Fichero | Qué demuestra |
|---|---|---|
| Hoja de identidad | [`evidencias/identidad-brisa-marina.png`](./evidencias/identidad-brisa-marina.png) · [`.html`](./evidencias/identidad-brisa-marina.html) | Paleta por roles, tipografías con cirílico, componentes, elevación y pares aprobados/prohibidos. **Generada** con el CSS del preset real y las fuentes del build ([`scripts/design/brand-sheet.mjs`](../scripts/design/brand-sheet.mjs)); los ratios se calculan al vuelo. |
| Landing real | [`evidencias/pantalla-landing.png`](./evidencias/pantalla-landing.png) | Hero con velo `navy/65`, CTA coral, barra de reserva azur y secciones en porcelana (servidor real, `/`). |
| Catálogo | [`evidencias/pantalla-catalogo.png`](./evidencias/pantalla-catalogo.png) | Suite pública con los tokens nuevos. |
| Contacto (después) | [`evidencias/pantalla-contacto.png`](./evidencias/pantalla-contacto.png) | Página donde se corrigió el defecto de claves i18n (§9): muestra «Cómo llegar» y «Registro de viajeros». |
| Contacto (antes) | [`evidencias/pantalla-contacto-antes-del-arreglo.png`](./evidencias/pantalla-contacto-antes-del-arreglo.png) | Evidencia del defecto: la página pintaba `home.howToArrive.title` y `home.travelers.title`. |
| Back-office AdminLTE | [`evidencias/pantalla-admin-dashboard.png`](./evidencias/pantalla-admin-dashboard.png) · [`pantalla-admin-minteo.png`](./evidencias/pantalla-admin-minteo.png) | Sidebar `navy` con secciones `pearl`, pastilla activa `bg-shell text-navy`, navbar con **Ayuda**, migas y `content-wrapper`; sesión real (login + TOTP) y estado degradado honesto. |
| Recepción | [`evidencias/pantalla-recepcion.png`](./evidencias/pantalla-recepcion.png) | Suite de personal: 50 habitaciones con chip `fern` («Libre») y pestaña activa azur. |

**Resultado de la verificación del rediseño (2026-10):**

| Verificación | Resultado |
|---|---|
| `node scripts/design/contrast-audit.mjs` | 50 pares · **0** por debajo de su mínimo |
| `pnpm --filter @hotel/web exec vitest run src/lib src/components/admin` | guardianes de identidad, frontera, cirílico, tablas, marca, i18n y shell AdminLTE en verde |
| `pnpm --filter @hotel/web test` | **584 pruebas en verde** (más el guardián nuevo de claves i18n) |
| `pnpm --filter @hotel/web typecheck` | verde (6/6 en el workspace) |
| `pnpm --filter @hotel/web build` | verde, fuentes descargadas (`woff2` en `.next/static/media`) |
| `pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts` | **70/70** (35 rutas × chromium + Pixel 5) **sin violaciones `critical`/`serious`**, sobre el build de producción y PostgreSQL/Redis reales |
| `pnpm --filter @hotel/web manuals` | **35 manuales · 428 secciones** regenerados con la paleta nueva (0 restos de la anterior) |
| `node scripts/design/brand-sheet.mjs` | hoja de identidad generada (PNG a 2x + HTML con fuentes incluidas) |

**Límites declarados** (no se certifican):

- El escaneo axe **con datos reales** en el dashboard sigue pendiente (el spec fuerza vistas
  degradadas): heredado de M8 y ajeno a la identidad visual.
- El guardián de **claves i18n referenciadas** (`src/lib/i18n-keys.test.ts`) no puede resolver las
  claves construidas con plantilla (**49** en el producto, acotadas y declaradas en el propio test).
- La **cobertura de `apps/web`** (~25 % medido en M8) sigue siendo el hueco grande: los invariantes
  visuales se comprueban sobre el código y la paleta, no renderizando cada componente (Vitest corre
  en Node, sin DOM).
- La **app nativa** (llave NFC, conserjería) queda fuera de esta entrega (3.ª versión, D-49/D-50) y el
  **modo noche** del personal sigue **propuesto y no aprobado**.
- Los pares de este manual son los **declarados en el código**; una combinación nueva que aparezca en
  un `className` se mide automáticamente, pero una **imagen** con texto incrustado no se puede medir
  (por eso las piezas de marca se generan o se editan sobre la paleta, con guardián propio).
