# Propuesta B — «Posidonia»

> **Identidad visual v3** · Hotel Marina del Sol (Alicante) · **2026-10-23**
> **Estado**: candidata, no aplicada · **Previsualización**:
> [`previsualizaciones/propuesta-b-posidonia.html`](previsualizaciones/propuesta-b-posidonia.html) ·
> **Comparativa**: [`README.md`](README.md) · **Contraste completo**:
> [`contraste-propuesta-b-posidonia.md`](contraste-propuesta-b-posidonia.md) (44 pares, 0 fallos).

---

## 0. Ficha

| Campo | Valor |
|---|---|
| Nombre de la identidad | **Posidonia** |
| Lema | *Frescura de fondo, control a la vista.* |
| Concepto | Pradera de posidonia bajo un agua transparente: verde-teal profundo, aguas claras y arena |
| Personalidad | Fresca · crisp · sostenible · precisa · operativa |
| Público | Huésped/comprador, recepción, housekeeping, mantenimiento y propietaria |
| Superficies | Web pública ES/EN/RU · suites de personal · AdminLTE · web móvil · APK Android |
| AdminLTE | **Dark skin «sala de máquinas»**: rail oscuro clásico, activo posidonia |
| Tipografías | **Spectral** (display) + **Inter Tight** (UI) — ambas con cirílico |
| Token nuevo | `agua` (apoyo interactivo, gráficas y datos) |
| Esfuerzo de aplicación | ≈1–1,5 días-persona, incluida verificación |
| Base de partida | «Brisa Marina» v2.0.0 (solo cambian valores; el shell no se toca) |

---

## 1. Concepto y brief

**Qué es.** La identidad de un hotel costero con vocación **sostenible y operativa**: el verde-teal de
la posidonia (la pradera submarina que da transparencia al Mediterráneo), el agua clara y la arena. Es
más fría y energética que «Cal & Sal», y su back-office es el **rail oscuro clásico de AdminLTE**: el
mando se separa visualmente de la operación y el lienzo claro mantiene la frescura del escaparate.

**Por qué «Posidonia».** La posidonia es un ser vivo mediterráneo, no un color genérico: aporta relato
de sostenibilidad y un verde-teal con personalidad, distinto del azul cripto. La marca suena a costa
limpia y a tecnología que no presume. El coral aparece para la atención; la arena dorada es el detalle
premium; el «abismo» es el registro oscuro del hero, el pie y el sidebar.

**Tono.** Claro, directo y tranquilo; hospitalario con el huésped y **preciso** con el personal. La
interfaz dice lo que sabe y lo que no: cuando no puede verificar la cadena, lo explica y ofrece
reintentar. No vende una acción que vaya a fallar.

**Qué se toma y qué se descarta de las referencias reales**

| Referencia | Se adopta | Se descarta |
|---|---|---|
| Sistema vigente «Brisa Marina» | El esquema de tokens, la **distribución AdminLTE** y su registro oscuro, la ingeniería WCAG | El azul vívido: B lo lleva a **verde-teal posidonia** y el lienzo frío a bruma |
| `propuestaVisual-Hotel.md` | El marino como superficie oscura y la narrativa de hero + barra de reserva | Terracota clara como color interactivo y champagne como texto (no AA) |
| AdminLTE 3 | El **dark skin** del sidebar, el patrón `small-box` y la cabecera con migas | El skin claro como base: en B el rail oscuro es parte de la marca |
| El hotel real | La fotografía de habitación con terraza y mar, y el relato de sostenibilidad | Fotos con dominante excesivamente cálida como imagen de marca |

**Decisión de diseño clave.** Como en A, se conservan los **nombres de token** y se cambian sus valores;
el único token nuevo es `agua`. La diferencia es que **no hay que tocar el shell**: el sidebar ya usa
`navy`/`mist`/`pearl`, que simplemente pasan a los nuevos valores. B es la opción de **mínimo riesgo**.

---

## 2. Color por roles semánticos

