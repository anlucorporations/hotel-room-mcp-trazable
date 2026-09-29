# Plan definitivo de desarrollo — Hotel Marina del Sol

> **Documento**: plan de ejecución consolidado. **NO ejecutado**: describe el trabajo a construir.
> **Fecha**: 2026-09-26 · **Autor**: @asistenteProyecto · **Versión**: 1.0
> **Base**: decisiones **D-1…D-75** (bloques 1–5) y **44 tablas** ya sincronizadas en el runtime.
> **Documentos de origen**:
> [`propuesta_reestructura.md`](propuesta_reestructura.md) (análisis e IA) ·
> [`proceso_propuesto_habitacion.md`](proceso_propuesto_habitacion.md) (D-1…D-33) ·
> [`proceso_propuesto_recepcion.md`](proceso_propuesto_recepcion.md) (D-34…D-55) ·
> [`proceso_propuesto_bloque3.md`](proceso_propuesto_bloque3.md) (D-56…D-64) ·
> [`proceso_propuesto_publica.md`](proceso_propuesto_publica.md) (D-65…D-72) ·
> [`proceso_propuesto_bloque5.md`](proceso_propuesto_bloque5.md) (D-73…D-75).

---

## 1. Resumen ejecutivo

El proyecto pasa de un **catálogo de noches tokenizadas** a una **plataforma hotelera completa** organizada
en **tres suites** (Administración, Front Office y Pública) más **dos rutas de personal**
(`/housekeeping` y `/mantenimiento`). Se construye **de forma incremental y aditiva**: cada fase es una
entrega 100% operativa, probada y verificable (ADR-23), sin romper el piloto en ningún momento.

**Punto de partida ya alcanzado (fundación lista):**

- **44 tablas** del modelo de datos completas y sincronizadas en `migrator.ts`, `base_datos.sql`,
  `diccionario_datos.md` y `diagrama_er.md` (16 base + 9 Habitación/reseñas + 17 bloque 2 + 2 contenido).
- **75 decisiones** de producto/arquitectura registradas y sin huecos (D-1…D-75).
- Guardianes de arquitectura y documentación en verde; esquema **idempotente y aditivo**.

**Lo que falta:** la **lógica** (repositorios, APIs, casos de uso, pantallas) y el **corte de contrato**
final. El esquema va por delante del código: las tablas existen, pero aún no las usa nadie.

---

## 2. Principios invariantes (no negociables)

| # | Principio | Origen |
|---|---|---|
| 1 | **El cliente firma lo que revisa**; un único punto de firma que falla en cerrado | ADR-11 |
| 2 | **Lo que se promete, se mide**: toda calidad con prueba y artefacto | ADR-23 |
| 3 | **Nada de PII de viajeros** salvo el contacto mínimo cifrado y purgado (D-55) | ADR-20/RNF-30 |
| 4 | **Sin secretos en el código**: si falta, el proceso no arranca | ADR-04 |
| 5 | **Contrato único** `HotelNights`; sin contratos paralelos | ADR-02, D-10 |
| 6 | **Un solo inventario**: reservas y tokens no se solapan (D-41, D-57) | D-41/D-57 |
| 7 | **Accesibilidad WCAG 2.1 AA** en todas las rutas nuevas, escritorio y móvil | RNF-15, D-75 |
| 8 | **Interfaz trilingüe ES/EN/RU**; ficha con respaldo al español | RNF-13, D-6 |
| 9 | **Presupuesto de pruebas**: trinquete de cobertura, sin regresiones | RNF-17 |

---

## 3. Fundación de datos (ya lista)

**44 tablas**, agrupadas por dominio (detalle campo a campo en `diccionario_datos.md`):

