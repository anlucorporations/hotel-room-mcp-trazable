# Propuesta de Reestructuración — Hotel Marina del Sol

> **Documento**: propuesta de análisis (NO ejecutada). No modifica la estructura actual del proyecto.
> **Fuente**: [`RepoTecnico/reestructuraHotel.md`](reestructuraHotel.md)
> **Base de contraste**: estado real del repositorio (`apps/`, `packages/`, `docs/`, `RepoTecnico/`).
> **Autor**: @asistenteProyecto · **Fecha**: 2026-09-26 · **Versión**: 0.1 (borrador para revisión)
> **Regla de esta entrega**: solo se crea este `.md`. No se mueven, renombran ni crean carpetas de código.
>
> **Decisiones del cliente aplicadas** (detalle en
> [`proceso_propuesto_habitacion.md`](proceso_propuesto_habitacion.md)):
> - **D-1** — Habitación la gestiona el **administrador con wallet** (back-office + rol + TOTP).
> - **D-2** — Ficha en **PostgreSQL**; se **ancla on-chain solo la publicación** (hash de la ficha).
> - **D-3** — La **BD es la fuente única** del maestro; el maestro on-chain se alimenta desde ella.
> - **D-4** — Acuñado **híbrido**: ventana automática al publicar + mint manual de fechas sueltas.
> - **D-5** — Imágenes en el servidor, `./docs/imagenes`, nomenclatura `<habitación>-<tipo>-<fecha>-<nº>`.
> - **D-6** — Idiomas: **ES obligatorio**; EN/RU opcionales con respaldo al español.
> - **D-7** — Se permiten habitaciones **fuera de rango**; el número no puede repetirse.
> - **D-8** — **Archivar; nunca borrar** una habitación.
> - **D-9** — **Varios administradores con rol** (sin dependencia de una sola wallet).
> - **D-10** — Registro de habitaciones **dentro de `HotelNights`** (contrato único, ADR-02).
> - **D-11** — **Ventana de acuñado global configurable** (p. ej. 90 días).
> - **D-12** — La «fecha» del nombre de la foto es la de **subida/captura**.
> - **D-13** — El registro on-chain **arranca vacío**; las 50 habitaciones se crean desde la web.
> - **D-14** — `RoomMaster` se conserva como **semilla de carga y respaldo**, sin autoridad.
> - **D-15** — **Reset total**: se empieza de cero (con copia de seguridad y limpieza previas).
> - **D-16** — Acuñado **idempotente**: omite las noches ya existentes.
> - **D-17** — Ventana **al publicar + botón manual de extensión** (con aviso de agotamiento).
> - **D-18** — Al publicar se ancla **huella (hash) de la ficha** + nº + fecha.
> - **D-19** — **Dos estados separados**: publicación (admin) y operativo (housekeeping).
> - **D-20** — Galería: **solo JPG, ≤2 MB, máx. 5 fotos** (primera = portada).
> - **D-21** — Obligatorios: **nº, tipo, capacidad, camas, descripción ES**.
> - **D-22** — Tipos **fijos: Simple, Doble, Suite**.
> - **D-23** — Al archivar, futuras fuera de venta; **vendidas siguen válidas**.
> - **D-24** — Cambio de contrato + reset se ejecutan **al final, como corte único**.
> - **D-25** — Primer ciclo: **shell de Administración + Habitación completa**.
> - **D-26** — Orden **operación primero**: Front Office tras Habitación.
> - **D-27** — Home pública incluye **reseñas de huéspedes** (además del resto).
> - **D-28** — Reseñas **anónimas y verificadas** (noche consumida on-chain); el admin modera.
> - **D-29** — Acordeón de **una sola sección abierta**; móvil con botón.
> - **D-30** — Housekeeping en tiempo real con **SSE**.
> - **D-31** — **`/` = home de marca**; catálogo en **`/catalogo`** con redirecciones.
> - **D-32** — Front Office anida bajo **`/recepcion`**.
> - **D-33** — Suite financiera = **tercera versión** (fuera de esta entrega).
> - **D-34…D-55** — Bloque 2 (Recepción/Reservas, Actividades, Housekeeping y Mantenimiento): ver
>   [`proceso_propuesto_recepcion.md`](proceso_propuesto_recepcion.md).
> - **D-56…D-64** — Bloque 3 (roles, reserva↔token, reseñas, pagos, notificaciones e IA de personal):
>   ver [`proceso_propuesto_bloque3.md`](proceso_propuesto_bloque3.md). Claves: `HOUSEKEEPING` y
>   `MAINTENANCE` como roles de BD sin wallet; acuñar omite reservas y al pagar el 100 % se asigna o se
>   acuña; reseñas moderadas por el admin y firmadas con EIP-712; anticipo off-chain y liquidación con
>   wallet; web + email (Telegram a la v4); rutas independientes `/housekeeping` y `/mantenimiento`.
> - **D-65…D-72** — Bloque 4 (Suite Pública): ver
>   [`proceso_propuesto_publica.md`](proceso_propuesto_publica.md). Claves: reserva con anticipo por
>   transferencia y liquidación con wallet; galería propia del hotel; contacto con mapa
>   **OpenStreetMap**; reseñas en home y ficha con nota media; planes informativos; home **one-page**;
>   wallet conectada **al inicio** de la reserva.
> - **D-73…D-75** — Bloque 5 (galería/planes y accesibilidad): ver
>   [`proceso_propuesto_bloque5.md`](proceso_propuesto_bloque5.md). Claves: **`hotel_images`** y
>   **`hotel_offers`** como tablas gestionadas por el admin; el escaneo **axe** se extiende a **todas
>   las rutas nuevas** (escritorio y móvil).