| Rol | Token | HEX | HSL | Uso | Par medido |
|---|---|---|---|---|---|
| `background` | `mist` | `#F2F8F7` | `hsl(170 30% 96%)` | Lienzo de página: bruma de agua clara | texto `ink` → **15,36:1** AAA |
| `background-alt` | `mist-2` | `#E3EFEE` | `hsl(175 27% 91%)` | Bandas, filas alternas, estados suaves | texto `ink` → **14,03:1** AAA |
| `surface` | `shell` | `#FFFFFF` | `hsl(0 0% 100%)` | Tarjetas, formularios, modales, tabla | texto `ink` → **16,50:1** AAA |
| `text-primary` | `ink` | `#0C2226` | `hsl(189 52% 10%)` | Texto principal, titulares | sobre `mist` → **15,36:1** AAA |
| `text-secondary` | `ink-soft` | `#44605F` | `hsl(178 17% 32%)` | Texto secundario, ayudas, migas | sobre `mist` → **6,34:1** AA |
| `interactive` | `azure` | `#0B6A5A` | `hsl(170 81% 23%)` | Acción primaria, enlaces, foco (**posidonia**) | blanco encima → **6,51:1** AA |
| `interactive-hover` | `azure-deep` | `#074B40` | `hsl(170 83% 16%)` | Hover y pulsado | blanco → **10,05:1** AAA |
| `interactive-secondary` | **`agua`** (NUEVO) | `#0C7A87` | `hsl(186 84% 29%)` | Apoyo interactivo, gráficas y datos | blanco → **5,06:1** AA |
| `surface-dark` | `navy` | `#052528` | `hsl(185 78% 9%)` | Hero, pie, **sidebar AdminLTE**, velo (abismo) | blanco → **16,13:1** AAA |
| `surface-dark-alt` | `navy-soft` | `#0A3A3D` | `hsl(184 72% 14%)` | Superficie oscura secundaria, hover del sidebar | blanco → **12,46:1** AAA |
| `premium-dark` | `pearl` | `#BFD8D4` | `hsl(170 24% 80%)` | Detalle premium **solo sobre oscuro** | sobre `navy` → **10,75:1** AAA |
| `accent-fill` | `coral` | `#B44D33` | `hsl(12 56% 45%)` | Relleno de atención con texto blanco | blanco → **5,19:1** AA |
| `accent-text` | `coral-text` | `#963C24` | `hsl(13 61% 36%)` | Atención como **texto** sobre claro | sobre `shell` → **7,07:1** AAA |
| `premium-light` | `amber` | `#C9A66B` | `hsl(38 47% 60%)` | Detalle arena: etiqueta premium **con tinta encima** | tinta encima → **7,19:1** AAA |
| `available` | `fern` | `#2F7A58` | `hsl(153 44% 33%)` | Chip «disponible» / «libre» con texto blanco | blanco → **5,19:1** AA |
| `border` | `line` | `#D5E5E1` | `hsl(165 24% 87%)` | Filetes decorativos (no controles) | — |
| `border-strong` | `line-strong` | `#5C7B76` | `hsl(170 14% 42%)` | **Frontera de controles** (WCAG 1.4.11) | sobre `mist-2` → **3,92:1** ≥3:1 |
| `success` | `success` | `#196A45` | `hsl(153 62% 26%)` | Confirmaciones | sobre `success-bg` → **5,57:1** AA |
| `warning` | `warning` | `#855A0C` | `hsl(39 83% 28%)` | Avisos | sobre `warning-bg` → **5,29:1** AA |
| `error` | `error` | `#A3291E` | `hsl(5 69% 38%)` | Errores y bloqueos | sobre `error-bg` → **5,89:1** AA |
| `info` | `info` | `#0C6673` | `hsl(188 81% 25%)` | Información y ayuda | sobre `info-bg` → **5,56:1** AA |

### 2.1 Reglas de color

1. **La posidonia (`azure`) es la acción**; el **agua (`agua`)** es apoyo (datos, gráficas, enlaces
   secundarios); el coral es atención; el abismo es el registro oscuro.
2. La **arena (`amber`)** es una **superficie**: se usa con **tinta** encima (7,19:1). Como texto sobre
   blanco da **2,30:1** y está **prohibido**.
3. La `pearl` **solo existe sobre oscuro** (10,75:1 sobre el abismo). Sobre blanco, 1,50:1.
4. Las **fronteras de controles** usan `line-strong` (≥3:1). `line` como frontera de `input` da
   **1,21:1**: prohibido.