| Dominio | Tablas | Nº |
|---|---|---|
| Núcleo (noches, mercado, operadores, recepción, worker) | `nfts`, `listings`, `sale_events`, `admin_sessions`, `admin_users`, `mfa_recovery_codes`, `email_notifications`, `push_subscriptions`, `checkin_contingency_logs`, `additional_charges`, `stay_checkouts`, `checkout_incidents`, `worker_*` | 16 |
| Habitación y reseñas | `room_types`, `rooms`, `room_images`, `room_amenities`, `room_amenity_links`, `room_publications`, `room_status_history`, `reviews`, `platform_settings` | 9 |
| Reservas y operación | `reservations`, `reservation_nights`, `reservation_contacts`, `reservation_status_history`, `folios`, `activities`, `activity_schedules`, `activity_bookings`, `housekeeping_shifts`, `housekeeping_assignments`, `housekeeping_room_logs`, `supply_items`, `supply_stock_movements`, `maintenance_incidents`, `maintenance_incident_events`, `preventive_plans`, `preventive_tasks` | 17 |
| Contenido público | `hotel_images`, `hotel_offers` | 2 |

> **Nota de secuencia:** al ser el esquema aditivo e idempotente, las tablas se crean en el próximo
> arranque sin afectar a las 16 originales. Cada fase **solo añade la capa de aplicación** que las usa.

---

## 4. Arquitectura de información (destino)

```
Suite ADMINISTRACIÓN  (/admin)  — sidebar izquierda + acordeón (D-29; **posición redistribuida a la izquierda el 2026-09-29, D-78**)
├── 1. Habitación          → inventario, ficha, estados, publicación (D-1…D-26)
├── 2. Recepción           → oferta, reservas por confirmar, disponibilidad, cancelaciones (D-34…D-43)
├── 3. Actividades         → catálogo, horarios, inscripciones (D-44…D-47)
├── 4. Housekeeping        → turnos, estados, lencería y suministros (D-48…D-51, D-64)
├── 5. Administración      → finanzas y contabilidad (3.ª versión, D-33)
├── 6. Mantenimiento       → incidencias y preventivo (D-52…D-54)
└── Sistemas               → contratos, usuarios, finanzas, operaciones (transversal)

Suite FRONT OFFICE  (/recepcion) — barra superior minimalista (D-32)
├── Reservas               → motor, disponibilidad, llegadas, cancelaciones (D-26, D-34)
└── Recepción              → check-in, check-out, folio y cargos (D-39, D-60)

Suite PÚBLICA  (/) — home one-page + páginas propias (D-31, D-71, D-76)
├── Home                   → marca, categoría, servicios, planes, actividades, experiencia, reseñas, contacto
├── /catalogo              → catálogo de ofertas
├── /reventa               → mercado secundario
├── /mis-noches, /historico, /checkin, /asistente, /ayuda
├── Reserva con wallet     → wallet al inicio; anticipo por transferencia; liquidación al 100 % (D-65, D-72)
└── Menú de Usuario        → accesos a las otras suites según el rol de la sesión (D-76, D-77)

Rutas de PERSONAL (fuera de las suites)
├── /housekeeping          → rol HOUSEKEEPING, móvil, vista simplificada (D-56, D-62)
└── /mantenimiento         → rol MAINTENANCE, tickets del técnico (D-56, D-63)
```

---

## 5. Fases de desarrollo

Cada fase es una **entrega vertical 100% operativa**, con sus pruebas y su artefacto. El orden respeta
D-25 (primer ciclo = shell + Habitación), D-26 (operación primero) y D-24 (corte de contrato al final).

### F0 — Cierre de definición · *riesgo bajo* · **✅ APROBADO (2026-09-26)**

- **Objetivo:** congelar este plan, la IA y las rutas.
- **Entregable:** plan aprobado; sin código nuevo.
- **Criterio de salida:** el responsable da el visto bueno a F1…F8 y al corte F8. → **Cumplido.**

### F1 — Shell de Administración + Habitación completa · *riesgo medio* · **✅ COMPLETADA (2026-09-26)** · **primer entregable**

**Progreso (2026-09-26):**
- ✅ **Roles (D-56)**: `HOUSEKEEPING` y `MAINTENANCE` añadidos al vocabulario de operador de BD en los
  8 puntos (repositorios, `env`, `guard`, ruta de usuarios, script de aprovisionamiento, UI, i18n). El
  guard ahora admite roles de personal **solo cuando la ruta declara su rol**.
