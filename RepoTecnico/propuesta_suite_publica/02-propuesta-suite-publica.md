# Propuesta de suite pública — «Marina Editorial»

> **Identidad visual v3 · distribución editorial** · Hotel Marina del Sol (Alicante) · **2026-10-23**
> **Estado**: propuesta para aprobación, **no aplicada** · **Previsualización**:
> [`previsualizaciones/suite-publica.html`](previsualizaciones/suite-publica.html) ·
> **Referencia**: [Wix wh-1061](https://es.wix.com/website-template/view/html/wh-1061) (análisis en
> [`01-analisis-referencia-wix.md`](01-analisis-referencia-wix.md)) ·
> **Contraste**: [`contraste-suite-publica.md`](contraste-suite-publica.md).

---

## 0. Ficha

| Campo | Valor |
|---|---|
| Nombre de la propuesta | **«Marina Editorial»** (lenguaje de distribución; **no** una identidad nueva) |
| Idea | Distribución editorial de hotel boutique: fotografía a sangre, serif de gran formato, mucho aire y navegación mínima, con el motor de reserva del producto integrado |
| Ámbito | **Suite pública** (27 rutas): home, catálogo, fichas, reserva, área de huésped, ayuda, contenido legal y asistente |
| Base | Distribución medida de Wix «WH Vacation Rent» (wh-1061) + sistema de componentes real de `apps/web` |
| Identidades | Conmutable: **A Cal & Sal** (por defecto), **B Posidonia** y **Brisa Marina** (vigente). El layout no depende de la decisión pendiente |
| Tokens | **Sin tokens nuevos**: usa los de la identidad activa (color, tipografía, radios, sombras) |
| AdminLTE | **Fuera de alcance**: el back-office no se toca |
| Verificación | **26 pares WCAG × 3 identidades = 78 mediciones · 0 fallos**; capturas Chromium reales |
| Esfuerzo de implementación | ≈ **8–10 días-persona** (presentacional; sin cambios de dominio ni API) |

---

## 1. Concepto y principios

**Qué es.** La suite pública deja de ser un one-page de dashboard y pasa a leerse como **una revista de
hotel**: una portada con fotografía y titular, un relato corto, tres habitaciones, tres razones, la
reventa como mercado, una pausa inmersiva, la voz de los huéspedes y el cierre. La compra sigue ahí,
pero no interrumpe: aparece en una **caja de reserva flotante** bajo el hero y en **una sola acción
primaria por vista**.

**Principios**

| Principio | Aplicación |
|---|---|
| **La fotografía manda** | Hero a sangre ≈80 vh, tarjetas 4:5, galería 2/3 + 1/3, banda inmersiva. Sin sombras ni cajas alrededor de las imágenes |
| **Aire como jerarquía** | Secciones de 104 px (desktop) / 56 px (móvil); texto ≤ 58 ch; máximo 3 columnas en escritorio |
| **Una acción primaria por vista** | CTA del hero (píldora clara), CTA funcional azur (reserva) y enlaces de filete para el resto |
| **La referencia se adapta, no se copia** | Se conserva su esqueleto; se añaden reserva, precios, reventa, confianza web3 y accesibilidad |
| **Honestidad de estado** | Sin disponibilidad, sin conexión o con la cadena caída, la interfaz lo dice y permite reintentar; nunca ofrece una acción condenada a fallar |
| **Pulgar primero** | En móvil, reserva apilada y **barra de acción fija**; áreas táctiles ≥44 px (48 dp en APK) |

**Qué NO es.** No es una identidad nueva, no cambia los tokens, no toca el admin, no altera rutas,
APIs, reglas de negocio ni i18n. Es una **capa de presentación** de la suite pública.

---

## 2. Arquitectura de información y plantillas

Se conservan las **27 rutas públicas** actuales. Cada una se asigna a una de **6 plantillas** con la
misma gramática editorial:

