# Propuesta A — «Cal & Sal»

> **Identidad visual v3** · Hotel Marina del Sol (Alicante) · **2026-10-23**
> **Estado**: candidata **recomendada**, no aplicada · **Previsualización**:
> [`previsualizaciones/propuesta-a-cal-y-sal.html`](previsualizaciones/propuesta-a-cal-y-sal.html) ·
> **Comparativa**: [`README.md`](README.md) · **Contraste completo**:
> [`contraste-propuesta-a-cal-y-sal.md`](contraste-propuesta-a-cal-y-sal.md) (42 pares, 0 fallos).

---

## 0. Ficha

| Campo | Valor |
|---|---|
| Nombre de la identidad | **Cal & Sal** («cal y sal») |
| Lema | *Luz de cal, azul de mar.* |
| Concepto | Mediterráneo **encalado**: caliza tibia, sombra de arco, agua profunda y un tiesto de terracota al sol |
| Personalidad | Cálida · editorial · hospitalaria · artesanal · luminosa |
| Público | Huésped/comprador (escaparate), recepción, housekeeping, mantenimiento y propietaria (back-office) |
| Superficies | Web pública ES/EN/RU · 4 suites de personal · AdminLTE · web móvil · APK Android |
| AdminLTE | **Light skin «salón de luz»** |
| Tipografías | **Cormorant Garamond** (display) + **Onest** (UI) — ambas con cirílico |
| Token nuevo | `arena` (superficie elevada cálida) |
| Esfuerzo de aplicación | ≈1,5–2 días-persona, incluida verificación |
| Base de partida | «Brisa Marina» v2.0.0 (misma API de tokens, mismos guardianes) |

---

## 1. Concepto y brief

**Qué es.** La identidad de un hotel boutique de la costa de Alicante que vende noches en propiedad:
luz, aire, cal y agua. La frescura no viene del blanco frío ni del azul tecnológico, sino de un
**lienzo cálido** (caliza) sobre el que la fotografía y la tipografía hacen el trabajo. El resultado
debe parecer *el sitio de un hotel real con encanto*, no un marketplace de NFTs.

**Por qué «Cal & Sal».** La cal es la arquitectura mediterránea (paredes encaladas, arcos, sombra); la
sal es el mar y la mesa. Juntas dan una marca **táctil y luminosa**, con memoria de lugar. El azul mar
profundo queda para lo accionable y el marino para lo que debe pesar (hero, pie, velo); la terracota
aparece poco y con intención; el olivo es el estado disponible y el azafrán el detalle premium.

**Tono.** Claro, hospitalario y sin jerga técnica delante del huésped; **honesto** cuando algo no se
puede comprobar (RPC caído, contrato en pausa, tarifa no publicada). La interfaz nunca ofrece una
acción que vaya a fallar.

**Qué se toma y qué se descarta de las referencias reales**

| Referencia | Se adopta | Se descarta |
|---|---|---|
| Sistema vigente «Brisa Marina» | La **estructura de tokens**, la distribución **AdminLTE**, la ingeniería de accesibilidad y los 8 apartados del menú | El lienzo de porcelana fría y el azul vívido: A los sustituye por caliza y azul mar para ganar calidez y diferenciación |
| `propuestaVisual-Hotel.md` («Marina Sol») | El **marino editorial** como superficie oscura, el hero a sangre y la barra de reserva flotante | Las terracotas claras como color interactivo y el champagne como texto (no cumplían AA) |
| El hotel real (fotos de `docs/imagenes/`) | La **fotografía de habitación con luz cálida** como protagonista; el velo marino al 70 % | Fotos con dominante fría como imagen principal de marca |
| AdminLTE 3 | La distribución y el patrón `small-box`; **skin claro** con sidebar en caliza | El skin oscuro clásico como único registro (A reserva el oscuro para el hero/pie) |

**Decisión de diseño clave.** Se **conservan los nombres de token** del proyecto (`mist`, `shell`,
`ink`, `azure`, `navy`, `pearl`, `coral`, `amber`, `fern`, `line`, estados) y se cambian sus **valores**.
No hay renombrado ni migración de 142 ficheros: la identidad cambia por dentro del design system. El
único token nuevo es `arena`.

---

## 2. Color por roles semánticos