---

## 1. Resumen ejecutivo

El documento fuente pide reorganizar el producto en **tres suites** con públicos, dispositivos y
navegación distintos:

| Suite | Público | Patrón de navegación pedido | Estado actual |
|---|---|---|---|
| **Administración** | Owner + personal interno | Dashboard con **barra lateral derecha** y **menú acordeón**, 6 secciones | Parcial: existe `/admin/*` con sidebar izquierdo y 7 + 5 entradas planas |
| **Front Office** | Operador de recepción (y owner) | Dashboard **minimalista** con **barra superior** | Parcial: solo `/recepcion` (check-in/out); faltan reservas |
| **Pública** | Huésped / comprador | **Home page** de marca, acceso público, reserva conectando wallet | Parcial: `/` es catálogo de venta, no home de marca |

**Conclusión**: la propuesta no es un rediseño cosmético. Es una **reorganización de la arquitectura de
información (IA) y de la navegación**, más **5 dominios funcionales nuevos** que hoy no existen como
código: *Habitación*, *Housekeeping*, *Mantenimiento*, *Actividades* y *Motor de Reservas*. La suite
financiera (Facturación, métodos de pago, Caja Chica) está explícitamente marcada en el fuente como
**«para la tercera versión»**.

**Enfoque recomendado**: reestructuración **incremental y aditiva**. Se construye la nueva shell de
navegación (layout + IA) y se **reubican** las páginas actuales dentro de ella sin reescribir su lógica;
después se añaden los dominios nuevos por ciclos, cada uno 100% operativo. Nada de "big bang".

---

## 2. Análisis del documento fuente

### 2.1 Qué pide, literalmente

1. **Suite Administración** — dashboard administrativo, navegación a la derecha, menú acordeón:
   - **1.1 Habitación**: la habitación como *ente* → configuración, mantenimiento, estatus.
   - **1.2 Recepción**: ofertas/publicaciones de habitaciones, reservas por confirmar, disponibilidad,
     cancelaciones y modificaciones.
   - **1.3 Actividades**: gestión/administración de actividades del hotel para huéspedes.
   - **1.4 Housekeeping**: (a) tablero de estados en tiempo real —Limpia, Sucia, En Mantenimiento,
     Ocupada— con cambio automático tras check-out/check-in y actualización desde móvil con un clic, y
     asignación de turnos/cargas por mucama; (b) lencería y suministros con descuento automático de stock
     por habitación limpiada o huésped registrado, y alerta al panel de compras bajo umbral crítico.
   - **1.5 Administración** (financiero, **tercera versión**): facturación y cobranzas con PDF fiscal,
     métodos de pago y conciliación contra el folio, y Caja Chica (apertura, arqueo, cierre por turno,
     diferencias).
   - **1.6 Mantenimiento y Servicios Técnicos**: incidencias que **bloquean la habitación** automáticamente
     en ventas hasta que el ticket pase a «Resuelto»; mantenimiento preventivo con cronograma de alertas.
2. **Suite Front Office** — dashboard minimalista, barra superior, manejada por el Operador de Recepción
   (también admin/owner):
   - **2.1 Motor de Reservas**: captura directa Web/WhatsApp, panel de disponibilidad con llegadas del día
     en tiempo real, confirmación automática por email/Telegram, cancelaciones y modificaciones con reglas
     que liberan inventario (o por vencimiento del anticipo).
   - **2.2 Recepción (Check-in/Check-out)**: validación/consumo de reserva, entrega de llaves/PIN, folio y
     recibo digital; check-out con cálculo de consumos pendientes, cargos extra (daños, sanciones) y cambio
     instantáneo a «Sucia/Para Limpieza».