| Plantilla | Rutas | Composición |
|---|---|---|
| **T1 · Portada editorial** | `/` | Header transparente → hero → booking dock → confianza → relato → habitaciones → ventajas → reventa → banda → citas → CTA/contacto → footer |
| **T2 · Listado editorial** | `/catalogo`, `/habitaciones`, `/experiencias`, `/actividades`, `/instalaciones`, `/servicios`, `/planes`, `/subastas`, `/reventa`, `/resenas` | Header sólido → cabecera de página → toolbar de filtros → rejilla 3× (o 2× en piezas) → paginación → footer |
| **T3 · Ficha / detalle** | Ficha de habitación/noche (propuesta: nueva ruta `/habitaciones/[slug]`), `/mis-noches/cargos/[id]`, `/ayuda/[slug]`, `/ayuda/huesped/[slug]`, detalle de actividad | Header sólido → galería → título/meta → contenido 7/4 con tarjeta de reserva pegajosa o índice lateral → relacionadas → footer |
| **T4 · Flujo de reserva** | `/reservar`, `/checkin` | Header sólido minimal → stepper → formulario + resumen sticky → estados de transacción → footer reducido |
| **T5 · Área de huésped** | `/mis-noches`, `/mis-noches/cargos`, `/mis-noches/mis-reventas`, `/historico` | Header sólido → saludo + resumen → tarjetas de noche/pase → acciones (vender, cobrar, reclamar) → historial → footer |
| **T6 · Lectura / institucional** | `/empresa`, `/contacto`, `/privacidad`, `/terminos`, `/ayuda`, `/ayuda/huesped` | Header sólido → título serif → cuerpo de lectura ≤72 ch + índice lateral → CTA → footer |
| **T7 · Asistente** | `/asistente` | Shell editorial + conversación + panel de contexto (noche, reserva, ayuda) |

> **Nota sobre la ficha**: hoy no existe una ruta pública de detalle de habitación; la ficha se
> reutiliza como componente (`RoomDetailCard`). La previsualización muestra la plantilla propuesta en
> `/habitaciones/[slug]`; si no se quiere añadir ruta, la misma plantilla se aplica al detalle dentro
> del catálogo sin cambiar el sistema visual.

**Reorganización de la home actual (sin perder contenido)**

| Sección actual de `HomeSections` | Destino en la propuesta |
|---|---|
| Hero + `BookingBar` | Hero centrado + `BookingDock` (misma lógica de reserva) |
| Servicios (wifi, desayuno, piscina…) | **Trust strip** + bloque de servicios en `/servicios` y en la ficha |
| Alojamiento (`SuiteCard`) | **Habitaciones** (3 tarjetas editoriales) |
| Planes informativos | `/planes` (enlace desde «Descubre») |
| Actividades y galería | **Banda de Experiencias** + `/experiencias` y `/actividades` |
| Reseñas + nota media | **Citas** (mismos datos y moderación) |
| Contacto + mapa | **CTA final + tarjeta de contacto**; el formulario y el mapa viven en `/contacto` |

---

## 3. Sistema de layout

### 3.1 Rejilla y ritmo

- **Rejilla**: 12 columnas · contenido máximo **1.280 px** · gutter **32 px** · márgenes laterales **64 px**
  (desktop) y **20 px** (móvil). El texto de lectura se limita a **58–66 ch**.
- **Ritmo vertical**: sección **104 px** desktop / **56 px** móvil; secciones «tight» 76 px.
- **Sin líneas de separación** salvo filetes de 1 px (`line`) en ventajas, citas, cabeceras y footer.
- **Fondos por sección**: `mist` (base) → `shell` (habitaciones) → `mist-2` (reventa) → foto (banda) →
  `mist` (citas) → `mist-2` (cierre) → `shell` (footer). Alternancia suave, sin bloques duros.

### 3.2 Cabecera (`SiteHeader`)

| Variante | Uso | Comportamiento |
|---|---|---|
| **`over-hero`** | Home | Transparente sobre la foto, 84 px; **scrim superior** ≥70 % para garantizar contraste; logo izq., nav centrada, acciones der. |
| **`solid`** | Catálogo, ficha, reserva, área de huésped, legal | Fondo `shell`, texto `ink`, borde inferior `line`; altura 68 px |
| **`compact`** | Al hacer scroll en cualquier página | Altura 56 px, fondo `shell/95` con `backdrop-blur`, logo reducido; la nav se conserva |