5. El **velo del hero** va al **70 %** del abismo: compuesto `#506669`, blanco **6,09:1**.
6. El color **nunca es el único canal**: estados con texto y símbolo; gráficas con leyenda HTML y tabla
   equivalente.

### 2.2 Pares prohibidos (medidos)

| Combinación | Ratio | Por qué |
|---|---|---|
| `ink` sobre `navy` | **1,02:1** | La tinta desaparece en el abismo |
| `pearl` sobre `shell` | **1,50:1** | El detalle premium solo existe sobre oscuro |
| `amber` sobre `shell` | **2,30:1** | La arena es una superficie, no un texto |
| `line` como frontera de control sobre `mist` | **1,21:1** | Incumple WCAG 1.4.11 (mínimo 3:1) |

---

## 3. Tipografía

### 3.1 Familias y por qué

| Uso | Familia | Pesos cargados | Respaldo | Por qué |
|---|---|---|---|---|
| Display (titulares, precios, KPI) | **Spectral** | 500 · 600 · 700 | `"Iowan Old Style", Georgia, serif` | Serif de pantalla con carácter contemporáneo y curva suave; cirílico nativo; buena lectura a tamaños medios |
| Interfaz, cuerpo, tablas, botones | **Inter Tight** | 400 · 500 · 600 · 700 | `"Segoe UI", system-ui, -apple-system, sans-serif` | Grotesca de alta densidad, métricas ajustadas y cifras tabulares: ideal para tablas, KPI y APK; cirílico |

- **RU cubierto por la marca**: `subsets: ["latin", "cyrillic"]` en ambas familias.
- **Solo 3 + 4 pesos**; no se cargan pesos sin uso.
- **Cuerpo mínimo 17 px** (16 sp en APK), interlineado 1,55, medida ≤ 66 ch.

### 3.2 Escala modular

| Nivel | Tamaño | Peso | Interlineado | Tracking | Uso |
|---|---|---|---|---|---|
| `display` | `clamp(2.75rem, 1.85rem + 4.2vw, 5rem)` · 44–80 px | 600 | 1,00 | −0,03em | Hero de la landing |
| `h1` | `clamp(2.25rem, 1.6rem + 2.9vw, 3.875rem)` · 36–62 px | 600 | 1,05 | −0,025em | Título de página |
| `h2` | `clamp(1.625rem, 1.3rem + 1.45vw, 2.375rem)` · 26–38 px | 600 | 1,12 | −0,015em | Sección |
| `h3` | `1.3125rem` · 21 px | 600 | 1,25 | 0 | Subtítulo / tarjeta |
| `h4` | `1.0625rem` · 17 px | 600 | 1,35 | 0 | Cabecera de bloque |
| `body-lg` | `1.1875rem` · 19 px | 400 | 1,60 | 0 | Entradilla |
| `body` | `1.0625rem` · **17 px** | 400 | 1,55 | 0 | Texto base (mínimo 17 px) |
| `body-sm` | `0.9375rem` · 15 px | 400 | 1,50 | 0 | Tablas densas de personal |
| `small` | `0.875rem` · 14 px | 500 | 1,45 | 0 | Ayudas y etiquetas |
| `caption` | `0.8125rem` · 13 px | 400 | 1,40 | 0,01em | Metadatos y pie |
| `overline` | `0.75rem` · 12 px | 600 | 1,40 | **0,12em** | *Eyebrow* en mayúsculas |
| `micro` | `0.75rem` · 12 px | 500 | 1,40 | 0,04em | Chips y estados |
| `code` | `0.875rem` · 14 px | 400 | 1,40 | 0 | Hash, `tokenId`, direcciones |

El tracking de la display es algo más cerrado que en A (−0,03em) para que Spectral gane presencia en
pantalla; el `overline` usa 0,12em (más contenido que A).


### 3.3 Marca y lockup

