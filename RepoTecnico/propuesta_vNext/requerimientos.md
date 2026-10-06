# Propuesta vNext — Suite de Operaciones: Mantenimiento + Ama de llaves

> **Tipo:** propuesta de siguiente versión · **No modifica el sistema actual**  
> **Origen:** solicitud del cliente de incorporar dos operadores clave (Jefe de Mantenimiento y Ama de llaves) con acceso on-chain para firmar movimientos críticos.  
> **Fecha:** 2026-10-06 · **Autor:** @asistenteProyecto  
> **Referencias:** `RepoTecnico/proceso_propuesto_recepcion.md` (D-48…D-54), `RepoTecnico/diccionario_datos.md` §3.10, `RepoTecnico/diagrama_er.md` §7, contrato `HotelNights.sol`.

---

## 1. Resumen ejecutivo

La plataforma actual gestiona habitaciones, reservas, venta de noches NFT, recepción y un esqueleto de **housekeeping/mantenimiento** sin roles diferenciados ni firma on-chain de las operaciones.

La **versión propuesta (vNext)** añade dos suites operativas completas:

1. **Suite de Mantenimiento** dirigida por el **Jefe de Mantenimiento**, con poder de resolver incidencias de habitaciones, ejecutar planes preventivos de infraestructura y registrar el mantenimiento rutinario de áreas comunes.
2. **Suite de Ama de llaves** dirigida por el **Ama de llaves**, con poder de coordinar camareras, supervisar el estado de limpieza y suministros, inspeccionar habitaciones y notificar mantenimiento o cargos por daños.
3. **Firma on-chain selectiva**: ciertos movimientos de ambos roles quedarán anclados/firmados en la cadena para garantizar trazabilidad e integridad; otros movimientos cotidianos seguirán siendo off-chain con sesión tradicional.

El alcance se limita a **definir la propuesta** (Fase 1 del proceso de proyecto). No se modifica código, contratos ni base de datos existentes.

---

## 1.1 Notificación al huésped por cargos por daños (D-C14)

Cuando el Ama de llaves registra un cargo por daños, el sistema **notifica al huésped** (canal definido por la reserva: email/Telegram/web) con la evidencia (foto + descripción) y el importe propuesto. El huésped dispone de un **plazo configurable** (por defecto 24 h antes del check-out) para **reclamar** a través de Recepción. Si no reclama en el plazo, el cargo se confirma y se cobra en el check-out. La notificación y la respuesta quedan registradas off-chain.

---

## 2. Stakeholders y actores

| Actor | Descripción | Rol en la plataforma actual | Rol propuesto en vNext |
|---|---|---|---|
| **Jefe de Mantenimiento** | Responsable técnico de mantenimiento correctivo, preventivo y rutinario | `MAINTENANCE` (genérico, sin wallet) | `HEAD_MAINTENANCE` con wallet on-chain |
| **Técnico de mantenimiento** | Personal a cargo del jefe que ejecuta reparaciones | No existe como rol distinto | `MAINTENANCE_TECH` (sin wallet) |
| **Ama de llaves** | Supervisora de housekeeping, inspecciones y suministros | `HOUSEKEEPING` (genérico, sin wallet) | `HEAD_KEEPER` con wallet on-chain |
| **Camarera / Mucama** | Personal de limpieza a cargo del ama de llaves | No existe como rol distinto | `HOUSEKEEPER` (sin wallet) |
| Recepción | Reporta incidencias de mantenimiento | `RECEPTION_ROLE` | `RECEPTION_ROLE` (sin cambios) |
| Administrador | Aprueba configuraciones y custodia de roles | `DEFAULT_ADMIN_ROLE` | `DEFAULT_ADMIN_ROLE` (sin cambios) |
| **Huésped** | Cliente con estancia activa; afectado por bloqueos y cargos por daños | Cliente final de la web/reserva | Notificado de cargos por daños con plazo para reclamar |

> **Principio de diseño:** los **jefes** son operadores de confianza que **firman con wallet** los movimientos que afectan a disponibilidad, cargos económicos o cumplimiento normativo. Los **técnicos y camareras** son operadores de ejecución que **no necesitan wallet**: usan sesión tradicional (usuario + TOTP) y su trabajo queda validado por el jefe correspondiente.

---

## 3. Requisitos funcionales

### 3.1 Suite de Mantenimiento (Jefe de Mantenimiento)

