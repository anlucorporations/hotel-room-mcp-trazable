# Diseño UX y sistema de componentes — Hotel Marina del Sol

> Deriva de [`REQUISITOS.md`](./REQUISITOS.md), [`CASOS-DE-USO.md`](./CASOS-DE-USO.md),
> [`DISENO-TECNICO.md`](./DISENO-TECNICO.md) y [`PLAN-DE-PRUEBAS.md`](./PLAN-DE-PRUEBAS.md).
> Mockup de referencia del catálogo: [`ux-mockups/catalogo.html`](./ux-mockups/catalogo.html).
> **Fecha:** 2026-06-04 · **Actualizado:** 2026-10 (rediseño «Brisa Marina» v2.0.0)

---

## 1. Concepto y principios de diseño

**Concepto: «Brisa Marina».** El producto es cripto, pero el usuario es un
viajero. El diseño transmite un **hotel boutique de la costa de Alicante** —luz, aire,
confianza— y **esconde la complejidad web3** tras un lenguaje de hospitalidad. El registro es
**luminoso y aéreo**: porcelana fría de fondo, azur vívido para la acción y marino profundo solo
para lo que debe pesar (hero, pie y la suite de administración).

| Principio | Aplicación |
|-----------|-----------|
| **La hospitalidad primero** | Vocabulario de viajero, no de cripto: «Reservar» (no «Mint/Buy»), «Traspasar» (no «Transfer»), «Tus noches» (no «Tu wallet»). El NFT nunca se nombra en la UI pública. |
| **Confianza para pagar** | CTAs en azur profundo (alto contraste), sellos de «pago verificado», histórico público accesible, estados de transacción siempre visibles y explicados. |
| **Mobile-first real** | Diseñado a 320 px primero; áreas táctiles ≥44 px; sin scroll horizontal; el pulgar alcanza las acciones. |
| **Luz, no oscuridad** | Fondo porcelana luminoso; fotografía protagonista; cripto-dark evitado a propósito. |
| **Calma > densidad** | Una acción primaria por pantalla; jerarquía tipográfica fuerte; aire. |

**Diferenciador memorable:** la combinación de **serif elegante (Playfair Display)** con
foto a sangre y paleta de porcelana/mar hace que parezca el sitio de un hotel real con encanto,
no un marketplace de NFTs.

---

## 2. Design tokens — sistema «Brisa Marina» (v2.0.0, 2026-10)

> Rediseño completo aprobado por el responsable: sustituye a «Mediterráneo editorial».
> Dirección **luminosa y aérea** (porcelana fría, azur vívido, marino profundo para el registro
> oscuro y la suite AdminLTE, coral para la atención). Fuente de verdad:
> `RepoTecnico/Manual_Identidad_Visual.md` + `packages/config/tailwind/preset.cjs`.

### 2.1 Color (con ratio de contraste sobre su fondo de uso)