- ✅ **Repositorio `RoomsRepository`** (D-1, D-7, D-8, D-19, D-2/D-18, galería D-5/D-20) con 17 pruebas.
- ✅ **API de habitaciones**: `GET/POST /api/admin/rooms`, `GET/PATCH/DELETE /api/admin/rooms/[id]` y
  `POST /api/admin/rooms/[id]/publish` (TOTP + huella, D-2/D-18/D-21) — **25 pruebas**.
- ✅ **Galería**: librería de nombres `room-images` (D-5/D-12/D-20), servido `GET /api/rooms/images/[file]`
  y administración `GET/POST /api/admin/rooms/[id]/images`, `PATCH/DELETE …/[imageId]` — **19 pruebas**.
- ✅ **Shell de Administración (D-29)**: sidebar **a la izquierda** (redistribuida el 2026-09-29, **D-78**, al estilo AdminLTE), menú **acordeón de una sección abierta**
  (`adminNav.ts` por secciones), móvil con botón y `aria-expanded`/`aria-controls`.
- ✅ **UI de la sección Habitación** (`/admin/habitacion`): alta, ficha editable, galería con portada,
  pausar/publicar con modal TOTP y archivar; i18n ES/EN/RU (namespace `rooms` + claves de sección).
- ✅ **Accesibilidad**: `/admin/habitacion` añadida al escaneo axe de `e2e/a11y.spec.ts`; contraste WCAG AA
  verificado por la prueba estática (17). **La ejecución del axe E2E no es posible en este entorno**
  (faltan `libnspr4`/`libnss3` y no hay root); queda cubierta en CI.
- ✅ **Anclaje on-chain (F8 adelantado, decisión del responsable)**: el contrato incorpora el **registro
  dinámico de habitaciones** (D-3/D-10, arranca vacío D-13, `RoomMaster` como semilla D-14) y
  `publishRoom(room, contentHash)` (D-18). La UI sincroniza el registro (`registerRoom` si falta) y ancla
  la huella (`publishRoom`); el `txHash` se guarda y la publicación queda **anclada**. Verificado con
  **139 pruebas Foundry** y un **despliegue real en Anvil** (registro vacío → `registerRoom` →
  `publishRoom` → `publicationHashOf` idéntico).
- ⏳ **Resto de F8**: reset total coordinado (D-15), siembra de las 50 habitaciones desde la BD (D-3) y
  ventana de acuñado global con botón manual (D-4/D-11/D-17). Los scripts de desarrollo/E2E
  (`seed-demo`, `inject-data`, `e2e/m4…m7`) necesitan un paso `registerRoom` antes de mintear: queda
  declarado como pendiente de F8.

- **Objetivo:** la sección 1 del back-office, operativa de punta a punta.
- **Alcance:**
  - `AdminShell`: **sidebar izquierda** + **acordeón** de una sección abierta (D-29; izquierda desde **D-78**), móvil con cajón.
  - Alta/edición de **habitación**: nº único, tipo fijo, capacidad, camas, descripciones
    (ES obligatorio; EN/RU con respaldo), m² y servicios (D-7, D-21, D-22).
  - **Galería** por habitación: JPG ≤2 MB, máx. 5, portada, alt text (D-5, D-12, D-20).
  - **Estados**: publicación (Borrador/Publicada/Pausada/En mantenimiento/Fuera de servicio) y operativo
    (Limpia/Sucia/Ocupada), independientes (D-19).
  - **Publicar** con firma del administrador + TOTP y **huella on-chain** (D-1, D-2, D-18);
    **archivar** sin borrar (D-8).
  - **Roles de BD** `HOUSEKEEPING` y `MAINTENANCE` dados de alta en la autenticación (D-56).
- **Rutas:** `/admin/habitacion/*` (o reubicación de `/admin/mint`), `/admin/dashboard`.
- **Datos:** `rooms`, `room_types`, `room_images`, `room_amenities`, `room_amenity_links`,
  `room_publications`, `room_status_history`, `platform_settings`.
- **Criterios de aceptación (Gherkin):**
  - *Dado* un administrador con wallet y rol, *Cuando* crea una habitación con los campos obligatorios y
    publica, *Entonces* la habitación queda `PUBLISHED`, con huella anclada y visible en la oferta.
  - *Dado* un administrador sin wallet conectada, *Cuando* intenta operar la sección, *Entonces* recibe
    401/403.
  - *Dado* una fotos de >2 MB o no JPG, *Cuando* se sube, *Entonces* el sistema la rechaza.