3. **Suite Pública** — home page de marca con servicios, estilos de habitación, planes especiales,
   actividades y servicios extra; acceso público; reservas conectando wallet; catálogo de ofertas; acceso
   al mercado de reventa; clasificación del hotel y experiencia de usuario.

### 2.2 Ambigüedades y huecos detectados

| # | Punto | Problema | Impacto |
|---|---|---|---|
| A-1 | **1.4 / 1.6 estado de habitación** | Se pide «estado» de habitación para Housekeeping y «bloqueo» para Mantenimiento, pero hoy el estado se deriva de datos on-chain de noches, no existe un ente *Habitación* persistente | Requiere entidad de datos nueva (ver §5) |
| A-2 | **1.2 Recepción vs 2.1 Motor de Reservas** | Ambas suites tocan reservas, disponibilidad y cancelaciones; no queda claro qué es back-office (configuración/oferta) y qué es operación diaria | Riesgo de solapamiento UI/lógica |
| A-3 | **1.4.1 «mucama/camarera», turnos** | No se define el modelo de turnos, ni si hay app móvil dedicada o web responsive | Alcance y esfuerzo abiertos |
| A-4 | **2.1 «Web/WhatsApp»** | WhatsApp exige API externa (Cloud API/Twilio) con coste y verificación; no está en el brief original | Dependencia externa no presupuestada |
| A-5 | **2.1 «confirmación por Telegram»** | Telegram Bot API es viable, pero no hay bot ni token en el proyecto | Dependencia externa nueva |
| A-6 | **1.5.1 «facturas/recibos fiscales»** | Facturación fiscal real (España, Veri*factu/TicketBAI) tiene implicaciones legales y de gestoría | Fuera del alcance técnico actual; requiere decisión del cliente |
| A-7 | **3.5 truncado** | El fuente termina: «muestra la clasificación del hotel, la experiencia de usuario y la…» **(frase incompleta)** | Requisito incompleto; ver pregunta Q-1 |
| A-8 | **3.2 «reservas conectando la wallet»** | La compra actual es venta de *noches tokenizadas* (ERC-721). «Reservar» una habitación por fecha es un flujo distinto (disponibilidad + reserva + pago) | Requiere reconciliar reserva tradicional con el modelo NFT |
| A-9 | **Nav derecha + acordeón** | No se especifica comportamiento responsive (móvil), ni si el acordeón es multi-abierto o acordeón puro | Decisión de UX (Q-2) |
| A-10 | **Housekeeping «tiempo real»** | No se define el mecanismo (SSE, WebSocket, polling) | Decisión técnica |
| A-11 | **Alcance financiero** | «tercera versión» no está fechado ni acotado | Planificación por fases |

### 2.3 Requisitos implícitos no funcionales
- La Suite Pública «llamativa con branding total» sigue obligada por los criterios ya vigentes:
  **WCAG 2.1 AA verificable** (RNF-15), **ES/EN/RU** (RNF-13), **móvil primero** (RNF-14),
  **anonimato de compra** (RNF-11, ADR-20) y **verificabilidad con artefacto** (RNF-21, ADR-23).
- La actualización de estado desde móvil (housekeeping) debe ser **accesible y operable con un toque**,
  lo que añade un caso de uso móvil al escaneo axe actual.

---

## 3. Estado actual del proyecto (inventario real)

### 3.1 Aplicaciones y paquetes

```
apps/
  web/      Next.js 14 App Router — tienda + back-office + recepción + asistente
  mcp/      Servidor MCP (4 herramientas read-only)
  worker/   Listener on-chain, agregados, cola de correo, quema, push
  monitor/  Vigilancia de /health, cadena y gas
packages/
  contracts/ Solidity (HotelNights, RoomMaster, Faucet) — Foundry
  shared/    Dominio, BD, recepción, auth, rates, push, cola, pms…
  config/    Configuración compartida
```

### 3.2 Rutas actuales de `apps/web`

