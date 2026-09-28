# Diseño UX y sistema de componentes — Hotel Marina del Sol

> Deriva de [`REQUISITOS.md`](./REQUISITOS.md), [`CASOS-DE-USO.md`](./CASOS-DE-USO.md),
> [`DISENO-TECNICO.md`](./DISENO-TECNICO.md) y [`PLAN-DE-PRUEBAS.md`](./PLAN-DE-PRUEBAS.md).
> Mockup de referencia del catálogo: [`ux-mockups/catalogo.html`](./ux-mockups/catalogo.html).
> **Fecha:** 2026-06-04

---

## 1. Concepto y principios de diseño

**Concepto: «Mediterráneo editorial».** El producto es cripto, pero el usuario es un
viajero. El diseño transmite un **hotel boutique de la costa de Alicante** —luz, calidez,
confianza— y **esconde la complejidad web3** tras un lenguaje de hospitalidad.

| Principio | Aplicación |
|-----------|-----------|
| **La hospitalidad primero** | Vocabulario de viajero, no de cripto: «Reservar» (no «Mint/Buy»), «Traspasar» (no «Transfer»), «Tus noches» (no «Tu wallet»). El NFT nunca se nombra en la UI pública. |
| **Confianza para pagar** | CTAs en teal profundo (alto contraste), sellos de «pago verificado», histórico público accesible, estados de transacción siempre visibles y explicados. |
| **Mobile-first real** | Diseñado a 320 px primero; áreas táctiles ≥44 px; sin scroll horizontal; el pulgar alcanza las acciones. |
| **Luz, no oscuridad** | Fondo arena cálido; fotografía protagonista; cripto-dark evitado a propósito. |
| **Calma > densidad** | Una acción primaria por pantalla; jerarquía tipográfica fuerte; aire. |

**Diferenciador memorable:** la combinación de **serif editorial cálida (Fraunces)** con
foto a sangre y paleta de arena/mar hace que parezca el sitio de un hotel real con encanto,
no un marketplace de NFTs.

---

## 2. Design tokens

### 2.1 Color (con ratio de contraste sobre su fondo de uso)

| Token | Hex | Uso | Contraste |
|-------|-----|-----|-----------|
| `--sand` | `#FBF6EC` | Fondo de página | — |
| `--sand-2` | `#F3EAD8` | Superficie alterna, estados | — |
| `--shell` | `#FFFFFF` | Cards, superficies elevadas | — |
| `--line` | `#E7DCC6` | Bordes, separadores | — |
| `--ink` | `#1B2327` | Texto principal | **14.0:1** sobre sand ✅ |
| `--ink-soft` | `#4C575C` | Texto secundario | **7.0:1** sobre sand ✅ |
| `--sea` | `#0E5A63` | **Primario** (CTA, enlaces, foco de marca) | **7.2:1** con blanco ✅ |
| `--sea-deep` | `#08424A` | Hover de primario | >9:1 ✅ |
| `--terracotta` | `#C0542E` | Acento en **fondos** (badge Reventa, dot) — **no** como texto pequeño | 4.6:1 sobre blanco; **4.29:1 sobre arena ❌** |
| `--terracotta-text` | `#A8431F` | Acento como **texto** sobre arena (eyebrow, mensajes de error) | **5.0:1** sobre sand ✅ |
| `--olive` | `#5E6B45` | Estado «disponible», sage | 4.8:1 con blanco ✅ |
| `--gold` | `#C68A2E` | Detalle premium (Suite) | usar con `--ink` encima |
| `--ocean` **(nuevo)** | `#0F2C3F` | Superficie oscura editorial: hero, pie, cabecera de administración | **13,4:1** con `sand` · 14,5:1 con `shell` ✅ |
| `--ocean-soft` **(nuevo)** | `#16455E` | Superficie oscura secundaria; hover sobre oscuro | 4,54:1 con `champagne` ✅ |
| `--champagne` **(nuevo)** | `#C5A880` | Detalle premium **solo sobre oscuro** (filetes, iconos, cifras) | 6,39:1 sobre `ocean` ✅ · **2,26:1 sobre blanco ❌** |
| `--line-strong` **(nuevo)** | `#8F7F5F` | **Frontera de controles** (`input`/`select`/`textarea`), WCAG 1.4.11 — aplicado en los **89 controles** con borde y protegido por `control-boundary.test.ts` | 3,91:1 blanco · 3,63:1 arena · 3,27:1 arena-2 ✅ |
| `--success` / `--success-bg` **(nuevos)** | `#2F6B4F` / `#E3EFE7` | Confirmaciones | 6,29:1 con blanco · 5,32:1 sobre su fondo ✅ |
| `--warning` / `--warning-bg` **(nuevos)** | `#8A5A12` / `#F7E9C9` | Avisos (ventana corta, stock, preventivo) | 5,49:1 sobre arena · 4,91:1 sobre su fondo ✅ |
| `--error` / `--error-bg` **(nuevos)** | `#9E2B1F` / `#F8E3DE` | Errores y bloqueos | 7,45:1 con blanco · 6,04:1 sobre su fondo ✅ |
| `--info` / `--info-bg` **(nuevos)** | `#14556B` / `#DCEAF1` | Información y ayuda | 7,67:1 sobre arena · 6,72:1 sobre su fondo ✅ |