- **EARS:** *Si* la habitación está `PUBLISHED` sin descripción en español, *entonces* el sistema impide
  guardar (regla impuesta en BD).

### F2 — Front Office: Recepción + Motor de Reservas · *riesgo alto* · **✅ COMPLETADA (2026-09-26)**

**Progreso (2026-09-26):**
- ✅ **`ReservationsRepository`** (`packages/shared/src/db/repositories/reservations.repository.ts`):
  disponibilidad **exacta** noche a noche (`FREE`/`RESERVED`/`SOLD`, D-41/D-57), alta **reteniendo**
  noches en transacción (D-35), contacto **cifrado con AES-256-GCM y purgable** (D-55), folio (D-60),
  confirmar (D-39), cancelar/no-show liberando inventario (D-40/D-42), `expireHolds` (D-37),
  modificar con recálculo (D-43), anticipo off-chain (D-60) y `assignToken` (D-57). **13 pruebas**.
- ✅ **API de recepción** (`/api/reception`): disponibilidad (`GET /availability`), habitaciones
  publicadas (`GET /rooms`), reservas (`GET/POST /reservations`), ficha
  (`GET/PATCH/DELETE /reservations/[id]`), confirmar y registrar anticipo. Todas con `RECEPTION_ROLE`.
  **16 pruebas**.
- ✅ **Shell Front Office (D-32)**: `/recepcion/layout.tsx` + `FrontOfficeShell` con **barra superior**
  (Operación · Reservas); `/recepcion` sigue siendo la raíz y las funciones cuelgan de ella.
- ✅ **UI del motor de reservas** (`/recepcion/reservas`): alta con comprobación de disponibilidad,
  confirmar/cancelar y listado; i18n ES/EN/RU (paridad) y gating por rol.
- ✅ **Regla reserva↔token en el acuñado (D-57)**: el minteo **omite** las noches retenidas por reservas
  activas (`omittedReservedNights`) y devuelve **409 `RESERVED_NIGHTS`** si todo el lote está reservado;
  `isNightReserved` en el repositorio. **2 pruebas** nuevas.
- ✅ **Liquidación al 100 % (D-57/D-60)**: `planSettlement` decide noche a noche **asignar** el token no
  vendido, marcar **acuñar** o reportar **conflicto**; `POST /api/reception/reservations/[id]/settle`
  (409 si hay conflicto). La compra/acuñado on-chain la firma la wallet (público, F6).
- ✅ **Automatización (D-37/D-42/D-55)**: `purgeExpiredData` del worker ahora también libera **bloqueos
  vencidos**, marca **no-shows** de reservas confirmadas y **purga contactos** de estancias terminadas;
  el planificador de retención los ejecuta cada 6 h. La **hora límite del no-show es configurable**
  (D-42).
- ✅ **Configuración persistida (D-11/D-37/D-42)**: `SettingsRepository` sobre `platform_settings` y
  `GET/PUT /api/admin/settings` (solo owner) para ventana de acuñado, **anticipo**, **plazo** y **hora
  de no-show**; el alta de reserva lee el anticipo y el plazo de ahí (respaldo 30 %/24 h).
- ✅ **Pantalla de ajustes** en `Administración → Sistemas → Ajustes` (`/admin/sistemas/ajustes`),
  con sus claves i18n y el escaneo axe. La configuración queda de punta a punta: UI → API → BD → reserva.
- ✅ **Historial de estados corregido**: las transiciones registran el estado **anterior real**
  (`from_value`) en vez de `NULL`, y la modificación ya no escribe `'MODIFIED'` como si fuera un estado.
- ⏳ **Fuera de F2 (F6)**: reserva y liquidación **con wallet** desde la suite pública (D-65/D-72). El
  backend deja el plan de liquidación preparado (`settle`); la firma la hace el huésped en el flujo público.