| Ruta | Función actual | Suite destino (propuesta) |
|---|---|---|
| `/` | Catálogo de venta primaria | **Pública** (se convierte en home + catálogo) |
| `/reventa` | Mercado secundario | **Pública** |
| `/mis-noches`, `/mis-noches/mis-reventas` | Cartera del comprador | **Pública** |
| `/historico` | Histórico público | **Pública** |
| `/checkin` | Pantalla del resguardo (huésped) | **Pública** |
| `/asistente` | Chat de compra (MCP) | **Pública** |
| `/ayuda`, `/ayuda/[slug]` | Centro de ayuda | **Pública** |
| `/privacidad`, `/terminos` | Legal | **Pública** |
| `/recepcion` | Check-in / Check-out / Day board | **Front Office** |
| `/admin/mint` | Alta de inventario | **Administración → Habitación** y/o Recepción |
| `/admin/dashboard` | 7 KPIs + gráficas + CSV | **Administración → Administración (datos)** |
| `/admin/royalty` | Royalty informativo | **Administración → Administración** |
| `/admin/pausa` | Pausa del contrato | **Administración → Mantenimiento/Plataforma** |
| `/admin/fondos` | Fondos/retiros | **Administración → Administración** |
| `/admin/caducadas` | Noches caducadas | **Administración → Recepción** |
| `/admin/roles` | Roles on-chain | **Administración → Administración** |
| `/admin/sistemas/*` | Contratos, usuarios, finanzas, operaciones | **Administración → Sistemas** (transversal) |

### 3.3 Navegación actual

- **Back-office**: `AdminLayout` con **sidebar izquierda** plana (`ADMIN_NAV` 7 ítems + `ADMIN_SYSTEMS_NAV`
  5 ítems solo owner), gating por rol on-chain (`adminNav.ts`).
- **Público**: `SiteHeader` con nav superior (`/`, `/reventa`, `/mis-noches`, `/historico`, `/asistente`, `/ayuda`).
- **Recepción**: página suelta `/recepcion`, sin shell ni barra propia.

### 3.4 Modelo de datos actual (`RepoTecnico/base_datos.sql`)

`nfts`, `listings`, `sale_events`, `admin_sessions`, `admin_users`, `mfa_recovery_codes`,
`email_notifications`, `push_subscriptions`, `checkin_contingency_logs`, `additional_charges`,
`stay_checkouts`, `checkout_incidents`, `worker_checkpoints`, `worker_processed_logs`,
`worker_aggregate_counters`, `worker_sale_history`.

**No existen** tablas de: habitaciones (ente físico), estado de limpieza, turnos de mucama, lencería/
suministros, actividades, incidencias técnicas, mantenimiento preventivo, reservas, folios, pagos,
facturación, caja, ni canales de notificación alternos.

### 3.5 Dominios existentes reutilizables

- `packages/shared/src/domain/room-master.ts`: maestro de 50 habitaciones (101–130, 201–220) y tipos.
- `packages/shared/src/reception/`: check-in, day-board (`RoomBoardStatus`, `buildRoomBoard`), checkout,
  recovery-code, errores.
- `packages/shared/src/maintenance/retention.ts`: retención de datos (**no** es mantenimiento del hotel).
- `packages/shared/src/queue/notifications.ts` + `apps/worker/src/mailer.ts`: cola única de notificaciones
  (base para email/Telegram).
- `packages/shared/src/pms/adapter.ts`: adaptador PMS (pendiente de cliente, B-5).

> **Nota de vocabulario**: el dominio «Mantenimiento» del fuente (averías/preventivo) **no** debe
> confundirse con `shared/maintenance/retention.ts` (retención de datos). En la propuesta se propone
> `incidents` / `preventive` para evitar la colisión.

---

## 4. Propuesta de arquitectura de información y navegación

### 4.1 Principio rector

Tres shells independientes bajo el mismo `apps/web`, con **una sola fuente de verdad** para la IA
(un archivo de configuración de navegación por suite, análogo al actual `adminNav.ts`):

```
apps/web/src/components/layout/
  PublicShell.tsx      (ya existe)  → Suite Pública
  SiteHeader.tsx       (ya existe)  → header público (se enriquece)
  AdminShell.tsx       (nuevo)      → Suite Administración (sidebar derecha + acordeón)
  FrontOfficeShell.tsx (nuevo)      → Suite Front Office (barra superior minimalista)
```

### 4.2 Suite Administración — sidebar derecha + acordeón

**Shell**: layout de contenido a la izquierda, **barra de navegación a la derecha**, menú acordeón con
6 secciones principales (cada una con sub-secciones). Visible solo con sesión válida + rol.