| ID | Requisito | Prioridad | Firma on-chain |
|---|---|---|---|
| RF-M-01 | Recibir y clasificar incidencias reportadas por recepción o por el Ama de llaves | Alta | No |
| RF-M-02 | Asignar incidencias a técnicos de mantenimiento | Alta | No |
| RF-M-03 | **Bloquear una habitación para venta** cuando una incidencia la inhabilita | Alta | **Sí (obligatoria)** |
| RF-M-04 | Resolver y cerrar incidencias de habitaciones, registrando diagnóstico, acciones y repuestos | Alta | Sí recomendada (opcional configurable) |
| RF-M-05 | **Desbloquear una habitación** tras verificar que la incidencia está resuelta | Alta | **Sí (obligatoria)** |
| RF-M-06 | Gestionar planes de mantenimiento preventivo de infraestructura: piscina, bomba de agua, plomería, electricidad, climatización, etc. | Alta | No (configuración), Sí para verificación de tarea ejecutada |
| RF-M-07 | Programar tareas preventivas con periodicidad (diaria, semanal, mensual, trimestral, anual) | Alta | No |
| RF-M-08 | Registrar el cumplimiento de tareas preventivas, incluyendo quien ejecuta, fecha, evidencia (foto/nota) y observaciones | Alta | Sí recomendada |
| RF-M-09 | Gestionar mantenimiento rutinario de áreas comunes: recolección de desechos sólidos, jardines, limpieza de filtros, zonas recreativas | Media | No |
| RF-M-10 | Registrar consumo de materiales y repuestos vinculado a incidencias o tareas | Media | No |
| RF-M-11 | Generar informes de mantenimiento por habitación, área, técnico y periodo | Media | No |
| RF-M-12 | Notificar al Ama de llaves cuando una habitación vuelva a estar lista para limpieza/inspección | Media | No |

### 3.2 Suite de Ama de llaves

| ID | Requisito | Prioridad | Firma on-chain |
|---|---|---|---|
| RF-K-01 | Crear turnos de housekeeping (mañana, tarde, noche) y asignar habitaciones a las camareras | Alta | No |
| RF-K-02 | Ver en tiempo real el estado operativo de cada habitación: `LIMPIA`, `SUCIA`, `EN_LIMPIEZA`, `OCUPADA`, `BLOQUEADA_MANTENIMIENTO`, `EN_INSPECCION` | Alta | No |
| RF-K-03 | Recibir notificación automática de habitaciones que requieren limpieza (check-out, mantenimiento resuelto, uso diario) | Alta | No |
| RF-K-04 | Supervisar el trabajo de las camareras (2 camareras a cargo) | Alta | No |
| RF-K-05 | **Inspeccionar cada habitación** tras la limpieza (check-out o servicio diario) y certificarla como lista | Alta | **Sí (obligatoria)** |
| RF-K-06 | Rechazar una limpieza y devolverla a la camarera con observaciones | Alta | No |
| RF-K-07 | Reportar incidencias de mantenimiento desde housekeeping (averías, roturas, fallos) | Alta | No (reporte), Sí si implica cargo por daños |
| RF-K-08 | **Registrar cargos a la habitación por daños causados por el huésped**, con foto, descripción e importe | Alta | **Sí (obligatoria)** |
| RF-K-09 | Gestionar consumibles y suministros por habitación, con alerta de umbral crítico | Media | No |
| RF-K-10 | Generar informes de productividad de camareras e inspecciones | Media | No |

### 3.3 Firma on-chain y trazabilidad

| ID | Requisito | Obligatoriedad |
|---|---|---|
| RF-S-01 | Los jefes (`HEAD_MAINTENANCE`, `HEAD_KEEPER`) deben conectar una wallet y autenticarse con SIWE/EIP-4361 igual que los administradores | Obligatoria |
| RF-S-02 | Todo bloqueo/desbloqueo de habitación por mantenimiento debe quedar registrado on-chain con dirección del firmante, timestamp y motivo | Obligatoria |
| RF-S-03 | Toda certificación de inspección de limpieza debe quedar registrada on-chain con dirección del Ama de llaves, habitación y resultado | Obligatoria |
| RF-S-04 | Todo cargo por daños a habitación debe quedar registrado on-chain, vinculado al token/noche o folio correspondiente | Obligatoria |
| RF-S-05 | La verificación de tareas preventivas de infraestructura crítica (piscina, bomba, electricidad) debe poder firmarse on-chain | Recomendada |
| RF-S-06 | Las acciones de técnicos y camareras (sin wallet) se registran off-chain y pueden ser validadas/confirmadas por el jefe correspondiente | Obligatoria |
| RF-S-07 | El sistema debe mostrar claramente qué acción requiere firma de wallet y cuál no, antes de ejecutarla | Obligatoria |
| RF-S-08 | Los movimientos off-chain de configuración y asignación deben llevar auditoría interna (quién, cuándo, qué cambió) | Obligatoria |