- **Objetivo:** el núcleo operativo del día a día.
- **Alcance:**
  - `FrontOfficeShell` (barra superior) y reubicación de `/recepcion/*`: check-in, check-out y day board
    actuales (D-32, D-26).
  - **Motor de reservas**: crear/confirmar/modificar/cancelar; disponibilidad exacta **sin sobreventa**
    (D-40, D-41, D-43).
  - **La reserva retiene la noche** sin acuñar hasta el pago del 100 % (D-35) y **confirma por email y
    web** (D-38, con Telegram diferido a la v4 por D-61).
  - **Anticipo y vencimiento** configurables (30 % / 24 h por defecto) y **no-show automático** (D-37, D-42).
  - **Regla reserva ↔ token** (D-57): al acuñar se omiten noches reservadas; al pagar el 100 % se asigna o
    se acuña.
  - **Folio** y anticipo off-chain; liquidación con wallet (D-60).
- **Rutas:** `/recepcion/reservas`, `/recepcion/checkin`, `/recepcion/checkout`, tablero.
- **Datos:** `reservations`, `reservation_nights`, `reservation_contacts`, `reservation_status_history`,
  `folios`, `additional_charges.folio_id`, `nfts`.
- **Criterios:** reserva que no cabe → **409/409** sin sobreventa; reserva sin anticipo pasadas 24 h →
  `CANCELLED` e inventario liberado; check-out cambia el estado operativo a `DIRTY` (D-19).
- **Riesgo principal:** la **conciliación reserva/token** es la pieza crítica (D-57).

### F3 — Housekeeping · *riesgo alto (tiempo real, móvil)* · **✅ COMPLETADA (2026-09-27)**

**Progreso (2026-09-27):**
- ✅ **`HousekeepingRepository`**: turnos, habitaciones a limpiar por **ocupación** (salida/sucia/ocupada),
  **reparto automático rotatorio e idempotente** y ajuste manual (D-48), estados con traza y lencería
  con consumo que nunca deja stock negativo.
- ✅ **API `/api/housekeeping`** (rol `HOUSEKEEPING`, owner incluido): turnos, asignaciones, habitaciones,
  estado operativo y **SSE** `/stream`; panel de Lencería en `/api/admin/housekeeping/supplies` (owner).
- ✅ **Tiempo real (D-30)**: SSE por sondeo de PostgreSQL cada 1,5 s con emisión por cambio de firma;
  funciona con varias instancias.
- ✅ **UI `/housekeeping`** móvil de un toque (D-50/D-62) y **UI `/admin/housekeeping/lenceria`** (D-64)
  con entrada en el menú de Administración; i18n ES/EN/RU con paridad.
- ✅ **Stock bajo (D-51/D-64)**: descuento automático al limpiar, alerta en el panel y aviso por correo
  al responsable (cola única, tolerante a fallo).
- ✅ **Check-out → `DIRTY` (D-19)**: el check-out alimenta el reparto de limpieza con traza.
- ⏳ **Axe E2E**: rutas añadidas al escaneo; su ejecución local sigue limitada por las librerías del
  entorno y queda cubierta en CI.

- **Alcance:** ruta **`/housekeeping`** (D-62) con rol `HOUSEKEEPING` sin wallet; **tablero de estados en
  tiempo real por SSE** (D-30); **reparto automático por ocupación + ajuste manual** (D-48);
  **lencería y suministros** con descuento automático, umbral y alerta en el panel de Lencería (D-51,
  D-64).
- **Datos:** `housekeeping_shifts`, `housekeeping_assignments`, `housekeeping_room_logs`, `supply_items`,
  `supply_stock_movements`, `rooms.operational_status`.
- **Criterios:** un cambio de estado se refleja en <2 s en la pantalla de otro puesto (SSE); limpiar una
  habitación descuenta stock y, por debajo del umbral, emite alerta; la PWA es operable con un toque.
- **Fuera de alcance:** la **app móvil nativa** es de la versión 3 (D-49, D-50).

### F4 — Mantenimiento y Servicios Técnicos · *riesgo medio* · **✅ COMPLETADA (2026-09-27)**

**Progreso (2026-09-27):**
- ✅ **`MaintenanceRepository`**: incidencias con eventos y actor, **bloqueo de venta** por avería
  (`ROOM_BLOCKED` en reservas, exclusión en recepción y `blocked` en disponibilidad) y preventivo con
  generación de la siguiente tarea y listado de vencidas (D-52…D-54).