| Token | Hex | Uso | Contraste |
|-------|-----|-----|-----------|
| `--mist` | `#F4F9FC` | Fondo de página (porcelana fría) | — |
| `--mist-2` | `#E6F0F6` | Superficie alterna, estados | — |
| `--shell` | `#FFFFFF` | Cards, superficies elevadas | — |
| `--line` | `#DBE7EF` | Bordes decorativos, separadores | — |
| `--ink` | `#101F2C` | Texto principal | **15.8:1** sobre mist ✅ |
| `--ink-soft` | `#41566A` | Texto secundario | **7.2:1** sobre mist ✅ |
| `--azure` | `#0F6C9C` | **Primario** (CTA, enlaces, foco de marca) | **5.8:1** con blanco ✅ |
| `--azure-deep` | `#0A4F75` | Hover de primario, títulos de marca | **8.8:1** con blanco ✅ |
| `--coral` | `#C4522C` | Acento en **fondos** (badge Reventa, dot) — con texto blanco | 4.57:1 con blanco ✅ |
| `--coral-text` | `#A34222` | Acento como **texto** sobre claro (eyebrow, avisos) | **6.25:1** sobre shell · 5.89:1 sobre mist ✅ |
| `--fern` | `#276E4C` | Estado «disponible» | 5.8:1 sobre mist · 5.0:1 sobre su tinte al 10 % ✅ |
| `--amber` | `#B98324` | Detalle premium (Suite) | usar con `--ink` encima (5.1:1); nunca como texto sobre claro |
| `--navy` | `#0E2A3F` | Superficie oscura: hero, pie, **sidebar AdminLTE** | **14.8:1** con `shell` · 13.9:1 con `mist` ✅ |
| `--navy-soft` | `#1A4160` | Superficie oscura secundaria; hover sobre oscuro | 10.7:1 con `shell` ✅ |
| `--pearl` | `#C3D4E0` | Detalle premium **solo sobre oscuro** (filetes, iconos, cifras) | 9.7:1 sobre `navy` · 7.0:1 sobre `navy-soft` ✅ · **1.5:1 sobre blanco ❌** |
| `--line-strong` | `#6B8296` | **Frontera de controles** (`input`/`select`/`textarea`), WCAG 1.4.11 — protegido por `control-boundary.test.ts` | 3.99:1 shell · 3.77:1 mist · 3.45:1 mist-2 ✅ |
| `--success` / `--success-bg` | `#1F7A4D` / `#E2F2E9` | Confirmaciones | 5.3:1 con blanco · 4.6:1 sobre su fondo ✅ |
| `--warning` / `--warning-bg` | `#8A5F0C` / `#FBF0D6` | Avisos (ventana corta, stock, preventivo) | 5.0:1 sobre su fondo · 5.3:1 sobre mist ✅ |
| `--error` / `--error-bg` | `#B3261E` / `#FAE5E3` | Errores y bloqueos | 6.5:1 con blanco · 5.4:1 sobre su fondo ✅ |
| `--info` / `--info-bg` | `#0F6380` / `#E0EFF5` | Información y ayuda | 5.7:1 sobre su fondo · 6.4:1 sobre mist ✅ |