---

## 4. Requisitos no funcionales

| ID | Requisito | Detalle |
|---|---|---|
| RNF-M-01 | Seguridad de roles | Separación de privilegios: un técnico no puede firmar por el jefe; el ama de llaves no puede desbloquear mantenimiento |
| RNF-M-02 | UX de firma | Flujo guiado: preview de la tx decodificada, confirmación explícita, estados de éxito/error |
| RNF-M-03 | Resiliencia | Si la cadena no responde, las acciones críticas off-chain quedan en cola de anclaje pendiente y se reintentan |
| RNF-M-04 | Accesibilidad | Las suites deben ser usables desde móvil (camareras/técnicos trabajan en campo) |
| RNF-M-05 | Rendimiento | Tableros con actualización en tiempo real vía SSE/WebSocket; listados < 1 s |
| RNF-M-06 | Trazabilidad | Toda acción de jefe o subordinado queda en logs de auditoría off-chain; las firmas on-chain son verificables públicamente |
| RNF-M-07 | Sin PII on-chain | Nunca se escriben datos personales en la cadena: solo hashes, identificadores de habitación y estados |
| RNF-M-08 | Extensibilidad | El contrato de operaciones debe permitir añadir nuevos tipos de eventos sin redeploy masivo |

---

## 5. Análisis de firmas on-chain obligatorias vs opcionales

### 5.1 ¿Por qué firmar on-chain?

La firma on-chain busca garantizar:
- **No repudio**: quién tomó la decisión y cuándo.
- **Integridad**: el estado de la habitación o el cargo no puede alterarse sin dejar rastro.
- **Automatización**: el contrato puede reaccionar (bloquear ventas, habilitar check-in).
- **Cumplimiento**: evidencia auditable ante terceros o reguladores.

### 5.2 Matriz de obligatoriedad

| Acción | Actor | Firma wallet | Justificación |
|---|---|---|---|
| Crear/editar plan preventivo | Jefe de Mantenimiento | No | Configuración interna; se audita off-chain |
| Asignar técnico a incidencia | Jefe de Mantenimiento | No | Gestión operativa interna |
| Reportar incidencia | Recepción / Ama de llaves | No | Solo apertura de ticket |
| **Bloquear habitación por mantenimiento** | Jefe de Mantenimiento | **Sí** | Afecta disponibilidad comercial y ventas NFT |
| **Desbloquear habitación tras mantenimiento** | Jefe de Mantenimiento | **Sí** | Garantiza que una habitación no apta no se pone a la venta |
| Resolver incidencia sin afectar disponibilidad | Técnico / Jefe | No / opcional | Depende de política del hotel |
| Verificar tarea preventiva crítica | Jefe de Mantenimiento | Recomendada | Evidencia de cumplimiento (piscina, electricidad) |
| Registrar mantenimiento de áreas comunes | Técnico / Jefe | No | Operación rutinaria sin impacto directo en inventario |
| Crear turnos y asignaciones | Ama de llaves | No | Gestión interna |
| Cambiar estado a `EN_LIMPIEZA` | Camarera | No | Estado intermedio |
| **Certificar inspección post-limpieza** | Ama de llaves | **Sí** | La habitación pasa a disponible para huésped/check-in |
| Reportar avería desde housekeeping | Ama de llaves / Camarera | No | Apertura de ticket para el jefe |
| **Cargo por daños a habitación** | Ama de llaves | **Sí** | Cargo económico al huésped; requiere trazabilidad |
| Registrar consumo de suministros | Camarera | No | Inventario off-chain |

### 5.3 Resumen de la regla de oro

> **Se firma on-chain cuando la acción:**  
> 1. Cambia la disponibilidad comercial de una habitación (bloqueo/desbloqueo).  
> 2. Certifica un resultado que habilita el siguiente proceso crítico (inspección → disponible).  
> 3. Genera un cargo económico o una responsabilidad legal (daños).  
> 4. Es una verificación de cumplimiento de infraestructura crítica (preventivo).  
>
> **No se firma on-chain cuando la acción:**  
> 1. Es un estado intermedio o de trabajo en curso.  
> 2. Es puramente configuración o asignación interna.  
> 3. No afecta al huésped, a la venta ni a una obligación legal.  
> 4. La ejecuta un subordinado sin wallet (su jefe validará lo relevante).

---

## 6. Decisiones de arquitectura propuestas