```
Administración (sidebar derecha, acordeón)
├── 1. Habitación
│   ├── Inventario y configuración (nº, tipo, capacidad, tarifa base, amenidades)
│   ├── Estatus operativo (Limpia · Sucia · En Mantenimiento · Ocupada)
│   └── Ficha de habitación (historial, fotos, notas)
├── 2. Recepción
│   ├── Ofertas y publicaciones (qué se pone a la venta y a qué precio)
│   ├── Reservas por confirmar (cola de aprobación / anticipos)
│   ├── Disponibilidad (calendario por habitación y por tipo)
│   └── Cancelaciones y modificaciones (reglas + registro)
├── 3. Actividades
│   ├── Catálogo de actividades (nombre, cupo, precio, horario, temporada)
│   ├── Programación y agenda
│   └── Reservas de huéspedes a actividades
├── 4. Housekeeping
│   ├── Tablero de estados en tiempo real
│   ├── Turnos y carga por mucama/camarera
│   └── Lencería y suministros (stock, consumos, umbrales y alertas)
├── 5. Administración (Finanzas y Contabilidad — 3ª versión)
│   ├── Facturación y cobranzas (PDF fiscal, desglose de impuestos)
│   ├── Métodos de pago y conciliación contra folio
│   └── Caja chica (apertura, arqueo, cierre por turno, diferencias)
├── 6. Mantenimiento y Servicios Técnicos
│   ├── Incidencias (reporte → bloqueo de venta → resolución → desbloqueo)
│   └── Mantenimiento preventivo (cronograma y alertas por periodicidad)
└── Sistemas (transversal, solo owner — se conserva lo actual)
    ├── Contratos · Usuarios · Finanzas · Operaciones
```

**Decisión de diseño propuesta**: mantener `/admin` como raíz de esta suite (evita romper enlaces
existentes y guards) y **reagrupar** la IA en el nuevo acordeón. Los ítems actuales se reubican así:

| Ítem actual | Nueva ubicación |
|---|---|
| `/admin/mint` | Habitación → Inventario **y** Recepción → Ofertas (según el resultado de Q-3) |
| `/admin/dashboard` | Administración → Panel de datos (KPIs) |
| `/admin/royalty` | Administración → Royalty (informativo) |
| `/admin/pausa` | Mantenimiento y Servicios Técnicos → Estado de plataforma (o Sistemas) |
| `/admin/fondos` | Administración → Fondos/retiros |
| `/admin/caducadas` | Recepción → Caducadas |
| `/admin/roles` | Administración → Roles y permisos (o Sistemas) |
| `/admin/sistemas/*` | Sistemas (sin cambio) |

### 4.3 Suite Front Office — barra superior minimalista

**Shell**: sin sidebar; barra superior compacta con las funciones del día. Orientada a que el
recepcionista complete el turno sin ruido.

```
Front Office (barra superior)
├── Reservas (motor)
│   ├── Nueva reserva (mostrador / web / WhatsApp)
│   ├── Disponibilidad y llegadas del día
│   ├── Confirmaciones (email / Telegram) y anticipos
│   └── Cancelaciones y modificaciones
├── Recepción (operación)
│   ├── Check-in (validación de resguardo / reserva)
│   ├── Check-out (folio, consumos, cargos extra)
│   └── Day board (estado del día por habitación)
└── Huéspedes (ficha mínima, sin PII de filiación — ADR-20)
```

**Ubicación de rutas propuesta**: extender `/recepcion` a `/recepcion/*` (reservas, checkin, checkout,
tablero) para no duplicar el guard de recepción ya probado, o bien crear `/front-office/*`. Decisión en Q-2.

### 4.4 Suite Pública — home page de marca

La home (`/`) es **one-page** con secciones ancla (D-71); el resto son páginas propias:

```
Pública
├── /  (home one-page, D-71)
│   ├── Hero de marca + categoría del hotel (D-70)
│   ├── Servicios y estilos de habitación
│   ├── Planes especiales (escaparates informativos, D-69)
│   ├── Actividades y servicios extra (vitrina)
│   ├── Experiencia (galería propia del hotel, D-66)
│   ├── Reseñas aprobadas con nota media (D-68)
│   └── Contacto + mapa OpenStreetMap (D-67)
├── /catalogo            → catálogo de ofertas (D-31)
├── /reventa             → mercado secundario
├── /mis-noches          → cartera del comprador y acceso a la reserva
├── /historico           → histórico público
├── /checkin             → resguardo de check-in
├── /asistente           → asistente de compra (MCP)
└── /ayuda, /privacidad, /terminos
```

**Flujo de reserva (D-65/D-72):** el huésped conecta la **wallet al inicio**, la noche se retiene y paga
el **anticipo por transferencia**; al **liquidar el 100 %** se compra el token con la wallet.

**Punto crítico (A-8)**: hoy `/` es el catálogo de *noches tokenizadas*. **Resuelto en D-31**: `/` pasa a
ser **home de marca** y el catálogo se mueve a **`/catalogo`**, con redirecciones desde los enlaces
antiguos.

### 4.5 Rutas de personal (fuera de las tres suites)

Además de las tres suites, el personal operativo tiene **dos pantallas independientes**, pensadas para el
móvil y gobernadas por roles de base de datos **sin wallet** (D-56):

```
/housekeeping     → tablero del personal de limpieza (rol HOUSEKEEPING, D-62)
/mantenimiento    → tickets del técnico (rol MAINTENANCE, D-63)
```