**Contenido**: logo (`BrandMark` + wordmark) · navegación centrada con la IA real (*Inicio · Habitaciones ·
Catálogo · Subastas · El hotel ⌄ · Descubre ⌄*) · acciones derecha (idioma ES/EN/RU · Ayuda · wallet
«Entrar» · CTA **Reservar**) · menú lateral en móvil (cajón + velo + `Escape`).

### 3.3 Hero (`HeroEditorial`)

- Altura `min(80vh, 860px)` con mínimo 640 px; en móvil 520 px.
- Foto a sangre (`object-fit: cover`), **velo al 70 %** (65 % en Brisa) y composición centrada.
- Estructura: `eyebrow` (11 px, tracking 0,18 em) · **H1 serif** `clamp(3.2rem, 5.4vw, 5.6rem)` ·
  subtítulo 17 px (máx. 56 ch) · dos CTAs (primario claro, secundario outline) · marcas de contexto
  (desde 1998 · 50 habitaciones · 4 suites) y aviso de scroll.
- La imagen es el **LCP**: `fetchPriority="high"`, sin `loading="lazy"`, `srcset` responsive.
- Sin foto: cae a `navy` plano (cumple AA) y no desaparece.

### 3.4 Caja de reserva (`BookingDock`)

- Flota **−48 px** sobre el borde inferior del hero; máximo 1.140 px; fondo `shell`, borde `line`,
  sombra funcional `card`.
- Anatomía: **Entrada · Salida · Huéspedes** + CTA `Buscar disponibilidad`.
- Estados: default · foco · `disabled` (sin fechas) · error en línea (`role="alert"`: salida ≤ entrada,
  noche de hoy no vendible) · cargando · sin disponibilidad (mensaje honesto + fechas alternativas).
- Móvil: 2 columnas + CTA a ancho completo; nada de teclados que tapen el CTA.

### 3.5 Patrones de sección

| Patrón | Composición | Uso |
|---|---|---|
| **Split asimétrico 5/7** | Título serif + etiqueta a la izq.; párrafos y CTA de filete a la der. | Relato, reventa |
| **3 tarjetas imagen 4:5** | Imagen a sangre con badge · tipo (overline) · H3 · meta · precio + «Reservar» | Habitaciones, experiencias |
| **3 ventajas numeradas** | Filete superior · `01/02/03` · H3 · párrafo · enlace | Reserva directa, propiedad, pase |
| **3 citas** | Estrellas · cita serif itálica · autor en mayúsculas | Reseñas verificadas |
| **Banda inmersiva** | Foto a sangre, velo lateral, copy + CTA de filete | Experiencias |
| **Cierre + contacto** | H2 + párrafo + tarjeta con teléfono/email y CTA | Contacto |
| **Footer editorial** | Wordmark 46 px · contacto · 3 columnas · fila legal/idioma | Global |

### 3.6 Catálogo (T2)

- Cabecera sólida + **page head** split: H1 serif (`clamp(2.5rem, 4vw, 4rem)`) y resumen de filtros.
- **Toolbar**: chips de tipo (Todas/Dobles/Suites/Familiares/Reventa/Accesibles) + fechas + huéspedes +
  orden. Pegajosa bajo el header. `aria-live` con el número de resultados.
- Rejilla 3× con **imagen 4:3**, badge de estado, tipo, nombre, meta y precio; estados `sold`,
  `resale`, `premium`.
- Estados: **skeleton** (primera carga), **vacío** (sin resultados, con sugerencia de fechas),
  **degradado** (cadena o RPC caídos, con reintento), **cargando más** y fin de lista.
- Paginación «Ver más noches» (ventana de 90 días, sin scroll infinito silencioso).

### 3.7 Ficha (T3)

- **Galería**: imagen principal 16/10 + dos laterales; thumbs con foco y `arrow keys`; `alt` descriptivo.
- Cabecera: eyebrow · H1 · meta (personas · m² · camas · terraza) · badge.
- Cuerpo **7/4**: descripción, servicios, políticas, reseñas; a la derecha **tarjeta de reserva sticky**
  con precio, fechas, huéspedes, CTA, trust note y enlace a reventa.
- Móvil: la tarjeta pasa a **barra de acción inferior** con precio y CTA.