- ✅ **API `/api/mantenimiento`** (rol `MAINTENANCE`) y admin `/api/admin/mantenimiento/*` (owner);
  **guard multi-rol** para que recepción y limpieza reporten (D-52).
- ✅ **UI `/mantenimiento`** móvil del técnico (D-63) y paneles de Administración
  (`/admin/mantenimiento/incidencias` y `/preventivo`); formulario de reporte integrado en recepción
  y housekeeping.
- ✅ **Aviso (D-54)**: planificador diario del worker con cerrojo por día y correo por la cola única;
  el tablero del técnico muestra las vencidas aunque no haya correo configurado.
- ✅ i18n ES/EN/RU con paridad y escaneo axe ampliado a las rutas nuevas.
- ⏳ **Axe E2E**: ejecución local limitada por las librerías del entorno; cubierta en CI.

- **Alcance:** ruta **`/mantenimiento`** (D-63) con rol `MAINTENANCE`; **incidencias** reportadas por
  recepción y limpieza (D-52) con **bloqueo/liberación automáticos** de la venta (D-53); **preventivo con
  cronograma y avisos** (D-54).
- **Datos:** `maintenance_incidents`, `maintenance_incident_events`, `preventive_plans`,
  `preventive_tasks`.
- **Criterios:** con incidencia `OPEN` y `blocks_sale = TRUE`, la noche no se ofrece; al pasar a
  `RESOLVED`, vuelve a estar disponible; una tarea preventiva vencida genera aviso.

### F5 — Actividades · *riesgo medio* · **✅ COMPLETADA (2026-09-27)**

**Progreso (2026-09-27):**
- ✅ **`ActivitiesRepository`**: catálogo y horarios con **cupo estricto** (bloqueo `FOR UPDATE`),
  inscripción solo de **estancias activas** (D-45), **cargo al folio** (D-46) y **lista de espera
  opcional** con promoción automática al liberarse una plaza (D-47).
- ✅ `additional_charges.token_id` pasa a **nullable** (migración idempotente) para imputar cargos de
  actividad al folio antes de la liquidación; artefactos de datos sincronizados.
- ✅ **API admin** (`/api/admin/actividades/*`, owner) y **recepción**
  (`/api/reception/actividades/*`, `RECEPTION_ROLE`); UI `/admin/actividades` y pestaña **Actividades**
  en Front Office; i18n ES/EN/RU con paridad.
- ⏳ **Axe E2E**: `/admin/actividades` añadida al escaneo; ejecución local limitada por el entorno (CI).

- **Alcance:** catálogo, horarios con **cupo estricto** y **lista de espera opcional** (D-44…D-47);
  inscripción **solo de huéspedes con estancia activa** y **cargo al folio** (D-45, D-46).
- **Datos:** `activities`, `activity_schedules`, `activity_bookings`, `additional_charges`, `folios`.
- **Criterios:** sin plazas → lista de espera o rechazo, nunca sobreventa de aforo; la inscripción genera
  línea en el folio.

### F6 — Suite Pública · *riesgo alto (UX/marca)* · **✅ COMPLETADA (2026-09-27)**

**Progreso F6.1 (2026-09-27):**
- ✅ **Home one-page en `/`** con marca y categoría, servicios, estilos, planes, actividades,
  experiencia con galería, reseñas con nota media y contacto con mapa OpenStreetMap (D-66…D-71, D-76).
- ✅ **Catálogo movido a `/catalogo`** con navegación propia y cabecera (D-31); `/` deja de ser el catálogo.
- ✅ **`ContentRepository`** (`hotel_images`, `hotel_offers`) y **`ReviewsRepository`** (aprobadas +
  nota media + por estado) con sus pruebas; agregación tolerante a fallo (`getHomeContent`).
- ✅ Servidor público de imágenes de contenido y CSP con `frame-src` de OpenStreetMap.
- 🔜 **F6.4 ✅ (2026-09-27)**: gestión de **galería y planes** en `/admin/contenido` (D-73/D-74).
  **F6 COMPLETADA** (F6.1–F6.4).