Ambas reutilizan la autenticación existente (contraseña + TOTP) y muestran una **vista simplificada**
(solo lo asignado a cada persona), sin el resto del menú ni datos de ventas.

---

## 5. Propuesta de modelo de datos (dominios nuevos)

> **Estado actualizado:** estos dominios **ya no son solo propuesta**: la sección Habitación y reseñas
> (9 tablas) y el bloque 2 (17 tablas) están **sincronizados en `migrator.ts`, `base_datos.sql`,
> `diccionario_datos.md` y `diagrama_er.md`** (42 tablas). La tabla siguiente es el resumen original de
> dominios; el detalle vigente está en los tres artefactos de datos.

| Dominio | Tablas propuestas | Notas |
|---|---|---|
| **Habitación** | `rooms`, `room_types`, `room_amenities`, `room_status_history` | El maestro actual vive en código (`room-master.ts`); se propone elevarlo a BD como fuente única |
| **Housekeeping** | `housekeeping_shifts`, `housekeeping_assignments`, `housekeeping_room_logs`, `supply_items`, `supply_stock_movements`, `supply_thresholds` | Descarga automática por limpieza/registro; alerta bajo umbral |
| **Mantenimiento** | `maintenance_incidents`, `maintenance_incident_events`, `preventive_plans`, `preventive_tasks` | El incidente bloquea/desbloquea la venta de la habitación |
| **Actividades** | `activities`, `activity_schedules`, `activity_bookings` | Cupo, precio, temporada |
| **Reservas / Front Office** | `reservations`, `reservation_nights`, `reservation_status_history`, `folios`, `folio_lines`, `payments` | Reconciliación reserva ↔ noche tokenizada |
| **Financiero (3ª v.)** | `invoices`, `invoice_lines`, `cash_sessions`, `cash_movements` | Fuera de esta fase; solo se reserva el diseño |
| **Canales** | `notification_channels`, `notification_deliveries` | Email (ya existe) + Telegram (nuevo) |

**Restricciones de diseño obligatorias**:
- **Sin PII de viajeros** salvo lo mínimo operativo y con base legal (ADR-20, RNF-11). La filiación sigue
  fuera de la plataforma.
- Los tres artefactos de datos (`diccionario_datos.md`, `diagrama_er.md`, `base_datos.sql`) se actualizan
  **juntos** cuando la fase lo apruebe.
- Toda tabla nueva con `created_at` / `updated_at`, índices sobre FKs y `ON DELETE` explícito.

---

## 6. Propuesta de componentes y módulos

| Capa | Reutilizar | Crear |
|---|---|---|
| **Shell / layout** | `PublicShell`, `SiteHeader`, `AdminLayout` (evoluciona) | `AdminShell` (sidebar derecha + acordeón), `FrontOfficeShell` (top nav), `adminNav.ts` → IA de 6 secciones |
| **Habitación** | `room-master.ts`, `AdminMint` | `rooms` repository + ficha/estatus **gestionada por el administrador con wallet** (D-1) |
| **Housekeeping** | `day-board.ts`, `push/service.ts` | Tablero en tiempo real, asignador de turnos, inventario de suministros |
| **Mantenimiento** | — | Incidencias + bloqueo de venta + preventivo |
| **Actividades** | — | CRUD + agenda + reservas |
| **Reservas** | `reception/service.ts`, `pms/adapter.ts`, `queue/notifications.ts` | Motor de reservas, panel de llegadas, reglas de cancelación/anticipo |
| **Recepción** | `CheckInPanel`, `CheckoutPanel`, `DayBoard`, `ReceptionDashboard` | Folio y cargos extra; enlace a housekeeping al hacer check-out |
| **Financiero** | — | Fase 3ª versión |
| **Pública** | `CatalogClient`, `Hero`, `SiteHeader`, `ResaleMarketClient` | Home de marca, vitrina de actividades, reserva con wallet |
| **Canales** | `worker/mailer.ts`, `queue/notifications.ts` | Adaptador Telegram |

---

## 7. Plan de ejecución propuesto (incremental, aditivo)

> **SUPERADO por el plan definitivo:** [`plan_definitivo.md`](plan_definitivo.md), que integra las
> decisiones D-1…D-75 y las 44 tablas. La tabla siguiente es la versión inicial de la propuesta y se
> conserva como referencia histórica.

Cada ciclo es una **entrega 100% operativa**, con pruebas y artefacto (ADR-23). Recompuesto con las
decisiones D-1…D-26 (D-24: el corte de contrato/reset va al final; D-25: primer ciclo = shell +
Habitación; D-26: operación primero).