Los roles son los del código; el **token** es el nombre con el que se escribe la clase. La tabla
incluye el par con el que se usa y su ratio medido (detalle completo en
[`contraste-propuesta-a-cal-y-sal.md`](contraste-propuesta-a-cal-y-sal.md)).

| Rol | Token | HEX | HSL | Uso | Par medido |
|---|---|---|---|---|---|
| `background` | `mist` | `#F8F3E9` | `hsl(40 52% 94%)` | Lienzo de página: la caliza tibia del patio | texto `ink` → **14,64:1** AAA |
| `background-alt` | `mist-2` | `#EFE7D6` | `hsl(41 44% 89%)` | Bandas, filas alternas, **sidebar AdminLTE claro** | texto `ink` → **13,16:1** AAA |
| `surface` | `shell` | `#FFFFFF` | `hsl(0 0% 100%)` | Tarjetas, formularios, modales, tabla | texto `ink` → **16,19:1** AAA |
| `surface-raised` | **`arena`** (NUEVO) | `#E9DDC8` | `hsl(38 43% 85%)` | Superficie elevada cálida, hover del sidebar, chips | texto `ink` → **12,06:1** AAA |
| `text-primary` | `ink` | `#15222C` | `hsl(206 35% 13%)` | Texto principal, titulares | sobre `mist` → **14,64:1** AAA |
| `text-secondary` | `ink-soft` | `#495764` | `hsl(209 16% 34%)` | Texto secundario, ayudas, migas | sobre `mist` → **6,71:1** AA |
| `interactive` | `azure` | `#0B5C74` | `hsl(194 83% 25%)` | Acción primaria, enlaces, **anillo de foco** | blanco encima → **7,51:1** AAA |
| `interactive-hover` | `azure-deep` | `#084659` | `hsl(194 84% 19%)` | Hover y pulsado | blanco → **10,34:1** AAA |
| `surface-dark` | `navy` | `#0F2833` | `hsl(198 55% 13%)` | Hero, pie, velo del hero, acceso | blanco → **15,31:1** AAA |
| `surface-dark-alt` | `navy-soft` | `#1A3B49` | `hsl(198 47% 19%)` | Superficie oscura secundaria, hover | blanco → **11,89:1** AAA |
| `premium-dark` | `pearl` | `#D9E8EC` | `hsl(193 33% 89%)` | Detalle premium **solo sobre oscuro** (sal) | sobre `navy` → **12,18:1** AAA |
| `accent-fill` | `coral` | `#AE4E2A` | `hsl(16 61% 42%)` | Relleno de atención (terracota) con texto blanco | blanco → **5,35:1** AA |
| `accent-text` | `coral-text` | `#8F3D1E` | `hsl(16 65% 34%)` | Atención como **texto** sobre claro | sobre `shell` → **7,36:1** AAA |
| `premium-light` | `amber` | `#9A6A12` | `hsl(39 79% 34%)` | Etiqueta premium «Suite» **con texto blanco** | blanco → **4,73:1** AA |
| `available` | `fern` | `#56682F` | `hsl(79 38% 30%)` | Chip «disponible» / «libre» con texto blanco | blanco → **6,15:1** AA |
| `border` | `line` | `#E4D9C5` | `hsl(39 36% 83%)` | Filetes decorativos (no controles) | — |
| `border-strong` | `line-strong` | `#8B7A62` | `hsl(35 17% 46%)` | **Frontera de controles** (WCAG 1.4.11) | sobre `mist-2` → **3,38:1** ≥3:1 |
| `success` | `success` | `#1C6E48` | `hsl(152 59% 27%)` | Confirmaciones | sobre `success-bg` → **5,30:1** AA |
| `warning` | `warning` | `#875A0B` | `hsl(38 85% 29%)` | Avisos | sobre `warning-bg` → **5,24:1** AA |
| `error` | `error` | `#A62A1F` | `hsl(5 69% 39%)` | Errores y bloqueos | sobre `error-bg` → **5,72:1** AA |
| `info` | `info` | `#1E6273` | `hsl(192 59% 28%)` | Información y ayuda | sobre `info-bg` → **5,77:1** AA |

### 2.1 Reglas de color