### 3.8 Reserva (T4) y área de huésped (T5)

- **Reserva** conserva los 3 pasos y el resumen con la misma tasa que el cobro. La piel editorial
  elimina el aspecto de «panel»: cabecera minimal, stepper tipográfico, formulario de campos altos
  (44 px), resumen sticky a la derecha y estados de transacción explicados.
- **Área de huésped**: saludo + resumen de la estancia; tarjetas de noche con pase QR, estado y acciones
  (vender, cobrar, reclamar); historial en tabla editorial; sin oscurecer la marca.

### 3.9 Pie (`SiteFooter`)

Fondo `shell`, borde superior `line`; wordmark **46 px** (referencia: 52,9 px) · contacto · 3 columnas
(Explorar · Tu estancia · Legal) · fila inferior con copyright, redes y selector de idioma.

---

## 4. Tipografía

La escala es **una** para las tres identidades; cambian las familias y los pesos disponibles.

| Nivel | Tamaño | Peso | Interlineado | Tracking | Uso |
|---|---|---|---|---|---|
| `display` | `clamp(3.2rem, 5.4vw, 5.6rem)` · 51–90 px | 600 | 0,98 | −0,025em | H1 del hero |
| `h1` | `clamp(2.5rem, 4vw, 4rem)` · 40–64 px | 600 | 1,02 | −0,02em | Título de página |
| `h2` | `clamp(2.1rem, 3.4vw, 3.4rem)` · 34–54 px | 600 | 1,02 | −0,02em | Sección |
| `h3` | `1.5rem` · 24 px | 600 | 1,2 | 0 | Tarjeta |
| `h4` | `1.0625rem` · 17 px | 600 | 1,35 | 0 | Bloque |
| `body-lg` | `1.1875rem` · 19 px | 400 | 1,7 | 0 | Relato y entradillas |
| `body` | `1.0625rem` · **17 px** | 400 | 1,55 | 0 | Texto base (mínimo 17 px) |
| `body-sm` | `0.9375rem` · 15 px | 400 | 1,55 | 0 | Tablas y metadatos |
| `small` | `0.875rem` · 14 px | 500 | 1,45 | 0 | Ayudas y etiquetas de formulario |
| `caption` | `0.8125rem` · 13 px | 400 | 1,4 | 0,01em | Pie de foto y autoría |
| `overline` | `0.75rem` · 12 px | 600 | 1,4 | **0,18em** | Eyebrow en mayúsculas |
| `micro` | `0.75rem` · 12 px | 500 | 1,4 | 0,04em | Chips y estados |
| `code` | `0.875rem` · 14 px | 400 | 1,4 | 0 | Hash, `tokenId` |

| Identidad | Display | UI/cuerpo | Radios |
|---|---|---|---|
| **A · Cal & Sal** | Cormorant Garamond (500/600/700) | Onest (400/500/600/700) | 6 / 12 / 18 / 28 |
| **B · Posidonia** | Spectral (500/600/700) | Inter Tight (400/500/600/700) | 4 / 8 / 14 / 20 |
| **Brisa Marina** | Playfair Display (500/600/700) | Manrope (400/500/600/700) | 6 / 10 / 16 / 22 |

- **Cuerpo 17 px**, interlineado 1,55, medida **58–66 ch**; en móvil no baja de 17 px (16 sp en APK).
- Las seis familias cargan **latin + cyrillic**; los textos RU se prueban en el layout (palabras largas,
  `text-wrap: balance` en titulares).
- El hero limita el H1 a **dos líneas** en las tres identidades (medido en la previsualización).
- El **cuerpo de lectura** nunca baja de **16 px** (17 px base); metadatos, captions y chips usan 12–15 px y no son texto de lectura largo.

---

## 5. Color y tokens

**No se añade ningún token nuevo.** La distribución consume los roles de la identidad activa:

| Rol | A · Cal & Sal | B · Posidonia | Brisa Marina |
|---|---|---|---|
| `background` / `mist` | `#F8F3E9` | `#F2F8F7` | `#F4F9FC` |
| `surface` / `shell` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `text-primary` / `ink` | `#15222C` | `#0C2226` | `#101F2C` |
| `text-secondary` / `ink-soft` | `#495764` | `#44605F` | `#41566A` |
| `interactive` / `azure` | `#0B5C74` | `#0B6A5A` | `#0F6C9C` |
| `surface-dark` / `navy` | `#0F2833` | `#052528` | `#0E2A3F` |
| `accent-text` / `coral-text` | `#8F3D1E` | `#963C24` | `#A34222` |
| `border-strong` / `line-strong` | `#8B7A62` | `#5C7B76` | `#6B8296` |
| Velo del hero | 70 % | 70 % | 65 % |

- **Regla de oro**: el azur/posidonia es la **acción**; el coral es la **atención**; el registro oscuro
  (`navy`) es el **velo, la banda y el footer de contraste**; la perla solo existe sobre oscuro.
- **Sombras**: solo en las capas funcionales flotantes (`BookingDock`, tarjeta de reserva, modales,
  menú). Las tarjetas editoriales **no** llevan sombra: la imagen y el aire hacen la jerarquía.
- **Contraste**: 26 pares × 3 identidades = **78 mediciones, 0 fallos**. Tabla completa en
  [`contraste-suite-publica.md`](contraste-suite-publica.md); el generador **aborta** si un tema falla.
- Pares clave (A): `ink/mist` **14,64:1** · `ink-soft/mist` **6,71:1** · `azure/shell` **7,51:1** ·
  `shell/azure` **7,51:1** · `line-strong/mist` **3,75:1** (≥3:1) · blanco sobre velo **5,74:1**.
  B: velo **6,09:1**. Brisa: velo **4,79:1**.

---

## 6. Componentes

### 6.1 Inventario (Atomic Design)

| Nivel | Componentes | Estados obligatorios |
|---|---|---|
| **Átomos** | `PillButton` (claro/azur/outline/ghost), `UnderlineField`, `Tag` (Disponible/Suite/Reventa/Vendida), `FilterChip` (`aria-pressed`), `Price`, `Stars`, `Avatar`, `Icon` (trazo 2 px), `Divider` | default · hover · **focus-visible** · active · disabled · loading |
| **Moléculas** | `BookingField`, `GuestSelector`, `DateHint`, `ServiceItem`, `ListingRow`, `QuoteCard`, `AdvantageColumn`, `ContactCard`, `TrustItem`, `ResultCount` (`aria-live`) | default · hover · foco · error · vacío |
| **Organismos** | `SiteHeader` (3 variantes), `HeroEditorial`, `BookingDock`, `StorySection`, `RoomsGrid`, `Advantages`, `ResaleBand`, `ImmersiveBand`, `Quotes`, `FinalCta`, `SiteFooter`, `CatalogToolbar`, `CatalogGrid`, `RoomGallery`, `BookingCard`, `MobileActionBar`, `GuestNightCard`, `CheckoutStepper` | default · cargando · vacío · degradado · error |
| **Plantillas** | `PublicShell` editorial · `ListingTemplate` · `DetailTemplate` · `CheckoutTemplate` · `GuestTemplate` · `ReadingTemplate` | — |

### 6.2 Contratos de los componentes principales