| Pieza | Construcción | Uso |
|---|---|---|
| **Lockup principal** | Monograma **M·S** en disco `azure` (posidonia) con texto `shell` (44 px) + «MARINA DEL SOL» en Inter Tight 700, mayúsculas, tracking **0,20 em**, y «ALICANTE · COSTA BLANCA» en 9,5 px con tracking 0,15 em | Cabecera pública, admin, pie |
| **Versión negativa** | Monograma en disco `pearl` con texto `navy`; textos en `mist`/`pearl` | Hero, pie, imagen social, pases |
| **Monograma suelto** | Disco posidonia + «M·S» en `bruma` | Avatar, favicon, *adaptive icon* de la APK (fondo posidonia, glifo bruma) |

**Reglas**: área de respeto = altura de la «M»; no se deforma, no se rota, no se le añade sombra; sobre
fotografía se usa **siempre** la versión negativa con el velo al 70 %; el nombre no se escribe en la
serif de display. Marca y wordmark viven en los componentes `BrandMark`/`SiteHeader`, no en imágenes
sueltas.

---

## 4. Espaciado, formas, elevación, rejilla y movimiento

- **Espaciado** (base 4 px): 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96.
- **Radios** (más crisp que A, lenguaje de instrumento):
  `brand-xs 4 px` · `brand-sm 8 px` · `brand 14 px` · `brand-lg 20 px` · `pill 9999 px`.
- **Elevación** (fría, teñida de posidonia/abismo):
  `card` `0 1px 2px rgba(5,37,40,.06), 0 8px 22px rgba(11,106,90,.10)` ·
  `card-hover` `0 14px 32px rgba(5,37,40,.16)` · `modal` `0 26px 68px rgba(5,37,40,.26)`.
- **Área táctil**: **44 × 44 px** en web; **48 dp** en APK.
- **Rejilla y breakpoints**: móvil < 768 (1 columna) · tablet 768–1023 (2 columnas, drawer) ·
  desktop ≥ 1024 (sidebar fija, 3 columnas; contenido máx. 1.200 px; AdminLTE hasta 1.440 px).
- **Movimiento**: `cubic-bezier(.2,.7,.2,1)`; hover `translateY(-3px)` y cambio de borde (sin zoom
  agresivo); revelado 0,4 s, sin retardos en móvil. Respeta `prefers-reduced-motion`.

---

## 5. AdminLTE — dark skin «sala de máquinas»

La distribución es la misma (sidebar plegable con acordeón de una sección abierta, navbar, migas,
`content-wrapper`, `small-box`, pie). **No hay cambio estructural**: el sidebar ya era oscuro.

| Pieza (componente real) | Especificación B | Contraste |
|---|---|---|
| Sidebar (`bg-navy`, `text-mist`) | Abismo `#052528`; marca con monograma posidonia; secciones en `overline` `pearl`; ítem 44 px | texto **15,02:1** · secciones **10,75:1** |
| Entrada activa | Pastilla **posidonia** con texto blanco | **6,51:1** AA |
| Hover del ítem | `navy-soft` con texto bruma | **11,60:1** AAA |
| Bloqueado | `opacity-50`, candado SVG, `aria-disabled` | exento (inactivo) |
| Navbar | Blanca, borde `line`, buscador pill `mist` con frontera `line-strong` | texto **16,50:1** |
| Cabecera de contenido | Migas `ink-soft`, título serif, acciones | **6,81:1** migas |
| `small-box` / KPI | Tarjeta blanca, icono en tile `mist-2` con glifo posidonia, cifra serif, delta `fern`/`coral-text` | cifra **16,50:1** |
| Tablas densas | Cabecera `mist-2` + `overline`, filas 44 px, hover, pastillas de estado | texto **15,36:1** |
| Formularios | `input` 44 px, frontera `line-strong`, foco doble anillo posidonia, etiqueta 14/600 | frontera **4,30:1** |
| Drawer móvil | Cajón + velo `navy/60`, `Escape`, devolución de foco | texto ≥ 4,5:1 |
| Gráficas | Barras en `azure` + `amber` (arena); leyenda HTML y tabla equivalente | series distinguibles sin depender del color |

**Implementación**: **cero cambios de shell**. Solo se re-visten los valores; `admin-shell.test.ts`
sigue verde sin tocarlo. Esta es la ventaja operativa de B.

---

## 6. Web · Móvil · APK

### 6.1 Web

