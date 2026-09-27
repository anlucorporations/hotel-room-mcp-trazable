# Proceso propuesto — Bloque 2: Recepción, Actividades, Housekeeping y Mantenimiento

> **Documento de propuesta (NO ejecutada en código).** Registro de decisiones de la entrevista.
> **Fecha**: 2026-09-26 · **Autor**: @asistenteProyecto
> **Continúa a**: [`proceso_propuesto_habitacion.md`](proceso_propuesto_habitacion.md) (decisiones D-1…D-33).
> **Numeración**: continúa desde **D-34**.
> **Secciones del fuente**: 1.2 Recepción · 1.3 Actividades · 1.4 Housekeeping · 1.6 Mantenimiento.

---

## 1. Frontera entre suites (base del bloque)

### §1.2 Recepción (Administración) vs §2.1 Motor de Reservas (Front Office)

**D-34 (decisión del cliente, aplicada).** **Administración configura; Front Office opera.** El reparto es:

| Suite | Sección | Responsabilidad | Qué hace |
|---|---|---|---|
| Administración | **Recepción** | **Configuración y estrategia** | Qué se oferta, tarifas por fecha, reglas de cancelación y anticipo, publicar/retirar habitaciones, ver reservas por confirmar y disponibilidad |
| Front Office | **Reservas** | **Operación diaria** | Crear, confirmar, modificar y cancelar reservas; panel de llegadas del día |

**Regla anti-duplicación:** una capacidad (p. ej. «crear reserva») vive en **una sola** suite; la otra
puede **verla** en modo lectura, nunca reimplementarla.

---

## 2. Reservas y disponibilidad

### Modelo reserva ↔ token

**D-35 (decisión del cliente, aplicada).** **La reserva retiene; el token se emite al confirmar el pago.**
Al crear una reserva, la noche se **retiene** en la base de datos (estado `RESERVED`) **sin acuñar**. Si
vence el plazo sin pago, se **libera** el inventario. *(El momento exacto de emisión se precisa en D-39:
solo al pagar el 100 %.)*

**D-36 (decisión del cliente, aplicada).** Canales de reserva: **mostrador (Front Office) + web pública
conectando wallet**. **WhatsApp queda para una fase posterior** (depende de una API externa con coste y
verificación).

**D-37 (decisión del cliente, aplicada).** **Anticipo y plazo configurables** por el administrador
(por defecto **30 %** y **24 h**). Al vencer sin pago, la reserva se cancela y el inventario se **libera
automáticamente**.

**D-38 (decisión del cliente, aplicada).** Confirmación al huésped por **Email + Telegram + Web**. Además
de la confirmación de la reserva, se emite **confirmación al pagar el 100 %**.

**D-39 (decisión del cliente, aplicada).** **El token se emite solo al pagar el 100 %.** El anticipo
(cuando lo haya) únicamente **extiende la reserva**; no emite token. El huésped no tiene token hasta
liquidar el total.

**D-40 (decisión del cliente, aplicada).** **Política configurable con penalización por plazo**: cambios
y cancelaciones sin coste hasta X días antes de la entrada; después, penalización según la regla. Al
cancelar, el inventario se **libera automáticamente**. Se registra siempre el motivo y quién lo hizo.

**D-41 (decisión del cliente, aplicada).** **Sin sobreventa**: la disponibilidad es **exacta**
(habitaciones publicadas y no archivadas, menos reservas activas, tokens vendidos y habitaciones
bloqueadas por mantenimiento).

**D-42 (decisión del cliente, aplicada).** **No-show automático**: pasada la hora límite de llegada
(configurable), la reserva pasa a `NO_SHOW`, se **retiene el anticipo** según política y se **libera el
inventario** sin intervención manual.

**D-43 (decisión del cliente, aplicada).** Modificaciones: **cambio de fechas y/o habitación** mientras
haya disponibilidad y dentro del plazo; el sistema **recalcula el precio** y **libera el inventario
anterior**.

---

## 3. Actividades (§1.3)

**D-44 (decisión del cliente, aplicada).** El **administrador con wallet** configura el catálogo de
actividades (horarios, cupos, precios y temporadas); la **recepción** inscribe a los huéspedes desde
Front Office. Coherente con D-34 (configurar vs operar).