1. **El azul mar (`azure`) es la acción**; el coral es la **atención** (relleno con blanco; como texto,
   `coral-text`); el marino es el **registro oscuro**; la sal (`pearl`) **solo existe sobre oscuro**.
2. El **azafrán** es una **superficie** (etiqueta «Suite»), nunca texto sobre blanco: como texto da
   **3,43:1** (prohibido). El texto encima es **blanco** (4,73:1).
3. La **arena** (`arena`) solo se usa como superficie elevada o hover; con `ink` encima (12,06:1).
4. Las **fronteras de controles** usan `line-strong` (≥3:1). `line` es decorativo: como frontera de un
   `input` da **1,26:1** y está **prohibido** (WCAG 1.4.11).
5. El **velo del hero** va al **70 %** de `navy` sobre la foto: el compuesto sobre blanco es `#576970`
   y da **5,74:1** con texto blanco. Por debajo del 70 % no se usa.
6. El **color no es el único canal**: los estados llevan texto y, en tablas, símbolo.

### 2.2 Pares prohibidos (medidos)

| Combinación | Ratio | Por qué |
|---|---|---|
| `ink` sobre `navy` | **1,06:1** | La tinta desaparece en el registro oscuro |
| `pearl` sobre `shell` | **1,26:1** | El detalle premium solo existe sobre oscuro |
| `ink` sobre `amber` | **3,43:1** | El relleno premium reclama texto blanco (4,73:1) |
| `line` como frontera de control sobre `mist` | **1,26:1** | Incumple WCAG 1.4.11 (mínimo 3:1) |

---

## 3. Tipografía

### 3.1 Familias y por qué

| Uso | Familia | Pesos cargados | Respaldo | Por qué |
|---|---|---|---|---|
| Display (titulares, precios, nombres de habitación) | **Cormorant Garamond** | 500 · 600 · 700 | `"Iowan Old Style", Georgia, serif` | Serif de alto contraste, aire editorial y curvas mediterráneas; publica **cirílico** |
| Interfaz, cuerpo, tablas, botones | **Onest** | 400 · 500 · 600 · 700 | `"Segoe UI", system-ui, -apple-system, sans-serif` | Geométrica humanista contemporánea, muy legible en pantalla y densa en tablas; **cirílico nativo** |

- **RU cubierto por la marca**: ambas familias se cargan con `subsets: ["latin", "cyrillic"]`. La
  cascada glifo a glifo con fuentes del sistema (deuda del sistema anterior) no vuelve.
- **Solo 3 + 4 pesos**: no se cargan 9 pesos «por si acaso». En `next/font` se declaran los usados.
- **Cuerpo mínimo 17 px** (1,0625 rem), interlineado 1,55 y medida de línea ≤ 66 ch.

### 3.2 Escala modular

| Nivel | Tamaño | Peso | Interlineado | Tracking | Uso |
|---|---|---|---|---|---|
| `display` | `clamp(2.75rem, 1.85rem + 4.2vw, 5rem)` · 44–80 px | 600 | 0,98 | −0,02em | Hero de la landing y portada de sección |
| `h1` | `clamp(2.25rem, 1.6rem + 2.9vw, 3.875rem)` · 36–62 px | 600 | 1,03 | −0,015em | Título de página |
| `h2` | `clamp(1.625rem, 1.3rem + 1.45vw, 2.375rem)` · 26–38 px | 600 | 1,10 | −0,01em | Sección |
| `h3` | `1.3125rem` · 21 px | 600 | 1,25 | 0 | Subtítulo / tarjeta destacada |
| `h4` | `1.0625rem` · 17 px | 600 | 1,35 | 0 | Cabecera de tarjeta / bloque |
| `body-lg` | `1.1875rem` · 19 px | 400 | 1,60 | 0 | Entradilla editorial |
| `body` | `1.0625rem` · **17 px** | 400 | 1,55 | 0 | Texto base (mínimo 17 px) |
| `body-sm` | `0.9375rem` · 15 px | 400 | 1,55 | 0 | Tablas densas de personal |
| `small` | `0.875rem` · 14 px | 500 | 1,50 | 0 | Ayudas y etiquetas de formulario |
| `caption` | `0.8125rem` · 13 px | 400 | 1,40 | 0,01em | Metadatos y pie de foto |
| `overline` | `0.75rem` · 12 px | 600 | 1,40 | **0,16em** | *Eyebrow* en mayúsculas |
| `micro` | `0.75rem` · 12 px | 500 | 1,40 | 0,04em | Chips y etiquetas de estado |
| `code` | `0.875rem` · 14 px | 400 | 1,40 | 0 | Hash, `tokenId`, direcciones (monoespaciada) |