| # | Tema | Decisión propuesta |
|---|---|---|
| D-V1 | Nuevo contrato | Crear `HotelOperations.sol` (contrato auxiliar) para eventos de mantenimiento, inspecciones y cargos por daños. El contrato `HotelNights.sol` actual no se modifica. |
| D-V2 | Wallet de jefes | Cada jefe (`HEAD_MAINTENANCE`, `HEAD_KEEPER`) tiene su propia wallet dedicada, distinta de la del administrador. Se gestionan roles on-chain en `HotelOperations`. |
| D-V3 | Subordinados sin wallet | Técnicos y camareras usan sesión tradicional. Sus acciones se registran off-chain y son visibles/validables por el jefe. |
| D-V4 | Anclaje de estados de habitación | `rooms.operational_status` y `rooms.publication_status` se actualizan en BD; los cambios críticos se reflejan on-chain mediante eventos en `HotelOperations`. |
| D-V5 | Cargos por daños | Se modelan como `additional_charges` (existe) + `housekeeping_damage_charges` (nueva) + evento `DamageChargeRecorded` en `HotelOperations`. |
| D-V6 | Prevenitvo crítico | Las tareas de equipos críticos (piscina, bomba, electricidad) tienen flag `requires_on_chain_signature = TRUE`. |
| D-V7 | Disponibilidad sin bloqueo de ventas | El bloqueo/desbloqueo de ventas por mantenimiento se implementa en BD (`rooms.publication_status = 'MAINTENANCE'`) y se confirma on-chain; el catálogo filtra por este estado. |
| D-V8 | Cola de anclaje | Las firmas on-chain se envían a través de una cola con reintentos; si falla, la acción off-chain queda marcada como `pending_anchor` hasta confirmar. |

---

## 7. Decisiones confirmadas por el cliente (2026-10-06)

| # | Decisión | Implicación en diseño |
|---|---|---|
| D-C1 | El Jefe de Mantenimiento y el Ama de llaves son **roles separados** con **wallets diferentes** y permisos diferenciados | Se crean dos roles on-chain distintos (`HEAD_MAINTENANCE_ROLE`, `HEAD_KEEPER_ROLE`) y dos tablas/wallets separadas |
| D-C2 | Técnicos y camareras usan **terminales fijos del hotel**, sin wallet | Autenticación tradicional (usuario + TOTP); sus acciones se asocian al personal pero no firman on-chain |
| D-C3 | Equipos/áreas críticas con firma on-chain obligatoria: **Filtro/Bomba de Piscina, Bomba de Agua, Ascensor, Generador Eléctrico** | Estos tipos de área tendrán `is_critical = TRUE` y sus tareas preventivas `requires_signature = TRUE` |
| D-C4 | Los cargos por daños se imputan al **noche/token vendido** | `housekeeping_damage_charges` se vincula directamente con `nfts(token_id)` además de con `additional_charges` |
| D-C5 | La inspección de limpieza se registra **por habitación en general**, no por noche/estancia | `housekeeping_inspections.room_id` es la FK principal; `token_id` no es obligatorio |
| D-C6 | El Jefe de Mantenimiento **siempre firma él mismo** en operación normal; en emergencia, la **wallet del Owner/Administrador** actúa como respaldo/custodia compartida | `DEFAULT_ADMIN_ROLE`/`owner` tiene capacidad de firma de emergencia para operaciones críticas de mantenimiento |
| D-C7 | Prioridad absoluta: **definir bien el alcance** antes de comprometer presupuesto/fechas | La propuesta se mantiene en Fase 1 hasta aprobación explícita de alcance |

## 8. Preguntas técnicas pendientes

1. ✅ **Resuelta (2026-10-06)**: El Ama de llaves **no bloquea** habitaciones por limpieza profunda; **abre un ticket** al Jefe de Mantenimiento, quien es el único que bloquea/desbloquea.
2. ✅ **Resuelta (2026-10-06)**: Tras una inspección aprobada, la habitación queda marcada como limpia, pero **la venta de noches futuras no se libera automáticamente**; debe activarla **Recepción o Administración** manualmente.
3. ✅ **Resuelta (2026-10-06)**: Técnicos y camareras se autentican en el terminal fijo con **PIN corto**. Se añade la tabla `terminal_operators` para gestionar usuarios de terminal y sus PIN hash (bcrypt).
4. ✅ **Resuelta (2026-10-06)**: El cargo por daños **no se comunica antes** al huésped; queda como **nota interna** y se cobra **en el check-out** (se suma al folio/estado de cuenta de la estancia).
5. ✅ **Resuelta (2026-10-06)**: La foto/evidencia es **opcional pero recomendada**; el sistema no bloquea la acción por falta de imagen, pero mostrará avisos de "evidencia no adjunta" en movimientos firmados.

---

*Propuesta vNext · Fase 1 (Concepto) · @asistenteProyecto.*