| Fase | Entregable | Decisiones que aplica | Riesgo | Depende de |
|---|---|---|---|---|
| **F0** | Cierre de definición: IA y rutas definitivas; plan aprobado | — | Bajo | — |
| **F1** | **Shell de Administración** (sidebar derecha + acordeón) + **sección Habitación completa**: `rooms` en BD, ficha con campos obligatorios, galería local (`docs/imagenes`), crear/editar/publicar/archivar, dos estados, idiomas con fallback | D-1, D-2, D-5, D-6, D-7, D-8, D-9, D-12, D-18, D-19, D-20, D-21, D-22, D-23, D-25 | Medio | F0 |
| **F2** | **Front Office**: shell con barra superior + Recepción (check-in/out actuales reubicados) y **Reservas** (disponibilidad, llegadas, cancelaciones), todo anidado en `/recepcion` | D-26, D-32 | Alto | F1 |
| **F3** | **Housekeeping**: tablero de estados operativos, turnos/cargas, consumibles con alertas | D-19 | Alto (tiempo real, móvil) | F1, F2 |
| **F4** | **Mantenimiento**: incidencias con bloqueo de venta + preventivo con alertas | D-19, D-23 | Medio | F1 |
| **F5** | **Actividades**: catálogo, agenda y reservas | — | Medio | F1 |
| **F6** | **Pública**: home de marca **en `/`**, catálogo en `/catalogo`, vitrina de servicios/actividades, **reseñas verificadas**, reserva con wallet | D-27, D-28, D-31 | Alto (UX/marca) | F0 |
| **F7** | **Administración financiera** (facturación, pagos, caja chica) — **tercera versión, fuera de esta entrega** | D-33 | Alto (legal/fiscal) | F2 |
| **F8** | **Corte final (cutover)**: modificación de `HotelNights` con **registro dinámico de habitaciones**, sincronización BD → cadena, **reset total** con copia de seguridad y limpieza, y primer acuñado de la ventana | D-3, D-4, D-10, D-11, D-13, D-14, D-15, D-16, D-17, D-24 | **Muy alto** | F1 | 

**Orden recomendado**: F0 → **F1** → F2 → F3/F4 (paralelizables) → F5 → F6 → F7 → **F8 (corte final)**.
F6 (Pública) puede solaparse con F2–F5 porque toca solo la suite pública; F8 **nunca** se solapa: es un
corte único sobre un sistema ya probado.

### 7.1 Notas del corte final (F8)

- El **registro on-chain arranca vacío** (D-13) y se alimenta desde la BD (D-3); las 50 habitaciones
  actuales se cargan desde la **semilla `RoomMaster`** (D-14), no a mano.
- El **reset** (D-15) exige: copia de seguridad, limpieza coordinada de `nfts`, `sale_events`,
  `listings` y agregados del worker, y aviso a cualquier entorno que use la cadena.
- El **acuñado de la ventana** (D-4/D-11/D-17) es **idempotente** (D-16), se dispara al publicar y se
  extiende con botón manual, con **aviso de agotamiento**.
- Hasta F8, el sistema actual sigue operativo: no se rompe el piloto durante la construcción (D-24).

---

## 8. Trazabilidad con lo existente

| Requisito actual | Cómo encaja en la propuesta |
|---|---|
| RF-01, RF-02 (catálogo y filtros) | Pública → catálogo (posible cambio de `/` a `/catalogo`) |
| RF-03 (back-office alta inventario) | Administración → Habitación / Recepción |
| RF-04, RF-13 (compra con wallet) | Pública → reserva conectando wallet |
| RF-06, RF-15 (reventa y royalties) | Pública → mercado de reventa |
| RF-07, RF-08 (resguardo y check-in) | Front Office → Recepción (se conserva íntegro) |
| RF-09, RF-10 (dashboard e histórico) | Administración → panel de datos; Pública → histórico |
| RF-11 (quema caducadas) | Administración → Recepción → caducadas |
| RF-12 (push) | Transversal a Housekeeping y notificaciones |
| RF-18a (maestro de habitaciones) | Base de la sección Habitación (se eleva a BD) |
| RF-19, RF-20 (faucet, asistente) | Pública |
| RNF-06, RNF-15, RNF-17, RNF-21 | Se mantienen como gates para cada fase nueva |

**Requisitos nuevos candidatos** (numeración a confirmar en F0): RF-24 Habitación como ente; RF-25
Housekeeping y suministros; RF-26 Mantenimiento e incidencias; RF-27 Actividades; RF-28 Motor de reservas;
RF-29 Confirmación por Telegram; RF-30 Home pública de marca; RF-31 Folio/cargos extra.

---

## 9. Riesgos