`display`→`h3` usan la serif; `h4`→`code` usan la UI (la serif en tablas densas perjudica la lectura).
El `overline` se aplica con `text-transform: uppercase` y tracking amplio; no se usa para frases.


### 3.3 Marca y lockup

| Pieza | Construcción | Uso |
|---|---|---|
| **Lockup principal** | Monograma **M·S** en disco `azure` con texto `shell` (44 px) + «MARINA DEL SOL» en Onest 700, mayúsculas, tracking **0,20 em**, y «ALICANTE · COSTA BLANCA» en 9,5 px con tracking 0,15 em | Cabecera pública, admin, pie |
| **Versión negativa** | Monograma en disco `pearl` con texto `navy`; textos en `mist`/`pearl` | Hero, pie, imagen social, pases |
| **Monograma suelto** | Disco `azure` + «M·S» en `shell` | Avatar, favicon, *adaptive icon* de la APK (fondo azul mar, glifo caliza) |

**Reglas**: área de respeto = altura de la «M»; no se deforma, no se rota, no se le añade sombra; sobre
fotografía se usa **siempre** la versión negativa con el velo al 70 %; el nombre no se escribe en la
serif de display (la marca es la UI en mayúsculas, la serif es la voz editorial del contenido). El
monograma y el wordmark viven en el componente `BrandMark`/`SiteHeader`, no en imágenes sueltas.

---

## 4. Espaciado, formas, elevación, rejilla y movimiento

- **Espaciado** (base 4 px): 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96.
  Regla: 4–8 para ajustes ópticos; 12–16 dentro de componentes; 20–32 entre bloques; 48–96 entre secciones.
- **Radios** (más suaves que el sistema actual, en diálogo con los arcos mediterráneos):
  `brand-xs 6 px` · `brand-sm 12 px` · `brand 18 px` · `brand-lg 28 px` · `pill 9999 px`.
  Tarjetas 18, modales 28, campos y botones 12, chips 6 o pill.
- **Elevación** (cálida y difusa, teñida de tinta/arena):
  `card` `0 1px 2px rgba(21,34,44,.05), 0 8px 24px rgba(139,122,98,.12)` ·
  `card-hover` `0 16px 36px rgba(21,34,44,.14)` · `modal` `0 28px 72px rgba(15,40,51,.24)`.
  Sin sombras duras ni negras.
- **Área táctil**: **44 × 44 px** mínimo (`min-h-touch`); en APK **48 dp**.
- **Rejilla y breakpoints**: móvil < 768 px (base 320, 1 columna) · tablet 768–1023 px (2 columnas,
  sidebar plegable) · desktop ≥ 1024 px (sidebar fija, 3 columnas; contenido máx. **1.200 px**;
  AdminLTE hasta **1.440 px**). Contenido máximo `max-w-6xl`; lectura ≤ 66 ch.
- **Movimiento**: `cubic-bezier(.22,.68,.24,1)`; hover de tarjeta `translateY(-4px)` + zoom de foto a
  1,04; revelado escalonado ≤ 0,55 s. **Respeta `prefers-reduced-motion`** (retardos incluidos).

---

## 5. AdminLTE — light skin «salón de luz»

La **distribución no se toca**: sidebar izquierda fija/plegable a mini con acordeón de **una sección
abierta a la vez**, navbar superior (Ayuda y avisos), `content-header` con migas derivadas de la ruta,
`content-wrapper`, KPI `small-box` y pie. Cambia la **piel**:

| Pieza (componente real) | Especificación A | Contraste |
|---|---|---|
| Sidebar (`bg-mist-2`, `text-ink`) | Caliza cálida, no oscura; marca con monograma azul mar; secciones en `overline` `ink-soft`; ítem 44 px, radio `brand-sm` | texto **13,16:1** · secciones **6,03:1** |
| Entrada activa | Pastilla **azul mar** con texto blanco, peso 600 | **7,51:1** AA/AAA |
| Hover del ítem | Arena (`arena`) con tinta | **12,06:1** AAA |
| Bloqueado (rol no disponible) | `opacity-50`, `aria-disabled`, candado SVG, hint una sola vez | exento (inactivo) |
| Navbar | Blanca (`shell`), borde `line`, buscador en pill `mist` con frontera `line-strong` | texto **16,19:1** |
| Cabecera de contenido | Migas 12 px `ink-soft`; título `h2` serif; acciones a la derecha (secundaria + primaria) | **6,03:1** migas |
| `small-box` / KPI | Tarjeta blanca, icono en tile `mist-2` con glifo `azure`, cifra en serif `display`/`h2`, delta `fern`/`coral-text` | cifra **16,19:1** |
| Tablas densas | Cabecera `mist-2` en `overline`, filas 44 px, alternancia `mist/40`, hover `mist-2/60`, estados en pastilla | texto **14,64:1** |
| Formularios | `input` 44 px, frontera `line-strong`, radio 12, foco doble anillo `azure` + `mist-2`; etiqueta 14/600 | frontera **3,75:1** |
| Drawer móvil | Cajón + velo `navy/55`, cierre con `Escape`, foco devuelto al disparador, topbar fija | texto sobre velo ≥ 4,5:1 |
| Pie | Borde `line`, 12 px `ink-soft` | **6,71:1** |

**Implementación**: en `AdminLayout.tsx` cambian las clases del sidebar (fondo/texto/hover/activo) y la
pantalla de acceso usa el mismo shell con `gate`. `admin-shell.test.ts` se actualiza (hoy fija, entre
otras cosas, el velo `bg-navy/60` del cajón). **No cambia** la derivación de rutas, el acordeón, el
plegado mini ni el gating por rol.

**Variante de bajo riesgo**: si el equipo prefiere el rail oscuro, `admin.sidebarBg → navy` y
`sidebarText → mist` dejan A con la distribución y el registro del sistema actual, manteniendo la
identidad cálida del resto. No cambia tokens ni componentes: solo dos valores.

---

## 6. Web · Móvil · APK

### 6.1 Web

- **Mobile-first real**: se diseña a 320 px; sin scroll horizontal; acciones alcanzables con el pulgar;
  una acción primaria por pantalla.
- Header público con marca, navegación, selector de idioma (ES/EN/RU) y «Reservar» azul.
- Hero a sangre con velo al 70 %, **barra de reserva flotante** con entrada/salida/huéspedes y CTA.
- Catálogo en 1/2/3 columnas según breakpoint; tarjetas con foto, badge de estado y precio en serif.
- Suites de personal con tablas densas (`DataTable`), chips de estado y navegación inferior en móvil.

### 6.2 Móvil / APK (Compose)

- **Mismos valores**: el borrador [`tokens/android-theme-propuesta-a-cal-y-sal.kt`](tokens/android-theme-propuesta-a-cal-y-sal.kt)
  construye el `lightColorScheme` de Material 3 desde los mismos HEX; **se desactiva Material You
  dinámico** para no perder la marca con el fondo de pantalla.
- **48 dp** de área táctil (por encima del mínimo web); cuerpo **16 sp** mínimo; titulares con
  Cormorant Garamond; cifras tabulares con Onest.
- Pantallas de la APK del huésped: «Mis noches» con pase QR **offline** (guardado cifrado), estado de la
  estancia y acciones de reventa; housekeeping con tablero de un toque; barra inferior de 4 destinos.
- Estados honestos: sin red se muestra el pase guardado y se explica qué no se pudo verificar.
- Modo noche del personal: **fuera de alcance** (propuesto y no aprobado en el proyecto).

**Mapeo de roles web → Material 3**

| Token web | Rol Material 3 | Uso en la APK |
|---|---|---|
| `mist` | `background` | Fondo de pantalla |
| `shell` | `surface` | Tarjetas, hojas, diálogos |
| `ink` | `onBackground` / `onSurface` | Texto principal |
| `ink-soft` | `onSurfaceVariant` | Texto secundario |
| `azure` | `primary` | CTA, tab activo, foco |
| `shell` | `onPrimary` | Texto sobre CTA |
| `azure-deep` | `onPrimaryContainer` | Acento de contenedor |
| `mist-2` | `primaryContainer` / `surfaceVariant` | Chips y bandas |
| `coral` | `secondary` / `tertiary` | Atención y reclamos |
| `navy` | `inverseSurface` | Cabecera oscura del pase |
| `pearl` | `inverseOnSurface` | Detalle sobre oscuro |
| `line-strong` | `outline` | Frontera de controles |
| `line` | `outlineVariant` | Divisores |
| `error` / `error-bg` | `error` / `errorContainer` | Errores y reclamaciones |