- **Alcance:**
  - **Home one-page** en `/` con secciones: marca + categoría (D-70), servicios, estilos, planes
    informativos (D-69), actividades, **experiencia** con galería (D-66, D-70), **reseñas** con nota media
    (D-68) y **contacto + mapa OpenStreetMap** (D-67).
  - **`/catalogo`** con redirecciones desde los enlaces antiguos (D-31).
  - **Reserva con wallet**: wallet al inicio, retención, anticipo por transferencia y liquidación al 100 %
    (D-65, D-72).
  - **Reseñas**: envío firmado EIP-712 por el titular de una noche consumida y **moderación previa** por el
    admin (D-28, D-58, D-59).
  - **Gestión** de `hotel_images` y `hotel_offers` por el administrador (D-73, D-74).
- **Datos:** `hotel_images`, `hotel_offers`, `reviews`, `reservations`, `nfts`, `room_images`.
- **Criterios:** `/` sirve la home y `/catalogo` el catálogo; una reseña sin noche consumida no se admite;
  una reseña `PENDING` no se publica; el mapa no rompe la CSP ni el presupuesto de LCP.

### F7 — Administración financiera · **tercera versión (fuera de esta entrega)** (D-33)

- Facturación y cobranzas, métodos de pago y caja chica. Solo se reserva su diseño; requiere decisión
  fiscal del cliente (Veri*factu/TicketBAI) y de la gestoría.

### F8 — Corte final: contrato, migración y reset · *riesgo muy alto* · **corte único** (D-24) · **✅ CORTE EJECUTADO (2026-09-27)**

- **Alcance:**
  1. **Modificar `HotelNights`** para alojar un **registro dinámico de habitaciones** con rol de
     administrador (D-3, D-10), sustituyendo la autoridad del rango fijo de `RoomMaster`. → **HECHO**:
     `registerRoom`/`updateRoomType`/`isRoomRegistered`/`roomTypeOf` y `publishRoom`/`publicationHashOf`
     (D-18), con 139 pruebas Foundry y **desplegado en el Anvil global** (`0xc66A…7b6F`, bloque 314).
  2. **Sembrar** las habitaciones desde la BD (fuente única, D-3); `RoomMaster` queda como semilla de
     carga y referencia histórica (D-14). → **HECHO**: 50 filas en `rooms` + 50 `registerRoom`.
  3. **Reset total** coordinado: copia de seguridad y limpieza de `nfts`, `sale_events`, `listings` y
     agregados del worker (D-15); registro on-chain **arranca vacío** (D-13). → **HECHO** (backup
     `1790542352281`).
  4. **Primer acuñado** de la **ventana global configurable** (D-4, D-11) al publicar, con **botón manual
     de extensión** y aviso de agotamiento (D-17), proceso **idempotente** (D-16). → **HECHO Y CERRADO**:
     por habitación al publicar, «Acuñar ventana», **barrido global** y **aviso de agotamiento in-app y
     por correo** (planificador del worker, una vez por episodio); banco de pruebas multi-habitación
     real (`pnpm test:e2e:f8`) con evidencia en `RepoTecnico/evidencias/f8-mint-window-sweep.json`.
  5. **Paso `registerRoom` en los scripts de desarrollo/E2E** (`seed-demo`, `inject-data`,
     `e2e/m4…m7`) antes de mintear. → **HECHO** (helper `scripts/room-registry.ts`).
- **Runbook (resumen):** backup → desplegar contrato nuevo → cargar habitaciones → sincronizar BD↔cadena →
  limpiar tablas → primer acuñado → verificar catálogo y métricas → conservar el anterior como *rollback*.
- **Criterio de salida:** catálogo público coherente con la cadena, sin noches duplicadas ni fantasmas.
  → **Cumplido el 2026-09-27** (detalle en [`despliegue_gcp.md`](./despliegue_gcp.md) §18).
- **Pendiente fuera del corte (operativo, no de código):** publicar las 50 fichas (hoy `DRAFT`, necesitan
  descripción ES e imagen definitivas del hotel) y el **SMTP real** para cerrar `emailDegraded`.

---

## 6. Trazabilidad decisiones → fases