**D-45 (decisión del cliente, aplicada).** Solo pueden inscribirse **huéspedes con una estancia activa**
(reserva confirmada o noche comprada); la inscripción se **vincula a su folio**.

**D-46 (decisión del cliente, aplicada).** El precio de la actividad se **carga al folio** de la estancia
como línea de cargo y se liquida en el check-out (reutiliza los cargos adicionales off-chain).

**D-47 (decisión del cliente, aplicada).** Cada horario tiene **cupo estricto**; al llenarse se impiden
más inscripciones, con **lista de espera opcional** y aviso al liberarse una plaza.

---

## 4. Housekeeping (§1.4)

**D-48 (decisión del cliente, aplicada).** Al inicio de la jornada el sistema **reparte automáticamente**
las habitaciones a limpiar entre las mucamas según la ocupación, y el supervisor puede **ajustar a
mano**.

**D-49 (decisión del cliente, aplicada).** La **app móvil nativa** de Housekeeping se desarrolla en la
**versión 3** (fuera de esta entrega).

**D-50 (decisión del cliente, aplicada).** Antes de la app nativa, en esta entrega se construye el
**tablero web responsive** con **rol limitado sin wallet** (usable desde el móvil del personal); la app
nativa de v3 se añade encima.

**D-51 (decisión del cliente, aplicada).** **Descuento automático + umbral crítico configurable**: el
stock se descuenta por habitación limpiada o huésped registrado y, al bajar del umbral, se emite
**alerta** al panel de suministros y notificación. La reposición la marca el responsable.

---

## 5. Mantenimiento y Servicios Técnicos (§1.6)

**D-52 (decisión del cliente, aplicada).** Las incidencias las **reportan recepción y limpieza**; el
**técnico de mantenimiento** las resuelve y cierra el ticket.

**D-53 (decisión del cliente, aplicada).** **Bloqueo y liberación automáticos**: al reportar la avería la
habitación se bloquea en ventas y, al marcar el ticket como **«Resuelto»**, se libera sola.

**D-54 (decisión del cliente, aplicada).** **Mantenimiento preventivo con cronograma**: cada equipo o
tarea tiene una **periodicidad** (semanal/mensual/trimestral); el sistema **programa, avisa** cuando toca
y **registra el cumplimiento** (quién y cuándo).

---

## 6. Cierre de datos: contacto del huésped

**D-55 (decisión del cliente, aplicada).** Para poder confirmar por email/web (D-38, D-61) sin romper
ADR-20/RNF-30, se guarda **solo el canal y la dirección** (email o usuario de Telegram) **cifrados**
(AES-256-GCM), ligados a la reserva y **purgados al finalizar la estancia**. **Nunca** nombre, DNI,
teléfono ni dirección postal. Modelo: tabla `reservation_contacts` (`channel`, `value_enc`, `purge_at`,
`purged_at`).

---

## 7. Resumen del bloque 2

| Sección | Decisiones | Ideas clave |
|---|---|---|
| §1.2 Recepción / §2.1 Reservas | D-34…D-43 | Admin configura, Front Office opera; la reserva retiene y el token se emite al pagar el 100 %; anticipo y plazo configurables; sin sobreventa; no-show automático; modificación con recálculo |
| §1.3 Actividades | D-44…D-47 | Admin configura, recepción inscribe; solo huéspedes con estancia; cargo al folio; cupo estricto con lista de espera |
| §1.4 Housekeeping | D-48…D-51 | Reparto automático + ajuste; web responsive ahora y app nativa en v3; rol limitado sin wallet; consumibles con descuento y alerta |
| §1.6 Mantenimiento | D-52…D-54 | Reportan recepción y limpieza; el técnico resuelve; bloqueo/liberación automáticos; preventivo con cronograma |
| Cierre de datos | D-55 | Contacto mínimo **cifrado y purgable**; nunca PII completa |

**Modelo de datos:** ya sincronizado en los tres artefactos y en `migrator.ts` (sección 3.6 del SQL,
17 tablas). Plan de fases recompuesto en `propuesta_reestructura.md` §7.

---

*Documento v3 · @asistenteProyecto · bloque 2 cerrado (D-34…D-55).*