| # | Riesgo | Mitigación propuesta |
|---|---|---|
| R-1 | **Solapamiento Recepción (1.2) vs Motor de Reservas (2.1)** | F0 fija responsabilidades: Administración configura *oferta*; Front Office opera *día a día* |
| R-2 | **PII / RD 933/2021** al introducir reservas y ficha de huésped | Mantener ADR-20: sin filiación; ficha mínima; datos legales en el mostrador |
| R-3 | **WhatsApp y Telegram**: dependencias externas con coste/verificación | Interfaz de canal abstracta; Telegram bot como primer adaptador; WhatsApp condicionado a decisión del cliente |
| R-4 | **Facturación fiscal real** (Veri*factu/TicketBAI) | Marcar como 3ª versión y subordinar a gestoría del cliente |
| R-5 | **«Tiempo real»** sin mecanismo definido | Elegir SSE vs WebSocket vs polling en F0 (Q-2) |
| R-6 | **Regresión de navegación** al mover rutas | F1 conserva rutas y añade redirecciones; pruebas E2E y axe por shell |
| R-7 | **Cobertura de `web` baja (24,95 %)** con superficie nueva grande | Trinquete por fase + pruebas de los flujos nuevos antes de ampliar |
| R-8 | **Cambio de `/` a home** rompe enlaces y hábitos | Decisión explícita (Q-3) y redirecciones 308 desde rutas antiguas |
| R-9 | **Ámbito financiero mal acotado** («tercera versión») | Fechar y acotar alcance en F0 antes de estimar |

---

## 10. Criterios de aceptación de la propuesta

La propuesta se considerará aprobada y lista para desarrollo cuando:

1. **Q-1, Q-2 y Q-3** estén respondidas y registradas → **cumplido** (D-27…D-33).
2. La IA de las 6 secciones de Administración y de la Suite Front Office esté congelada (nombres y rutas).
3. El destino de `/` (home vs catálogo) esté decidido y documentado.
4. El alcance de la 3ª versión financiera esté fechado o marcado fuera de esta entrega.
5. Los dominios de datos nuevos estén aceptados para pasar a `diccionario_datos.md`,
   `diagrama_er.md` y `base_datos.sql` (los tres juntos).
6. El plan de fases (§7) esté aprobado con su orden y dependencias.
7. Las **decisiones D-1…D-26** estén registradas (ya lo están en
   [`proceso_propuesto_habitacion.md`](proceso_propuesto_habitacion.md)).

**Bloque Habitación: cerrado.** Las decisiones D-1…D-26 resuelven el proceso de creación,
publicación, estados, galería, inventario, contrato y migración de la sección *Habitación*.

---

## 11. Lo que NO cambia

- **No se modifica** la estructura de carpetas actual (`apps/*`, `packages/*`) en esta entrega.
- **No se altera** el contrato `HotelNights.sol` ni el modelo de noches tokenizadas.
- **No se toca** la lógica ya verificada de check-in on-chain, reventa, quema ni dashboard.
- **No se ejecuta** ningún cambio de BD ni de rutas: todo lo anterior es propuesta.
- Se conserva la autenticación única (contraseña + TOTP + JWT) y el gating por rol on-chain.

---

## 12. Preguntas abiertas (bloque 1)

> **Estado**: **bloque 1 cerrado**. Habitación (D-1…D-26) y las preguntas generales Q-1…Q-3 quedan
> resueltas (D-27…D-33). No hay preguntas abiertas en este momento. Las secciones siguientes (Recepción,
> Housekeeping, Mantenimiento, Actividades) abrirán su propio bloque cuando se especifiquen.

**Q-1 (cierre de requisito 3.5).** El documento fuente termina en «…la experiencia de usuario y la» y
queda incompleto. ¿Qué más debe mostrar la home pública? → **RESUELTO (D-27, D-28)**: se incluye todo lo
descrito **más reseñas de huéspedes** (anónimas y verificadas por noche consumida).

**Q-2 (comportamiento e interfaz).** Acordeón de Administración y tiempo real de Housekeeping. →
**RESUELTO (D-29, D-30)**: acordeón de **una sola sección abierta** (móvil con botón) y **SSE** para el
tablero.

**Q-3 (rutas y alcance).** `/`, ruta de Front Office y alcance financiero. → **RESUELTO (D-31, D-32,
D-33)**: **`/` = home de marca** (catálogo en `/catalogo` con redirecciones), Front Office anida en
**`/recepcion`**, y la suite financiera es **tercera versión** (fuera de esta entrega).

---

*Propuesta v0.4 · @asistenteProyecto · bloque 1 cerrado (D-1…D-33); plan de fases §7 recompuesto.*