- Mobile-first a 320 px, sin scroll horizontal, acciones al pulgar.
- Header con marca, navegación, idioma ES/EN/RU y CTA posidonia.
- Hero a sangre con velo del abismo al 70 % y **barra de reserva flotante**.
- Catálogo 1/2/3 columnas; tarjetas con foto, badge y precio en serif Spectral.
- Personal: tablas densas, chips de estado y navegación inferior en móvil.

### 6.2 Móvil / APK (Compose)

- **Mismos valores**: el borrador [`tokens/android-theme-propuesta-b-posidonia.kt`](tokens/android-theme-propuesta-b-posidonia.kt)
  construye el `lightColorScheme` desde los mismos HEX; **sin Material You dinámico**.
- **48 dp** de área táctil, **16 sp** de cuerpo, cifras tabulares con Inter Tight, titulares Spectral.
- Pantallas del huésped («Mis noches» con QR offline, estado de estancia, reventa), housekeeping de un
  toque y barra inferior de 4 destinos.
- Estados honestos y pase offline; el modo noche del personal queda fuera de alcance.

**Mapeo de roles web → Material 3**

| Token web | Rol Material 3 | Uso en la APK |
|---|---|---|
| `mist` | `background` | Fondo de pantalla |
| `shell` | `surface` | Tarjetas y hojas |
| `ink` | `onBackground` / `onSurface` | Texto principal |
| `ink-soft` | `onSurfaceVariant` | Texto secundario |
| `azure` | `primary` | CTA, tab activo, foco |
| `shell` | `onPrimary` | Texto sobre CTA |
| `mist-2` | `primaryContainer` / `surfaceVariant` | Chips y bandas |
| `agua` | Color de marca para gráficas (`MarinaColors.agua`), sin rol M3 directo | Series de datos y apoyo |
| `coral` | `secondary` / `tertiary` | Atención |
| `amber` | `tertiaryContainer` (con tinta) | Premium arena |
| `navy` | `inverseSurface` | Cabecera oscura del pase |
| `pearl` | `inverseOnSurface` | Detalle sobre oscuro |
| `line-strong` | `outline` | Frontera de controles |
| `line` | `outlineVariant` | Divisores |
| `error` / `error-bg` | `error` / `errorContainer` | Errores |

---

## 7. UX intuitiva

### 7.1 Arquitectura de información (se conserva la real)

**Público**: Inicio · Habitaciones · Experiencias · El hotel · Reventa · Ayuda · Wallet · «Reservar».
Compra en **3 pasos** con resumen fijo y la misma tasa que el cobro; la noche de hoy no es vendible y se
explica en línea.

**Back-office AdminLTE**: las **8 secciones reales** — Habitación, Recepción, Housekeeping, Actividades,
Mantenimiento, Administración, Plataforma y Sistemas —, con migas derivadas de la ruta y una sola
sección abierta. La identidad no cambia destinos ni orden.

### 7.2 Flujos clave y microcopy

| Flujo | Patrón de UX | Microcopy (ES · EN · RU) |
|---|---|---|
| Reservar una noche | Hero → fechas → catálogo → checkout 3 pasos con resumen | «Reservar una noche» · *Book a night* · «Забронировать ночь» |
| «Mis noches» | Pase con QR, estado y acciones primaria/secundaria | «Tus noches» · *Your nights* · «Ваши ночи» |
| Check-in | Buscar reserva → pase → confirmar; QR sin red | «Check-in disponible» · *Check-in available* · «Регистрация доступна» |
| Housekeeping | Tablero de planta, un toque por acción, progreso | «Marcar limpia» · *Mark clean* · «Отметить убранной» |
| Admin: publicar | Formulario corto, validación en línea, confirmación on-chain explicada | «Publicar noche» · *Publish night* · «Опубликовать ночь» |
| Degradado | Mensaje honesto + reintento; nunca una acción condenada a revertir | «No pudimos comprobar la cadena» · *We couldn’t verify the chain* · «Не удалось проверить сеть» |

- Un solo CTA primario por pantalla; destructivas en `error` con confirmación.
- Teclado completo, foco visible doble anillo, `Escape` cierra overlays y devuelve el foco.
- Estados: default · hover · focus · active · disabled · loading · error · vacío · degradado.
- Errores junto al campo (`role="alert"`), nunca solo en toast.

---

## 8. Componentes (Atomic Design)