| Fase | Decisiones principales |
|---|---|
| F1 | D-1, D-2, D-5…D-9, D-12, D-18…D-23, D-25, D-29, D-56 |
| F2 | D-26, D-32, D-34…D-43, D-57, D-60 |
| F3 | D-19, D-30, D-48…D-51, D-62, D-64 |
| F4 | D-19, D-23, D-52…D-54, D-63 |
| F5 | D-44…D-47 |
| F6 | D-27, D-28, D-31, D-58, D-59, D-65…D-74 |
| F7 | D-33 |
| F8 | D-3, D-4, D-10, D-11, D-13…D-17, D-24 |
| Transversal | D-6 (idiomas), D-75 (accesibilidad), RNF y ADR |

---

## 7. Gates de calidad (todas las fases)

| Gate | Herramienta | Criterio |
|---|---|---|
| Tipos | `pnpm typecheck` | Sin errores |
| Pruebas | `pnpm test` | En verde; **trinquete de cobertura** sin regresión |
| Lint | `pnpm lint` | Sin errores |
| Accesibilidad | axe (Playwright) | **Cero** violaciones `critical`/`serious` en **todas las rutas nuevas** (D-75), escritorio y móvil |
| i18n | catálogos ES/EN/RU | Sin claves huérfanas; ficha con respaldo al español (D-6) |
| Privacidad | revisión | Sin PII salvo `reservation_contacts` cifrado y purgado (D-55) |
| Documentación | guardianes | Sin referencias huérfanas; artefactos de datos sincronizados |
| Verificabilidad | artefactos | Toda afirmación de calidad con su ejecución (ADR-23) |

---

## 8. Matriz de permisos (destilado)

| Capacidad | Admin (wallet) | Recepción | Housekeeping | Mantenimiento |
|---|---|---|---|---|
| Crear/editar/publicar habitación | ✅ | — | — | — |
| Ver disponibilidad y day board | ✅ | ✅ | ✅ (solo sus cuartos) | — |
| Crear/confirmar/cancelar reserva | ✅ | ✅ | — | — |
| Check-in / check-out y folio | ✅ | ✅ | — | — |
| Cambiar estado operativo (limpieza) | ✅ | ✅ | ✅ | — |
| Reportar incidencia | — | ✅ | ✅ | — |
| Resolver incidencia | ✅ | — | — | ✅ |
| Gestionar actividades | ✅ | inscribe | — | — |
| Moderar reseñas | ✅ | — | — | — |
| Gestionar galería/planes | ✅ | — | — | — |

Roles de **BD sin wallet** (D-56): `HOUSEKEEPING` y `MAINTENANCE`.

---

## 9. Fuera de alcance y versiones posteriores

| Elemento | Versión |
|---|---|
| Facturación fiscal, métodos de pago y caja chica (D-33) | **3.ª versión** |
| App móvil nativa de Housekeeping (D-49, D-50) | **3.ª versión** |
| WhatsApp como canal de reservas (D-36) | Posterior |
| Telegram como canal de notificación (D-61) | **4.ª versión** |
| Subastas, Arweave, multisig, Polygon público | Fases posteriores (PRD) |

---

## 10. Riesgos globales

| # | Riesgo | Mitigación |
|---|---|---|
| R-1 | **Conciliación reserva ↔ token** (D-57) | Doble control + pruebas de concurrencia; pieza crítica de F2 |
| R-2 | **Corte F8 destructivo** (reset, D-15) | Backup, runbook y rollback; nunca solapar con otra fase |
| R-3 | **Dependencias externas** (OpenStreetMap, SMTP) | Tolerantes a fallo; CSP y presupuesto de LCP en F6 |
| R-4 | **Cobertura de `web` baja** con superficie nueva grande | Trinquete por fase; probar antes de ampliar |
| R-5 | **PII en reservas** (D-55) | Cifrado + purga programada + revisión de privacidad |
| R-6 | **Regresión de navegación** al mover rutas | Redirecciones y pruebas E2E por shell |

---

## 11. Próximo paso

**Arrancar F1**: shell de Administración (sidebar derecha + acordeón) y **sección Habitación completa**
sobre el esquema ya desplegado, con sus pruebas y su escaneo de accesibilidad.

---

*Plan definitivo v1.0 · @asistenteProyecto · integra D-1…D-75 y 44 tablas · pendiente de aprobación (F0).*