---

## 7. UX intuitiva

### 7.1 Arquitectura de información (se conserva la real)

**Público (escaparate)**: Inicio · Habitaciones · Experiencias · El hotel · Reventa · Ayuda ·
Wallet · «Reservar». La compra se hace en **3 pasos** con resumen fijo (`StickySummary`) y la misma tasa
que el cobro; la noche de hoy no es vendible y se explica en línea.

**Back-office AdminLTE**: las **8 secciones reales** del acordeón — Habitación, Recepción,
Housekeeping, Actividades, Mantenimiento, Administración, Plataforma y Sistemas —, con migas derivadas
de la ruta y una sola sección abierta. La identidad no añade destinos ni reordena el menú.

### 7.2 Flujos clave y microcopy

| Flujo | Patrón de UX | Microcopy (ES · EN · RU) |
|---|---|---|
| Reservar una noche | Hero → barra de fechas → catálogo → checkout en 3 pasos con resumen | «Reservar una noche» · *Book a night* · «Забронировать ночь» |
| «Mis noches» | Tarjeta-pase con QR, estado y acciones primaria/secundaria | «Tus noches» · *Your nights* · «Ваши ночи» |
| Check-in en recepción | Buscar reserva → presentar pase → confirmar; QR también sin red | «Check-in disponible» · *Check-in available* · «Регистрация доступна» |
| Housekeeping | Tablero de planta, un toque por acción, progreso del turno | «Marcar limpia» · *Mark clean* · «Отметить убранной» |
| Admin: publicar noche | Formulario corto con validación en línea y confirmación on-chain explicada | «Publicar noche» · *Publish night* · «Опубликовать ночь» |
| Estado degradado | Mensaje honesto + reintento; nunca un botón que vaya a revertir | «No pudimos comprobar la cadena» · *We couldn’t verify the chain* · «Не удалось проверить сеть» |

- **Un solo CTA primario** por pantalla; las acciones destructivas van en `error` y con confirmación.
- **Navegación por teclado** completa, foco visible de doble anillo, `Escape` cierra overlays y devuelve
  el foco al disparador.
- **Estados**: default · hover · focus · active · disabled · loading · error · vacío · degradado.
- **Errores junto al campo**, con `role="alert"`, nunca en un toast que desaparece.

---

## 8. Componentes (Atomic Design)

| Nivel | Inventario | Estados obligatorios |
|---|---|---|
| **Átomos** | Botón (primario/contrario/ghost/peligro; 44 px), enlace, badge (Suite/Reventa/Disponible), chip de filtro (`aria-pressed`), input/select/textarea, checkbox/toggle, `Stars`, `Money`, icono (trazo 2 px), divisor | default · hover · **focus-visible** (doble anillo) · active · disabled · loading · error |
| **Moléculas** | `Field` (etiqueta+ayuda+error), `SearchBar`, `FilterBar`, `DateRangePicker`, `GuestSelector`, `NightCard`, `SuiteCard`, `BookingBar`, `StickySummary`, `RoomStatusChip`, `MetricCard`, `ChatBubble`/`Composer`, `TxStepper` | default · hover · foco · vacío · degradado |
| **Organismos** | `SiteHeader`, `Footer`, `Hero`, `CatalogGrid`, `HistoryTable`, `DataTable`, `DashboardGrid`, `MintForm`, `AdminSidebar`/`AdminLayout` (skin claro), `DayBoard`, `HousekeepingBoard`, `MaintenanceBoard`, `ResaleManager`, `TxModal`, `EmptyState`/`DegradedState` | default · cargando · vacío · degradado · error |
| **Plantillas** | `PublicShell` · `FrontOfficeShell` · `StaffShell` (móvil) · `AdminLayout` (AdminLTE) | — |

**Reglas de oro de los componentes**