| Nivel | Inventario | Estados obligatorios |
|---|---|---|
| **Átomos** | Botón (primario/secundario/ghost/peligro; 44 px), enlace, badge (Suite/Reventa/Disponible), chip de filtro (`aria-pressed`), input/select/textarea, checkbox/toggle, `Stars`, `Money`, icono (trazo 2 px), divisor | default · hover · **focus-visible** · active · disabled · loading · error |
| **Moléculas** | `Field`, `SearchBar`, `FilterBar`, `DateRangePicker`, `GuestSelector`, `NightCard`, `SuiteCard`, `BookingBar`, `StickySummary`, `RoomStatusChip`, `MetricCard`, `ChatBubble`/`Composer`, `TxStepper` | default · hover · foco · vacío · degradado |
| **Organismos** | `SiteHeader`, `Footer`, `Hero`, `CatalogGrid`, `HistoryTable`, `DataTable`, `DashboardGrid`, `MintForm`, `AdminSidebar`/`AdminLayout` (dark skin), `DayBoard`, `HousekeepingBoard`, `MaintenanceBoard`, `ResaleManager`, `TxModal`, `EmptyState`/`DegradedState` | default · cargando · vacío · degradado · error |
| **Plantillas** | `PublicShell` · `FrontOfficeShell` · `StaffShell` (móvil) · `AdminLayout` (AdminLTE) | — |

**Reglas de oro**

- Todos los valores salen de tokens; ni un HEX en JSX.
- Frontera de controles `line-strong`; foco visible medido; 44 px de área táctil.
- Estados con texto + símbolo + `aria`, no solo color.
- En gráficas, series distinguibles también por forma/etiqueta y con tabla equivalente.

---

## 9. Implementación

### 9.1 Valores a sustituir (mismo nombre de token)

```js
// packages/config/tailwind/preset.cjs — theme.extend.colors
colors: {
  mist: "#F2F8F7",
  "mist-2": "#E3EFEE",
  shell: "#FFFFFF",
  ink: "#0C2226",
  "ink-soft": "#44605F",
  azure: "#0B6A5A",
  "azure-deep": "#074B40",
  agua: "#0C7A87",          // NUEVO (interactive-secondary / datos)
  navy: "#052528",
  "navy-soft": "#0A3A3D",
  pearl: "#BFD8D4",
  coral: "#B44D33",
  "coral-text": "#963C24",
  amber: "#C9A66B",
  fern: "#2F7A58",
  line: "#D5E5E1",
  "line-strong": "#5C7B76",
  success: "#196A45", "success-bg": "#DFF0E7",
  warning: "#855A0C", "warning-bg": "#F9EFD4",
  error: "#A3291E",   "error-bg": "#F8E3DF",
  info: "#0C6673",    "info-bg": "#DEEEF1",
},
fontFamily: {
  display: ["var(--font-display)", "Iowan Old Style", "Georgia", "serif"],
  sans: ["var(--font-sans)", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
},
borderRadius: { "brand-xs": "4px", "brand-sm": "8px", brand: "14px", "brand-lg": "20px", pill: "9999px" },
boxShadow: {
  card: "0 1px 2px rgba(5,37,40,.06), 0 8px 22px rgba(11,106,90,.10)",
  "card-hover": "0 14px 32px rgba(5,37,40,.16)",
  modal: "0 26px 68px rgba(5,37,40,.26)",
},
```

### 9.2 Ficheros a tocar

| # | Fichero | Cambio |
|---|---|---|
| 1 | `packages/config/tailwind/preset.cjs` | valores (+`agua`), `fontFamily`, `fontSize`, `borderRadius`, `boxShadow` |
| 2 | `apps/web/src/lib/a11y/palette.ts` | mismos HEX + `agua` + pares declarados |
| 3 | `apps/web/src/app/globals.css` | `:root` y variables de fuente; foco |
| 4 | `apps/web/src/app/layout.tsx` | `Spectral` + `Inter_Tight` con `subsets:["latin","cyrillic"]` |
| 5 | `scripts/design/contrast-audit.mjs` | pares y umbrales |
| 6 | `scripts/design/brand-sheet.mjs` | muestras/roles nuevos |
| 7 | `docs/DISENO-UX.md`, `docs/ACCESIBILIDAD-WCAG.md`, `RepoTecnico/Manual_Identidad_Visual.md` | guía v3 |
| 8 | `docs/imagenes/*.svg`, `opengraph-image.tsx`, manuales y PDF | regenerados desde el preset |
| 9 | `apps/mobile` (futuro A1.4) | `Color.kt`/`Theme.kt` desde el borrador Compose |