| Componente | Props (resumen) | Variantes / estados | Accesibilidad |
|---|---|---|---|
| `SiteHeader` | `variant: "over-hero" \| "solid" \| "compact"`, `activeHref`, `walletState`, `menuOpen`, `onOpenMenu` | 3 variantes · hover/focus · menú abierto · wallet conectada/incorrecta | `<header>`, `<nav aria-label>`, `aria-current`, `<details>` nativos para grupos, cajón con `Escape` y foco devuelto, skip link |
| `HeroEditorial` | `image`, `alt`, `eyebrow`, `title`, `highlight`, `subtitle`, `primary`, `secondary`, `priority` | con foto / sin foto (fallback navy) | H1 único, `fetchPriority`, alt de contenido, texto sobre velo medido |
| `BookingDock` | `defaultFrom`, `defaultTo`, `defaultGuests`, `onSearch`, `availability: "idle" \| "loading" \| "error" \| "empty"` | default · foco · error en línea · cargando · sin disponibilidad | `label` asociado, errores `role="alert"`, CTA 46 px, fecha mínima, teclado |
| `EditorialCard` | `room`, `image`, `alt`, `tagKind`, `price`, `state: "available" \| "sold" \| "resale"`, `onReserve` | disponible · suite · reventa · vendida · sin foto | `article`, `alt`, precio con `Money` localizado, estado no solo por color, enlace 44 px |
| `SectionHeader` | `eyebrow`, `title`, `note`, `link`, `level` | con/sin nota, con/sin enlace | `h2` semántico, `aria-labelledby` en la sección |
| `CatalogToolbar` | `filters`, `activeFilters`, `dateRange`, `guests`, `sort`, `resultCount` | sticky · foco · filtros activos · resultados 0 | `role="group"`, `aria-pressed`, `aria-live` para el contador, chips 44 px |
| `RoomGallery` | `images`, `alt`, `initialIndex` | 1–4 imágenes · zoom · sin fotos | `aria-roledescription="carrusel"`, teclas ←/→, `alt` por imagen, thumbs botón |
| `BookingCard` | `price`, `nights`, `guests`, `onReserve`, `resaleFrom`, `state` | disponible · agotada · sin tarifa | sticky, `aria-label` de precio, sin inventar tarifa |
| `MobileActionBar` | `price`, `ctaLabel`, `onAction` | visible al hacer scroll | 48 dp, `role="region"` con nombre, no tapa contenido |
| `SkeletonCard` / `EmptyState` / `DegradedState` | `variant`, `title`, `message`, `onRetry` | carga · vacío · degradado | `role="status"`, `aria-busy`, texto honesto y accionable |
| `SiteFooter` | `columns`, `contact`, `social`, `locale` | — | `<footer>`, listas, enlaces 44 px, idioma |

**Reglas de composición**: un `<h1>` por página; una acción primaria por vista; las tarjetas de imagen no
se envuelven en tarjetas con sombra; los estados no dependen solo del color; los inputs nunca usan
`line` como frontera.

---

## 7. Responsive y móvil/APK

| Elemento | Desktop ≥1024 | Tablet 768–1023 | Móvil <768 |
|---|---|---|---|
| Header | 3 zonas, 84 px | nav reducida, 68 px | logo + CTA + hamburguesa, 60 px |
| Hero | 80 vh, H1 51–90 px | 70 vh | 520 px, H1 38 px, CTA apilado |
| Booking dock | 4 columnas flotantes | 3 columnas | 2 columnas + CTA ancho completo |
| Habitaciones | 3 columnas | 2 columnas | 1 columna, imagen 4:3 |
| Ventajas / citas | 3 columnas | 2 columnas | 1 columna |
| Catálogo | 3 columnas | 2 columnas | 1 columna + chips con scroll |
| Ficha | 7/4 con tarjeta sticky | 7/4 | 1 columna + barra de acción fija |
| Footer | 5 zonas | 2 columnas | 1 columna |

**APK (Compose)**: mismos componentes y tokens; header con scrim, hero 520 dp, booking apilado, barra
de acción inferior (48 dp) y navegación de 4 destinos. El detalle y la compra se delegan en la web
(ADR-31); la app no reimplementa reglas.

---

## 8. UX, flujos y microcopy

| Flujo | Patrón | Microcopy ES · EN · RU |
|---|---|---|
| Explorar → reservar | Hero → fechas → catálogo → ficha → checkout 3 pasos | «Buscar disponibilidad» · *Check availability* · «Проверить наличие» |
| Ver una habitación | Ficha con galería, políticas y tarjeta sticky | «Reservar esta suite» · *Book this suite* · «Забронировать этот люкс» |
| Reventa | Banda en home + listado con badges y precio | «Explorar reventa» · *Browse resale* · «Смотреть перепродажу» |
| Check-in | Pase QR offline + estado de la estancia | «Check-in disponible» · *Check-in available* · «Регистрация доступна» |
| Estado degradado | Mensaje + reintento, sin CTA condenado | «No pudimos comprobar la cadena» · *We couldn’t verify the chain* · «Не удалось проверить сеть» |
| Vacío | Sin resultados + sugerencia de fechas | «No hay noches para esas fechas» · *No nights for those dates* · «Нет ночей на эти даты» |