- Todo color, radio, sombra y tamaño sale de un **token**; no hay valores mágicos ni `#hex` en JSX.
- Frontera de controles **siempre** `line-strong`; nunca `line` (1,26:1).
- El foco visible es **obligatorio** y se mide contra los colores adyacentes (≥3:1).
- Los estados no se distinguen **solo** por color: texto + símbolo + `aria`.
- Los botones tienen `min-h-touch` y las filas de tabla 44 px.
- Las imágenes de contenido llevan `alt`; las decorativas, `alt=""`.

---

## 9. Implementación

### 9.1 Valores a sustituir (mismo nombre de token)

```js
// packages/config/tailwind/preset.cjs — theme.extend.colors
colors: {
  mist: "#F8F3E9",
  "mist-2": "#EFE7D6",
  shell: "#FFFFFF",
  arena: "#E9DDC8",        // NUEVO (surface-raised)
  ink: "#15222C",
  "ink-soft": "#495764",
  azure: "#0B5C74",
  "azure-deep": "#084659",
  navy: "#0F2833",
  "navy-soft": "#1A3B49",
  pearl: "#D9E8EC",
  coral: "#AE4E2A",
  "coral-text": "#8F3D1E",
  amber: "#9A6A12",
  fern: "#56682F",
  line: "#E4D9C5",
  "line-strong": "#8B7A62",
  success: "#1C6E48", "success-bg": "#E2F0E8",
  warning: "#875A0B", "warning-bg": "#F9EFD4",
  error: "#A62A1F",   "error-bg": "#F7E3DF",
  info: "#1E6273",    "info-bg": "#E1EDF1",
},
fontFamily: {
  display: ["var(--font-display)", "Iowan Old Style", "Georgia", "serif"],
  sans: ["var(--font-sans)", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
},
borderRadius: { "brand-xs": "6px", "brand-sm": "12px", brand: "18px", "brand-lg": "28px", pill: "9999px" },
boxShadow: {
  card: "0 1px 2px rgba(21,34,44,.05), 0 8px 24px rgba(139,122,98,.12)",
  "card-hover": "0 16px 36px rgba(21,34,44,.14)",
  modal: "0 28px 72px rgba(15,40,51,.24)",
},
```

La escala `fontSize` se actualiza con los valores de §3.2 (ya incluye `clamp`, peso, interlineado y
tracking). Los tokens de color de estado conservan su nombre.

### 9.2 Ficheros a tocar

| # | Fichero | Cambio |
|---|---|---|
| 1 | `packages/config/tailwind/preset.cjs` | valores de color (+`arena`), `fontFamily`, `fontSize`, `borderRadius`, `boxShadow` |
| 2 | `apps/web/src/lib/a11y/palette.ts` | mismos HEX + `arena` + nuevos pares en `DECLARED_TEXT_ON_BACKGROUND` |
| 3 | `apps/web/src/app/globals.css` | `:root` con los valores; `h1,h2,h3` a `var(--font-display)`; foco |
| 4 | `apps/web/src/app/layout.tsx` | `Cormorant_Garamond` + `Onest` con `subsets:["latin","cyrillic"]` y sus pesos |
| 5 | `apps/web/src/components/admin/AdminLayout.tsx` | **skin claro**: clases de sidebar (fondo, texto, hover, activo), acceso |
| 6 | `apps/web/src/components/admin/admin-shell.test.ts` | expectativas del shell (velo/sidebar) |
| 7 | `scripts/design/contrast-audit.mjs` | pares y umbrales medidos |
| 8 | `scripts/design/brand-sheet.mjs` | muestras/roles de la nueva identidad |
| 9 | `docs/DISENO-UX.md`, `docs/ACCESIBILIDAD-WCAG.md`, `RepoTecnico/Manual_Identidad_Visual.md` | guía actualizada (v3) |
| 10 | `docs/imagenes/*.svg`, `opengraph-image.tsx`, manuales y PDF | se regeneran desde el preset (no se editan a mano) |
| 11 | `apps/mobile` (cuando exista, ciclo A1.4) | `Color.kt`/`Theme.kt` desde [`tokens/android-theme-*.kt`](tokens/android-theme-propuesta-a-cal-y-sal.kt) |

### 9.3 Pasos y verificación