> **Decisión de accesibilidad:** el CTA primario es **azur** (5.8:1 con blanco) por confianza y
> contraste. `--coral` solo se usa en **fondos** con texto blanco; como **texto sobre claro** se usa
> `--coral-text` (#A34222, 6.25:1). El **anillo de foco** es un **doble anillo porcelana + azur**
> con ≥3:1 contra los colores adyacentes (WCAG 1.4.11 / 2.4.7).
>
> **Velo del hero**: `bg-navy/65` (compuesto `#627582` sobre blanco) → **4.79:1** con texto blanco
> y 4.51:1 con `mist`. Por debajo del 65 % no se usa: al 35 % el compuesto cae a 2.10:1 (prohibido
> incluso para texto grande). Los **50 pares medidos** y su veredicto se reproducen con
> `node scripts/design/contrast-audit.mjs`.

### 2.2 Tipografía

- **Display:** `Playfair Display` (serif elegante, subconjuntos latin + **cyrillic**) — titulares, precios, nombres de habitación.
- **UI/cuerpo:** `Manrope` (geométrica fresca, subconjuntos latin + **cyrillic**) — navegación, texto, formularios, botones.
- **Ruso (RU):** las dos fuentes de marca publican el subconjunto `cyrillic`, así que el locale RU
  queda cubierto **por la propia marca**; la cascada glifo a glifo con respaldos del sistema
  anterior se retiró. Guardián: `apps/web/src/lib/a11y/cyrillic-fonts.test.ts`.
- **Escala** (mobile → desktop con `clamp`): `display` `2.8→5rem` · H1 `2.3→4.1rem` · H2 `1.6→2.2rem`
  · H3 `1.3rem` · H4 `1.075rem` · `body-lg 1.1875rem` · cuerpo `1.0625rem (17px)` · `body-sm 0.95rem`
  · small `0.9rem` · `caption 0.82rem` · `overline 0.78rem` (+0,14em) · micro `0.78rem` · `code 0.9rem`.
- Cuerpo mínimo **16px**; interlineado 1.5; medida de línea ≤ 66ch.

### 2.3 Espaciado, formas, sombras, motion

- **Espaciado** (escala 4px): 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96.
- **Radios:** `--r-xs 6` · `--r-sm 10` · `--r-md 16` · `--r-lg 22` · `--r-pill 999`.
- **Sombras:** `card` (reposo), `card-hover` (hover y resumen flotante), `modal` (modales y menús) —
  frías y suaves, teñidas con el marino/azur de marca (registro «aéreo»: nunca sombras duras ni negras).
- **Motion:** `--ease cubic-bezier(.21,.68,.27,.99)`; reveal escalonado al cargar (≤0.6s);
  hover card `translateY(-5px)` + zoom de foto. **Respeta `prefers-reduced-motion`.**

### 2.4 Breakpoints (RNF-01)

| Nombre | Ancho | Grid catálogo |
|--------|-------|---------------|
| Móvil | < 768 px (base 320) | 1 columna |
| Tablet | 768–1023 px | 2 columnas |
| Desktop | ≥ 1024 px | 3 columnas |

### 2.5 Piezas de marca y vista previa social (Fase D)

- **Ilustraciones** (`docs/imagenes/*.svg`): las piezas están dentro de la paleta «Brisa Marina» y lo
  vigila `brand-pieces.test.ts`, que **deriva los HEX del preset real** (una pieza nueva no puede
  introducir un color que el sistema no tenga). Cada SVG lleva `role="img"` y `<title>` porque son
  imágenes de contenido en los manuales.
- **Registro marino**: la **portada** y los títulos de las pantallas de recepción y reventa usan
  `navy #0E2A3F` — el marino es la superficie oscura del sistema. El `amber` se mantiene en claro;
  el `pearl` solo aparece sobre oscuro (sidebar AdminLTE, hero, imagen social).
- **Vista previa social**: `app/opengraph-image.tsx` **genera** la imagen 1200×630 con los tokens
  (`navy`→`navy-soft`, titular porcelana, eyebrow perla, filete coral) en vez de ser un PNG
  suelto: no puede desincronizarse de la paleta y se regenera sola. El `<head>` declara `og:*` y
  `twitter:card`. En producción hay que definir **`NEXT_PUBLIC_SITE_URL`** (en desarrollo cae a
  `http://localhost:3000`).
- **Maqueta del catálogo** (`docs/ux-mockups/catalogo.html`): al día con los tokens de «Brisa
  Marina», el hero en registro marino y la **barra de reserva** entregada en la Fase C.2.

---

## 3. Librería de componentes (Atomic Design)

### Átomos
- **Botón** (`.btn`): variantes `primary` (azur), `ghost` (borde), `danger` (admin); min-height 44px.
- **Chip de filtro**: toggle accesible (`aria-pressed`), scroll horizontal en móvil.
- **Badge**: tipo de habitación / `Suite` (amber) / `Reventa` (coral).
- **Input / Select / DatePicker**, **Etiqueta**, **Precio** (Playfair Display + sufijo ETH), **Dot de estado**.
- **Stars** (`components/home/Stars.tsx`): calificación como **imagen con nombre accesible** (`role="img"` + `aria-label`, glifos `aria-hidden`); rellenas en `coral-text` (6,25:1 sobre blanco) y vacías al 25 % de opacidad. La lógica pura vive en `lib/stars.ts` (notas corruptas se acotan, no se inventan).
- **Icono** (stroke 2px, set propio: calendario, marcador, ola, wallet, check, alerta).

### Moléculas
- **NightCard**: foto + badge + habitación + tipo + fecha + precio + CTA + guardar. (Estados de card: disponible, reventa, suite, vendida, expirada, `img-fallback`. **Estados del CTA `buy-button`:** normal · **sin saldo** (`disabled` + `aria-disabled` + mensaje `insufficient-balance`, CU-05 05a) · **en curso** (`aria-busy`, bloqueado durante firma/minado, anti-doble-envío).)
- **WalletButton**: «Conectar» → conectado (`dot` + dirección abreviada) → red incorrecta.
- **FilterBar**: grupo de chips + contador de resultados (`aria-live`).
- **TxToast / TxStepper**: pendiente → confirmada → revertida.
- **MetricCard** (dashboard): valor + etiqueta + periodo + sparkline.
- **ChatBubble** + **ChatComposer** (asistente).
- **Pagination / LoadMore**: botón «cargar más» (`load-more`) con estado de carga incremental, fin de lista (`end-of-list`), anuncio `aria-live` y gestión de foco al añadir resultados (RNF-02, ventana de 90 días).
- **SuiteCard** (`components/home/SuiteCard.tsx`): tarjeta **horizontal** de habitación publicada (foto + tipo + capacidad + camas + m² + descripción + CTA al catálogo). Sin precio: la tarifa se publica solo donde se puede comprobar contra la cadena. Sin foto se pinta igual (banda porcelana).
- **ExperienceCard** (`components/home/ExperienceCard.tsx`): imagen de la galería con el **texto alternativo como pie visible** (y `alt=""` para no leerlo dos veces); sin alt, nombre accesible genérico.
- **TestimonialCard** (`components/home/TestimonialCard.tsx`): reseña **aprobada** (D-58) con `Stars`, cita en serif y pie «huésped verificado».
- **BookingBar** (`components/booking/BookingBar.tsx`): barra de reserva con entrada, salida y huéspedes que lleva a `/reservar?from=…&to=…&guests=…`. Valida en el propio formulario las reglas del dominio (`lib/booking.ts`: la noche de hoy no es vendible, la salida debe ser posterior) y explica el problema en línea (`role="alert"`) en vez de dejar avanzar. Montada **flotando** sobre el borde del hero en `/` y **en línea** en `/catalogo`.
- **StickySummary** (`components/reserve/StickySummary.tsx`): resumen de la estancia (habitación, fechas, noches, precio por noche y total) anclado con `tablet:sticky` junto al formulario de `/reservar`. El precio llega **ya convertido** desde `/api/public/rooms` con la misma tasa que usa el cobro; si no hay tarifa, dice que el importe se confirma al retener en lugar de inventar un número.

### Organismos
- **AdminSidebar** en registro marino (Fase F): la navegación del back-office vive en una tarjeta
  `bg-navy` con enlaces `text-mist` (13,4:1), secciones en `pearl` (9,7:1) y la entrada activa como
  pastilla `bg-shell text-navy` (14,5:1), con filetes `border-pearl/30`.
- **Header** (marca + nav + wallet), **Hero editorial**, **CatalogGrid**, **HistoryTable**,
  **DashboardGrid**, **MintForm** (admin), **ChatPanel**, **TxModal** (confirmación de compra),
  **OnboardingSheet** (instalar/añadir red), **ResaleManager** (fijar/actualizar/cancelar precio de reventa + `claim`), **EmptyState / DegradedState**.
- **Hero de la home pública** (`components/home/Hero.tsx`, Fase C): foto a sangre de la portada (`hotel_images` sección `HERO`) con **velo marino `bg-navy/65`** (4,79:1 con texto blanco) y titular en serif con la palabra destacada en `pearl`. Sin portada cae a `bg-navy` plano; la imagen va **sin** `lazy` porque es el LCP.
- **RoomDetailCard** (`components/rooms/RoomDetailCard.tsx`, 2026-10-02): **ficha de habitación reutilizable**.
  Componente de presentación puro (recibe la ficha y sus conjuntos por props; no usa el contexto del
  back-office), de modo que se monta desde administración, recepción, housekeeping, mantenimiento o la
  web pública con perfil `GUEST`. Pinta **secciones según el perfil** (`ROOM_SECTIONS_BY_PROFILE`:
  físicas, decorativas, servicios, espacios, publicaciones y comercial —owner todo; recepción sin
  comercial; limpieza y mantenimiento sin publicaciones ni comercial; huésped con disponibilidad
  publicada—); las secciones no visibles **no existen en el DOM**.
- **RoomCalendar** (`components/rooms/RoomCalendar.tsx` + lógica pura en `lib/room-calendar.ts`): calendario
  mensual con cuatro estados —**publicada**, **reservada**, **ambas**, **libre**— cada uno con color,
  símbolo y `aria-label` por día (el color no es el único canal), leyenda, resumen `role="status"` con
  los días publicados y reservados del mes y navegación de mes anterior/siguiente.
- **RoomFormDialog** (`components/admin/rooms/RoomFormDialog.tsx`, 2026-10-02): **alta y edición flotantes**
  de la ficha (físicas, decoración, servicios, espacios) con carga de **hasta 4 fotos** reescaladas en el
  navegador antes de subirlas. Comparte `ModalShell` con el modal de TOTP (foco, trampa de foco, `Escape`,
  devolución del foco) y recibe `apiFetch` por props para poder probarse fuera del shell.
- **DataTable** (`components/ui/DataTable.tsx`, Fase C.3): tabla **densa** de las suites de personal (recepción, housekeeping, mantenimiento, administración) con `<caption>` solo para lectores, `scope="col"`/`scope="row"`, región desplazable con nombre y `tabIndex={0}` (WCAG 2.1.1), densidad `compact`/`comfortable`, cabecera fija opcional y columnas ocultables en móvil **sin sacarlas del DOM**. No conoce el dominio: recibe columnas y filas. La vigila `table-semantics.test.ts`, que **deriva la regla de todas las tablas del producto**.

### Plantillas
- **PublicLayout** (header + main + footer), **AdminLayout** (sidebar + topbar protegido por rol),
  **ChatLayout** (conversación + panel de acción).

---

## 4. Wireframes de pantallas

### 4.1 Catálogo (CU-04) — *ver mockup HTML*
```
┌───────────────────────────────────────────────┐
│ ◐ Marina del Sol           [● 0xB13F…0959]     │  header sticky
│ Noches  Mis noches  Histórico  Asistente       │
├───────────────────────────────────────────────┤
│ RESERVA DIRECTA · SIN INTERMEDIARIOS           │
│ Tu noche frente al *Mediterráneo*, en propiedad│  hero editorial
├───────────────────────────────────────────────┤
│ [Todas][Simple][Doble][Suite][Junio][≤0,5Ξ] 6 │  filtros (chips)
├───────────────────────────────────────────────┤
│ ┌─foto─┐  ┌─foto─┐  ┌─foto─┐                    │
│ │★Suite│  │Doble │  │↔Rev. │                    │  grid 1/2/3 col
│ │201   │  │118   │  │102   │                    │
│ │15 jun│  │14 jun│  │16 jun│                    │
│ │0,5Ξ ▸│  │0,28Ξ │  │0,19Ξ │                    │
│ └──────┘  └──────┘  └──────┘                    │
│           [ Cargar más noches ]  (load-more)    │  paginación (RNF-02)
└───────────────────────────────────────────────┘
estados: empty-state / degraded-state+retry / img-fallback / end-of-list
```

### 4.2 Detalle + compra (CU-05/07)
```
┌── galería foto a sangre ──────────────┐
│ ★ Suite · Habitación 201              │
│ Domingo 15 jun 2026 · 1 noche         │
│ 0,5 ETH                               │
│ [ Reservar esta noche ]   (azur, 44h) │
│ ✓ Pago verificado en red segura       │
│ Detalles · Cómo funciona el traspaso  │
└───────────────────────────────────────┘
→ abre TxModal (§5.3) con la tx decodificada antes de firmar
```

### 4.3 Mis noches + gestión de reventa (CU-06, ADR-15)
```
Tus noches               [Próximas | Pasadas]
┌─ Suite 201 · 15 jun · Activa ───────────┐
│ [ Traspasar ]  [ Ver ]                  │
└─────────────────────────────────────────┘
┌─ Doble 118 · 14 jun · En reventa 0,3Ξ ──┐  ← ya listada
│ [ Cambiar precio ]  [ Cancelar reventa ]│  (re-Listed / Unlisted)
└─────────────────────────────────────────┘
Fondos por cobrar: 0,27 ETH   [ Cobrar ]  ← claim()  (pull, ADR-15)
empty-state: «Aún no tienes noches reservadas»

ResaleManager (al «Traspasar»):
  Precio de reventa [ 0,30  ] ETH  (>0)   [ Publicar ]
  errores → NotOwner / InvalidPrice (precio 0) / NightExpired / NotListed
  estados de tx: pendiente → confirmada → revertida (§5.3)
```

### 4.4 Histórico público (CU-09)
```
Histórico de reservas (transparente)
Fecha venta │ Habitación │ Noche   │ Precio │ Tipo
2026-06-03  │ Suite 201  │ 15 jun  │ 0,5 Ξ  │ Primaria
2026-06-02  │ Doble 118  │ 14 jun  │ 0,3 Ξ  │ Reventa
(solo datos no personales: sin nombres/emails)   empty-state
```

### 4.5 Asistente IA (CU-08)
```
┌─ Asistente Marina ───────────────────┐
│ 🗨 "quiero la 102 para el 15 de junio"│
│ ◐ La 102 está disponible por 0,19 Ξ.  │
│   ¿Reservo? [Sí, preparar]            │
│ → abre TxModal (usuario firma)        │
│ [ escribe aquí…              ] (44h)  │
└───────────────────────────────────────┘
estados: assistant-unavailable (fallback a navegación)
fuera de dominio → respuesta breve de rechazo
```

### 4.6 Back-office admin (CU-02/10/11/12/13/14) — AdminLayout protegido por rol
```
│ Panel · Marina del Sol         [rol: MINTER]
├─ Mintear noche ──────────────────────────────
│ Habitación [201▾] Fecha [15/06/2026] Precio[0,5]
│ [ Publicar noche ]   (valida maestro/fecha/precio)
├─ Métricas (dashboard) ───────────────────────
│ [Vendido 4,2Ξ] [Royalties 0,3Ξ] [Ocupación 30%]
├─ Royalty [10%▾]  · Pausa de emergencia [ ⏸ ]
│ Caducadas: [ Quemar lote (12) ]
```

### 4.7 Onboarding web3 (CU-17)
```
Sin wallet (no-wallet)          Red incorrecta (wrong-network)
┌───────────────────┐          ┌───────────────────────┐
│ Para reservar      │          │ Cambia a la red        │
│ necesitas MetaMask │          │ «Marina del Sol»       │
│ [ Instalar ]       │          │ [ Cambiar de red ]     │
│ [ ¿Qué es esto? ]  │          └───────────────────────┘
└───────────────────┘
```

---

## 5. Modelo de interacción y estados web3

### 5.1 Conexión de wallet (oculta la jerga)
`Conectar` → MetaMask → conectado (muestra `0xB13F…0959` + dot oliva). Si la red ≠ 81234 →
`wrong-network` con botón «Cambiar de red» (`wallet_addEthereumChain`).

### 5.2 Estados de la noche (reflejan la máquina de estados del contrato)
`Disponible` (helecho) · `Reventa` (coral) · `Suite` (amber) · `Vendida` (atenuada) ·
`Expirada` (gris, no comprable). Coherentes con CASOS §4.

### 5.3 Estados de transacción (RNF-19) — `TxModal` / `TxToast`
```
1. Revisar  → muestra to/importe/tokenId DECODIFICADOS  (verifica value==precio)
2. Firmar   → "Confirma en MetaMask…"        (data-testid=tx-pending)
3. Minando  → "Reservando tu noche…"         spinner + ~2 s (Besu)
4a. Hecho   → "¡Noche reservada!" + recibo    (data-testid=receipt)
4b. Error   → "No se completó" + motivo + reintentar  (data-testid=tx-reverted)
```
El usuario **siempre confirma una transacción legible** antes de firmar (ADR-11).

**Accesibilidad del `TxModal`** (es donde se autoriza el pago — WCAG 2.4.3 / 4.1.2 / 1.3.1):
`role="dialog" aria-modal="true"`, `aria-labelledby` (título) + `aria-describedby` (tx
decodificada: importe, habitación, fecha); **foco inicial** al título/primer control;
**focus trap** dentro del modal; **Escape cierra** (salvo durante el minado); **retorno de
foco** al botón «Reservar» que lo abrió; el cambio de paso se anuncia (`role="status"` para
progreso, `role="alert"` para `tx-reverted`, `aria-busy` en el spinner).

**Estados del `buy-button`** durante el flujo: normal → **en curso** (`aria-busy`,
deshabilitado durante `tx-pending`/minado, evita doble envío con bloques de ~2 s) →
vuelve a normal (o muestra error). Estado **sin saldo**: `disabled` + `aria-disabled` +
mensaje `insufficient-balance` (CU-05 05a / TC-E2E-021).

### 5.4 Estados de sistema (con `data-testid` del plan de pruebas)
`empty-state` · `degraded-state` + `retry` · `img-fallback` · `assistant-unavailable` ·
`no-wallet` · `wrong-network`.

---

## 6. Accesibilidad (RNF-20, WCAG 2.1 AA) y rendimiento (RNF-11)

- **Contraste:** todas las parejas texto/fondo ≥ 4.5:1 (cuerpo) y ≥ 3:1 (texto grande/UI) — ver §2.1.
- **Teclado:** todo operable; `:focus-visible` con doble anillo porcelana + azur; orden lógico; **skip link**.
- **Semántica:** landmarks (`header/nav/main/footer`), `aria-pressed` en chips, `aria-live` en
  contador y toasts, `alt` descriptivo en cada foto, `aria-current` en navegación.
- **Táctil:** objetivos ≥ 44×44 px (botones, chips, guardar, composer).
- **Movimiento:** `prefers-reduced-motion` desactiva animaciones.
- **Rendimiento:** imágenes `lazy` + `next/image` (servidas por CDN, ADR-12); fuentes con
  `display=swap` + preconnect; LCP objetivo < 2,5 s (RNF-11). Verificado con `@axe-core/playwright`
  (TC-NF-030) y Lighthouse (TC-NF-001/002).

---

## 7. Mapa pantallas → casos de uso y trazabilidad

| Pantalla | CU | RF | RNF |
|----------|----|----|-----|
| Catálogo + filtros | CU-04 | RF-02, RF-14 | RNF-01/02/11/12/20 |
| Detalle + compra | CU-05, CU-07 | RF-03, RF-01 | RNF-19 |
| Mis noches / traspaso | CU-06 | RF-07 | — |
| Histórico | CU-09 | RF-15 | RNF-05 |
| Asistente IA | CU-08 | RF-12 | RNF-19 |
| Admin: mint/dashboard/royalty/pausa/burn | CU-01/02/10/11/12/13/14 | RF-05/06/09/10/08/17 | RNF-13/17 |
| Onboarding web3 | CU-17 | RF-04 | RNF-18/19 |

**Componentes con `data-testid`** (puente con `PLAN-DE-PRUEBAS.md`). **Convención por
identidad** para evitar selectores ambiguos (Playwright *strict mode*): los elementos
repetidos llevan el `tokenId` en el id:
- Por card: `night-card-<tokenId>` y, dentro, `buy-button-<tokenId>` (ej. `buy-button-20120260615`).
  El test localiza la card por su scope y luego el botón dentro.
- Globales/únicos: `catalog-grid`, `wallet-button`, `result-count`, `empty-state`,
  `degraded-state`, `retry`, `img-fallback`, `load-more`, `end-of-list`,
  `insufficient-balance`, `tx-pending`, `receipt`, `tx-reverted`, `no-wallet`,
  `wrong-network`, `assistant-unavailable`, `mint-action`.

---

## 8. Pendiente / Fase 2
- Tema oscuro (no necesario en MVP; tokens preparados para extender).
- i18n EN/RU (RNF-06) — el copy ya está aislado para traducir.
- Animaciones de marca avanzadas (olas), ilustración propia, fotos reales del hotel
  (sustituir los 3 placeholders por las 3 fotos que aporta Carlos, RF-18a).