- **Un solo CTA primario**; destructivas en `error` con confirmación.
- Errores junto al campo (`role="alert"`), nunca solo en toast.
- Navegación por teclado completa; foco visible; `Escape` cierra overlays y devuelve el foco.
- Enlaces de filete para acciones secundarias; el color no es el único canal de estado.

---

## 9. Accesibilidad

- **Contraste**: 78 mediciones (26 × 3 identidades), **0 fallos**. Fronteras de control ≥3:1.
  Tabla completa: [`contraste-suite-publica.md`](contraste-suite-publica.md).
- **Texto sobre fotografía**: siempre sobre **velo compuesto** (≥70 % / 65 % Brisa) y con **scrim en la
  cabecera**; el hero usa `shell` (validado), no tonos translúcidos.
- **Foco visible** de doble anillo en todos los controles; teclado completo; skip link al contenido.
- **Área táctil ≥44 px** (48 dp en APK); sin scroll horizontal a 320 px.
- **Formularios**: `label` asociado, ayuda y error junto al campo, `aria-invalid`, `role="alert"`.
- **Imágenes**: `alt` de contenido en galería y tarjetas; decorativas con `alt=""`; sin texto incrustado.
- **Estados**: `aria-busy` y `role="status"` en cargas; textos que explican el estado.
- **Movimiento**: `prefers-reduced-motion` anula animaciones y retardos; sin parallax en móvil.
- **Idioma**: `html lang` dinámico; cirílico cubierto por las seis familias y probado en el layout.
- **Correcciones a la referencia**: se eliminan sus 10 px de botón, sus etiquetas 3,67:1 y su nav
  3,28:1 sobre foto (ver [`01-analisis-referencia-wix.md`](01-analisis-referencia-wix.md) §5).

---

## 10. Rendimiento, SEO e i18n

- **LCP**: hero con `fetchPriority="high"`, preload de la portada, sin `loading="lazy"`; AVIF/WebP con
  `srcset` y `sizes`; dimensiones reservadas para evitar CLS.
- **CLS**: `aspect-ratio` en tarjetas y galería; campos de reserva con alto fijo; fuentes con
  `display: swap` y subconjuntos latin+cyrillic.
- **JS**: header sticky sin librerías; menús con `<details>` nativo; animaciones con CSS;
  sin carruseles pesados.
- **SEO**: metadata por ruta, canonical, `hreflang` ES/EN/RU, OG generado con tokens
  (`opengraph-image`), `schema.org` `Hotel` + `Offer` + `AggregateRating`, migas cuando aplique.
- **i18n**: mismas claves en ES/EN/RU (`i18n-parity.test.ts`), fechas y precios localizados, prueba de
  palabras largas en RU.

---

## 11. Implementación

### 11.1 Mapa sobre los componentes reales

| Existente | Acción |
|---|---|
| `components/layout/SiteHeader.tsx` + `navigation.ts` | Añadir las 3 variantes, scrim, estilos editoriales y nav centrada; **misma IA y grupos** |
| `components/layout/PublicShell.tsx` | Contenedor editorial, skip link, footer; sin cambios de lógica |
| `components/home/Hero.tsx` | Reescribir presentación a hero centrado con scrim; conservar selección de imagen/`alt` e idioma |
| `components/home/HomeSections.tsx` | Reordenar en secciones editoriales; extraer `StorySection`, `Advantages`, `ResaleBand`, `ImmersiveBand`, `Quotes`, `FinalCta` |
| `components/booking/BookingBar.tsx` | Envolver en `BookingDock` con la nueva anatomía; **misma validación** |
| `components/home/SuiteCard.tsx`, `ExperienceCard.tsx` | Variante editorial con imagen 4:5, precio y CTA |
| `components/home/TestimonialCard.tsx` | Variante cita a 3 columnas |
| `components/public/PageHeader.tsx`, `catalog/FilterBar.tsx` | Cabecera y toolbar editorial con chips y `aria-live` |
| `components/rooms/RoomDetailCard.tsx` | Galería + layout 7/4 con tarjeta sticky |
| `components/reserve/ReserveFlow.tsx`, `StickySummary.tsx` | Piel editorial del checkout 3 pasos (misma lógica/tasa) |
| `components/my-nights/*` | Tarjetas de noche y acciones con la piel nueva |
| `components/layout/SiteFooter.tsx` | Footer de wordmark grande y 4 columnas |
| `messages/{es,en,ru}.json` | Nuevas claves de copy y microcopy (paridad) |
| `apps/mobile` (futuro A1.4) | Tema Compose con los mismos tokens; header/booking/action bar |