**No se toca** `AdminLayout.tsx` ni `admin-shell.test.ts`: el rail oscuro ya está implementado.

### 9.3 Pasos y verificación

1. Tokens (1–3) → `node scripts/design/contrast-audit.mjs` (**0 fallos**).
2. Tipografía (4) → `pnpm --filter @hotel/web build`.
3. Docs (7) y evidencias (5–6, 8) → sin restos de la paleta anterior.
4. Cierre: `pnpm typecheck` · `pnpm lint` · `pnpm --filter @hotel/web test` ·
   `pnpm --filter @hotel/web build` · `playwright test e2e/a11y.spec.ts`.

### 9.4 Esfuerzo, riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Diferenciación insuficiente** frente al azul actual de Brisa Marina | Medio | El verde-teal ya cambia la percepción; si el responsable quiere más contraste de marca, A es la opción |
| El **agua** como color de datos se confunde con la posidonia | Bajo | `agua` se reserva a gráficas/apoyo y no compite con el CTA; en tablas se usa texto (`info`) |
| La **arena** como texto (2,30:1) se cuela en algún componente | Bajo | Guardián `a11y.test.ts` mide los pares reales; el generador prohíbe el par |
| Cirílico de Spectral/Inter Tight | Bajo | `cyrillic-fonts.test.ts` + revisión RU |

**Estimación**: ≈1–1,5 días-persona (tokens 0,5 · tipografía 0,25 · docs y evidencias 0,5 ·
verificación 0,25).

---

## 10. Accesibilidad

- **WCAG 2.1 AA** en los **44 pares** medidos (0 fallos); varios AAA. Fronteras de control ≥3:1.
- Foco visible doble anillo posidonia + bruma, ≥3:1 contra adyacentes.
- Área táctil ≥44 px (48 dp en APK); sin scroll horizontal a 320 px.
- Formularios con etiqueta asociada, error junto al campo y `role="alert"`.
- Tablas con `<caption>`, `scope` y región desplazable con nombre y `tabIndex={0}`.
- Gráficas con `role="img"`, nombre accesible, leyenda HTML y tabla equivalente en `<details>`.
- `html lang` dinámico; cirílico cubierto por las fuentes de marca.
- `prefers-reduced-motion` respetado.
- Pares prohibidos en §2.2 y en [`contraste-propuesta-b-posidonia.md`](contraste-propuesta-b-posidonia.md).

---

## 11. Do's & Don'ts

| ✅ Hazlo | ❌ No lo hagas |
|---|---|
| Usa posidonia (`azure`) para la acción y `agua` para datos/apoyo | Pintar el CTA principal con `amber` o `agua` |
| Usa `amber` como **superficie** con tinta (7,19:1) | Usar `amber` como texto sobre blanco (2,30:1) |
| Mantén `pearl` sobre el abismo | Usar `pearl` sobre blanco (1,50:1) |
| Frontera de controles con `line-strong` (4,30:1 sobre `mist`) | Usar `line` como frontera de un `input` (1,21:1) |
| Velo del hero ≥70 % | Bajar el velo y perder el titular |
| Serie de datos con etiqueta/leyenda, no solo color | Confiar en que dos verdes se distinguen a simple vista |
| Degradar con honestidad y reintento | Ofrecer acciones que revertirán |
| Un solo CTA primario por pantalla | Competir con varios botones verdes en la misma vista |

---

## 12. Changelog

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-10-23 | 3.0.0-candidate-B | Primera edición de «Posidonia»: paleta completa por roles (25 valores: 21 roles + 4 bandas de estado, incluido el token nuevo `agua`), tipografía Spectral + Inter Tight, escala, radii/sombras, AdminLTE dark skin sin cambio de shell, paridad web/móvil/APK, 44 pares WCAG, plan de implementación. **No aplicada.** |