1. Tokens (1–3) → `node scripts/design/contrast-audit.mjs` (**0 fallos**).
2. Tipografía (4) → `pnpm --filter @hotel/web build` (fuentes woff2 descargadas).
3. Shell AdminLTE (5–6) → `pnpm --filter @hotel/web exec vitest run src/components/admin`.
4. Docs (9) → sin restos de la paleta anterior en las piezas de marca.
5. Evidencias (8, 10) → `node scripts/design/brand-sheet.mjs`; regenerar manuales y PDF.
6. Cierre: `pnpm typecheck` · `pnpm lint` · `pnpm --filter @hotel/web test` ·
   `pnpm --filter @hotel/web build` · `playwright test e2e/a11y.spec.ts`.

### 9.4 Esfuerzo, riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El **sidebar claro** pierde densidad con datos reales | Medio | Prueba con la tabla real del dashboard + axe; si falla, variante de rail oscuro en 2 valores (§5) |
| Las **fotos** actuales tienen dominante cálida y el velo oscurece | Bajo | Velo al 70 % ya medido; reemplazar solo la foto de portada si hace falta |
| El **cirílico** de Cormorant/Onest no cubre algún glifo | Bajo | `cyrillic-fonts.test.ts` y revisión visual de la landing RU |
| **Contraste** de algún par nuevo no declarado | Bajo | `a11y.test.ts` mide los `className` reales; el generador mide los pares declarados |
| Se espera «más oscuro» en administración | Bajo | Variante A-dark documentada; B queda como alternativa |

**Estimación**: ≈1,5–2 días-persona (tokens 0,5 · tipografía 0,25 · shell + guardianes 0,5 · docs y
evidencias 0,5 · verificación 0,25).

---

## 10. Accesibilidad

- **WCAG 2.1 AA** en los **42 pares** medidos (0 fallos); varios AAA. Fronteras de control ≥3:1.
- **Foco visible**: doble anillo `azure` (2 px) + halo `mist-2` (4 px), ≥3:1 contra colores adyacentes.
- **Área táctil** ≥44 px (48 dp en APK); sin scroll horizontal a 320 px.
- **Formularios**: etiqueta asociada, error junto al campo, `role="alert"`, autofocus controlado.
- **Tablas**: `<caption>` solo para lectores, `scope` de columna y fila, región desplazable con nombre y
  `tabIndex={0}`.
- **Gráficas**: `role="img"` con nombre accesible + tabla equivalente dentro de `<details>`.
- **Idioma**: `<html lang>` según preferencia; las 4 fuentes cubren cirílico.
- **Movimiento reducido**: `prefers-reduced-motion` anula animación y retardos.
- **Pares prohibidos** documentados en §2.2 y en [`contraste-propuesta-a-cal-y-sal.md`](contraste-propuesta-a-cal-y-sal.md).

---

## 11. Do's & Don'ts

| ✅ Hazlo | ❌ No lo hagas |
|---|---|
| Usa `azure` para la acción principal y `coral-text` para la atención como texto | Pintar texto `coral` sobre `mist` como si fuera texto de atención |
| Usa `amber` como **relleno** con texto **blanco** (4,73:1) | Poner `ink` sobre `amber` (3,43:1) |
| Mantén `pearl` sobre `navy`/`navy-soft` | Usar `pearl` sobre blanco (1,26:1) |
| Frontera de controles con `line-strong` | Usar `line` como frontera de un `input` (1,26:1) |
| Velo del hero ≥70 % | Bajar el velo al 35 % (rompe el contraste del titular) |
| Un `<h1>` por página y jerarquía h2/h3 | Usar la serif en párrafos largos o saltar de h1 a h4 |
| Degradar con honestidad («No pudimos comprobar la cadena») | Mostrar una acción que vaya a revertir o cifras no verificables |
| Un solo CTA primario por pantalla | Competir con tres botones azules en la misma vista |

---

## 12. Changelog

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-10-23 | 3.0.0-candidate-A | Primera edición de «Cal & Sal»: paleta completa por roles (25 valores: 21 roles + 4 bandas de estado, incluido el token nuevo `arena`), tipografía Cormorant Garamond + Onest, escala, radii/sombras, AdminLTE light skin, paridad web/móvil/APK, 42 pares WCAG, plan de implementación. **No aplicada.** |