**No se toca**: rutas, `app/**/page.tsx` salvo la composición de secciones, APIs, dominio, contrato,
admin, middleware de seguridad, i18n de arranque ni tests de lógica.

### 11.2 Fases y estimación

| Fase | Trabajo | Estimación |
|---|---|---|
| 1 | Header 3 variantes + shell + footer + primitivas (pill, filete, eyebrow) | 1,5 d |
| 2 | Home editorial (hero, booking dock, story, rooms, ventajas, reventa, banda, citas, cierre) | 2,5 d |
| 3 | Catálogo (page head, toolbar, grid, estados, paginación) | 1,5 d |
| 4 | Ficha (galería, contenido 7/4, tarjeta sticky, móvil) | 1,5 d |
| 5 | Checkout y área de huésped (piel + barra móvil) | 1,5 d |
| 6 | QA (axe, teclado, RU, rendimiento, capturas) + documentación | 1,5 d |
| | **Total** | **≈ 8–10 días-persona** |

### 11.3 Riesgos

| Riesgo | Mitigación |
|---|---|
| La home actual mezcla datos (servicios, planes, actividades, galería, reseñas) | Reasignar cada bloque a su ruta y mantener `getHomeContent` tolerante a fallo; ningún dato se pierde |
| Fotografía insuficiente para el hero y las tarjetas 4:5 | Usar las fotos reales actuales y prever `object-position`; sin foto, fallback `navy` |
| LCP por hero grande | `fetchPriority`, `srcset` AVIF/WebP y preload; medir con Lighthouse |
| Textos largos en RU rompen titulares | `text-wrap: balance`, límites de ch y prueba de locale |
| Identidad pendiente (A/B/Brisa) | La distribución está probada en las tres; los tokens se conmutan sin tocar componentes |
| Regresiones en compra/reventa | Cambios solo presentacionales + e2e M4/M6/M7 y tests de API intactos |

### 11.4 Criterio de aceptación

`pnpm typecheck`, `pnpm lint`, `pnpm --filter @hotel/web test`, `pnpm build` en verde;
`playwright test e2e/a11y.spec.ts` sin violaciones `critical`/`serious` en las rutas públicas;
`contrast-audit`/generador con **0 fallos**; capturas de home/catálogo/ficha/móvil actualizadas;
sin restos visuales de la versión anterior; LCP móvil medido y documentado.

---

## 12. Do's & Don'ts

| ✅ Hazlo | ❌ No lo hagas |
|---|---|
| Deja respirar la fotografía: imagen a sangre, sin sombra ni caja | Envolver cada imagen en una tarjeta con sombra |
| Un CTA primario por vista (píldora clara en hero, azur funcional) | Dos botones sólidos compitiendo en la misma sección |
| Titular serif grande y texto de 17 px | Bajar el cuerpo por debajo de 16 px para «ganar aire» |
| Velo medido y scrim de cabecera | Texto blanco directo sobre foto clara |
| Precio y disponibilidad a la vista | Un hero «bonito» sin forma de reservar |
| Barra de acción fija en móvil | Obligar a subir 5 pantallas para reservar |
| Un solo `h1` y jerarquía h2/h3 | Usar la serif en párrafos largos o saltar niveles |
| Reutilizar los tokens y componentes existentes | Introducir colores, sombras o tipografías nuevas en un `className` |
| Copiar el **esqueleto** de la referencia | Copiar sus assets, textos o sus tamaños de 10 px |

---

## 13. Changelog

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-10-23 | 1.0.0-candidate | Primera edición de «Marina Editorial»: distribución editorial basada en Wix wh-1061, home/catálogo/ficha, 3 identidades conmutables, 78 pares WCAG sin fallos, componentes, responsive, accesibilidad y plan de implementación (8–10 d). **No aplicada.** |