> **Decisión de accesibilidad:** el CTA primario es **teal** (7:1) por confianza y
> contraste. `--terracotta` solo se usa en **fondos** (badges/dot); como **texto sobre
> arena** se usa `--terracotta-text` (#A8431F, 5:1). El **anillo de foco NO es terracota**
> (daba 1.71:1 sobre el CTA teal): es un **doble anillo arena + teal** con ≥3:1 contra
> ambos colores adyacentes (WCAG 1.4.11 / 2.4.7).
>
> **Evolución del 2026-09-27** (aprobada a partir de `RepoTecnico/propuesta_imagen_visual.md`): los
> **12 tokens originales no cambian**; se **añaden** el registro oscuro (`ocean`, `ocean-soft`), el
> detalle `champagne` (solo sobre oscuro), el borde de controles `line-strong` y los cuatro estados
> semánticos. **Velo del hero**: `bg-ocean/65` (compuesto `#637682` sobre blanco) → **4,73:1** con
> texto blanco; al 55 % daba 3,52:1 (solo texto grande). Los **32 pares medidos** y su veredicto se
> reproducen con `node scripts/design/contrast-audit.mjs`.

### 2.2 Tipografía

- **Display:** `Fraunces` (serif variable, óptico) — titulares, precios, nombres de habitación.
- **UI/cuerpo:** `Hanken Grotesk` — navegación, texto, formularios, botones.
- **Cascada cirílica (2026-09-27):** Fraunces **no publica** el subconjunto `cyrillic` y Hanken
  Grotesk solo el *extendido* (sin el rango ruso básico U+0400–045F), así que el locale RU caía a
  `Georgia`/`system-ui`. Se añade un **respaldo glifo a glifo**: `Playfair Display` (display) e
  `Inter` (UI) cargados **solo** con el subconjunto `cyrillic` y `preload: false`, tras la fuente de
  marca en la pila (`var(--font-fraunces), var(--font-playfair), …`). ES/EN no cambian. Guardián:
  `apps/web/src/lib/a11y/cyrillic-fonts.test.ts`.
- **Escala** (mobile → desktop con `clamp`): `display` `2.8→5rem` · H1 `2.3→4.1rem` · H2 `1.6→2.2rem`
  · H3 `1.3rem` · H4 `1.075rem` · `body-lg 1.1875rem` · cuerpo `1.0625rem (17px)` · `body-sm 0.95rem`
  · small `0.9rem` · `caption 0.82rem` · `overline 0.78rem` (+0,14em) · micro `0.78rem` · `code 0.9rem`.
- Cuerpo mínimo **16px**; interlineado 1.5; medida de línea ≤ 66ch.

### 2.3 Espaciado, formas, sombras, motion

- **Espaciado** (escala 4px): 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 48 · 64 · 96.
- **Radios:** `--r-xs 6` · `--r-sm 10` · `--r-md 16` · `--r-lg 22` · `--r-pill 999`.
- **Sombras:** `sm` (reposo), `md` (hover card), `lg` (elevación/modal) — todas con tinte teal cálido;
  el resumen flotante de reserva reutiliza `md`.
- **Motion:** `--ease cubic-bezier(.21,.68,.27,.99)`; reveal escalonado al cargar (≤0.6s);
  hover card `translateY(-5px)` + zoom de foto. **Respeta `prefers-reduced-motion`.**

### 2.4 Breakpoints (RNF-01)

| Nombre | Ancho | Grid catálogo |
|--------|-------|---------------|
| Móvil | < 768 px (base 320) | 1 columna |
| Tablet | 768–1023 px | 2 columnas |
| Desktop | ≥ 1024 px | 3 columnas |

---

## 3. Librería de componentes (Atomic Design)

### Átomos
- **Botón** (`.btn`): variantes `primary` (teal), `ghost` (borde), `danger` (admin); min-height 44px.
- **Chip de filtro**: toggle accesible (`aria-pressed`), scroll horizontal en móvil.
- **Badge**: tipo de habitación / `Suite` (gold) / `Reventa` (terracota).
- **Input / Select / DatePicker**, **Etiqueta**, **Precio** (Fraunces + sufijo ETH), **Dot de estado**.
- **Icono** (stroke 2px, set propio: calendario, marcador, ola, wallet, check, alerta).

### Moléculas
- **NightCard**: foto + badge + habitación + tipo + fecha + precio + CTA + guardar. (Estados de card: disponible, reventa, suite, vendida, expirada, `img-fallback`. **Estados del CTA `buy-button`:** normal · **sin saldo** (`disabled` + `aria-disabled` + mensaje `insufficient-balance`, CU-05 05a) · **en curso** (`aria-busy`, bloqueado durante firma/minado, anti-doble-envío).)
- **WalletButton**: «Conectar» → conectado (`dot` + dirección abreviada) → red incorrecta.
- **FilterBar**: grupo de chips + contador de resultados (`aria-live`).
- **TxToast / TxStepper**: pendiente → confirmada → revertida.
- **MetricCard** (dashboard): valor + etiqueta + periodo + sparkline.
- **ChatBubble** + **ChatComposer** (asistente).
- **Pagination / LoadMore**: botón «cargar más» (`load-more`) con estado de carga incremental, fin de lista (`end-of-list`), anuncio `aria-live` y gestión de foco al añadir resultados (RNF-02, ventana de 90 días).

### Organismos
- **Header** (marca + nav + wallet), **Hero editorial**, **CatalogGrid**, **HistoryTable**,
  **DashboardGrid**, **MintForm** (admin), **ChatPanel**, **TxModal** (confirmación de compra),
  **OnboardingSheet** (instalar/añadir red), **ResaleManager** (fijar/actualizar/cancelar precio de reventa + `claim`), **EmptyState / DegradedState**.

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
│ [ Reservar esta noche ]   (teal, 44h) │
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
`Disponible` (oliva) · `Reventa` (terracota) · `Suite` (gold) · `Vendida` (atenuada) ·
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
- **Teclado:** todo operable; `:focus-visible` con anillo terracota 3px; orden lógico; **skip link**.
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
