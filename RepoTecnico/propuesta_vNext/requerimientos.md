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
| Recepción | Reporta incidencias; activa la venta tras inspección/mantenimiento | `RECEPTION_ROLE` | Reporta incidencias, publica/despublica venta, resuelve reclamaciones; sin firma on-chain (D-C37) |
| Administrador | Aprueba configuraciones y custodia de roles | `DEFAULT_ADMIN_ROLE` | `DEFAULT_ADMIN_ROLE` (sin cambios) |
| **Huésped** | Cliente con estancia activa; afectado por bloqueos y cargos por daños | Cliente final de la web/reserva | Notificado de cargos por daños con plazo para reclamar |
| **Soporte (Administrador)** | Gestiona la cola de anclajes, terminales y recuperación de PIN | `DEFAULT_ADMIN_ROLE` | Lectura de `on_chain_signatures` y terminales; escalado de fallos (D-C24) |

> **Principio de diseño:** los **jefes** son operadores de confianza que **firman con wallet** los movimientos que afectan a disponibilidad, cargos económicos o cumplimiento normativo. Los **técnicos y camareras** son operadores de ejecución que **no necesitan wallet**: usan sesión tradicional (usuario + TOTP) y su trabajo queda validado por el jefe correspondiente.

---

## 3. Requisitos funcionales

### 3.1 Suite de Mantenimiento (Jefe de Mantenimiento)

| ID | Requisito | Prioridad | Firma on-chain |
|---|---|---|---|
| RF-M-01 | Recibir y clasificar incidencias reportadas por recepción o por el Ama de llaves | Alta | No |
| RF-M-02 | Asignar incidencias a técnicos de mantenimiento | Alta | No |
| RF-M-03 | **Bloquear una habitación para venta** cuando una incidencia la inhabilita | Alta | **Sí (obligatoria)** |
| RF-M-04 | Resolver y cerrar incidencias de habitaciones, registrando diagnóstico, acciones y repuestos | Alta | No (auditoría off-chain) |
| RF-M-05 | **Desbloquear una habitación** tras verificar que la incidencia está resuelta | Alta | **Sí (obligatoria)** |
| RF-M-06 | Gestionar planes de mantenimiento preventivo de infraestructura: piscina, bomba de agua, plomería, electricidad, climatización, etc. | Alta | No (configuración), Sí para verificación de tarea ejecutada |
| RF-M-07 | Programar tareas preventivas con periodicidad (diaria, semanal, mensual, trimestral, anual) | Alta | No |
| RF-M-08 | Registrar el cumplimiento de tareas preventivas, incluyendo quien ejecuta, fecha, evidencia (foto/nota) y observaciones | Alta | Sí solo si el área es crítica (D-C34) |
| RF-M-09 | Gestionar mantenimiento rutinario de áreas comunes: recolección de desechos sólidos, jardines, limpieza de filtros, zonas recreativas | Media | No |
| RF-M-10 | Registrar consumo de materiales y repuestos vinculado a incidencias o tareas | Media | No |
| RF-M-11 | Generar informes de mantenimiento por habitación, área, técnico y periodo | Baja (propuesta del equipo, D-C41) | No |
| RF-M-12 | Notificar al Ama de llaves cuando una habitación vuelva a estar lista para limpieza/inspección | Baja (propuesta del equipo, D-C41) | No |

### 3.2 Suite de Ama de llaves

| ID | Requisito | Prioridad | Firma on-chain |
|---|---|---|---|
| RF-K-01 | Crear turnos de housekeeping (mañana, tarde, noche) y asignar habitaciones a las camareras | Alta | No |
| RF-K-02 | Ver en tiempo real el estado operativo de cada habitación (`rooms.operational_status`: `CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`) y su estado de publicación (`rooms.publication_status`: `DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`) | Alta | No |
| RF-K-03 | Recibir notificación automática de habitaciones que requieren limpieza (check-out, mantenimiento resuelto, uso diario) | Alta | No |
| RF-K-04 | Supervisar el trabajo de las camareras (2 camareras a cargo) | Alta | No |
| RF-K-05 | **Inspeccionar cada habitación** tras la limpieza (check-out o servicio diario) y certificarla como revisada; la firma on-chain es **opcional** (D-C23) y no libera la venta (D-C15) | Alta | Opcional (configurable) |
| RF-K-06 | Rechazar una limpieza y devolverla a la camarera con observaciones | Alta | No |
| RF-K-07 | Reportar incidencias de mantenimiento desde housekeeping (averías, roturas, fallos) | Alta | No (reporte), Sí si implica cargo por daños |
| RF-K-08 | **Registrar cargos a la habitación por daños causados por el huésped**, con foto, descripción e importe | Alta | No (auditoría off-chain, D-C27) |
| RF-K-09 | Gestionar consumibles y suministros por habitación; alerta cuando `stock_qty < threshold_qty` (umbral configurable por el Ama de llaves, por defecto 20 % del estándar), notificada a ella y visible al Administrador, con recordatorio diario hasta reponer y cierre automático al superar el umbral | Media | No |
| RF-K-10 | Generar informes de productividad de camareras e inspecciones | Baja (propuesta del equipo, D-C41) | No |

### 3.3 Firma on-chain y trazabilidad

| ID | Requisito | Obligatoriedad |
|---|---|---|
| RF-S-01 | Los jefes (`HEAD_MAINTENANCE`, `HEAD_KEEPER`) inician sesión con **contraseña + TOTP** (igual que el back-office) y **conectan su wallet solo para firmar** mensajes EIP-712 cuando la acción lo requiere (D-C42) | Obligatoria |
| RF-S-02 | Todo bloqueo/desbloqueo de habitación por mantenimiento debe quedar registrado on-chain con dirección del firmante, timestamp y motivo | Obligatoria |
| RF-S-03 | La certificación de inspección de limpieza **puede** registrarse on-chain con dirección del Ama de llaves, habitación y resultado | Opcional (D-C23) |
| RF-S-04 | Todo cargo por daños a habitación queda registrado en `operator_audit_log` y vinculado al token/noche o folio; **no requiere firma on-chain** (D-C27) | Off-chain auditada |
| RF-S-05 | La verificación de tareas preventivas de **áreas críticas** (piscina, bomba de agua, ascensor, generador eléctrico) exige firma on-chain obligatoria; las de áreas no críticas no | Obligatoria (críticas) |
| RF-S-06 | Las acciones de técnicos y camareras (sin wallet) se registran off-chain y pueden ser validadas/confirmadas por el jefe correspondiente | Obligatoria |
| RF-S-07 | El sistema marca toda acción que requiere firma con **icono de cadena ⛓ + etiqueta "Requiere firma" + `data-testid="requires-signature"`**; el botón queda `disabled` hasta conectar la wallet y, antes de firmar, muestra un **modal de previsualización** con acción, entidad y datos | Obligatoria |
| RF-S-08 | Los movimientos off-chain de configuración y asignación deben llevar auditoría interna (quién, cuándo, qué cambió) | Obligatoria |

---

## 4. Requisitos no funcionales

| ID | Requisito | Detalle |
|---|---|---|
| RNF-M-01 | Seguridad de roles | Separación de privilegios: un técnico no puede firmar por el jefe; el ama de llaves no puede desbloquear mantenimiento |
| RNF-M-02 | UX de firma | Flujo guiado: preview de la tx decodificada, confirmación explícita, estados de éxito/error |
| RNF-M-03 | Resiliencia | Si la cadena no responde: backoff exponencial (30 s → 1 → 2 → 5 → 10 min), máx. 8 reintentos, TTL 24 h. Al agotar, la acción queda `PENDING_ANCHOR` visible y no se revierte el estado off-chain; se bloquea el cierre definitivo hasta anclar y se impide nueva acción sobre la misma entidad |
| RNF-M-04 | Accesibilidad | Las suites deben ser **usables desde móvil** (camareras/técnicos trabajan en campo). **No se exige un nivel formal WCAG 2.1** (decisión D-C28, riesgo aceptado); sí se aplican buenas prácticas básicas: contraste legible, botones táctiles amplios y mensajes claros |
| RNF-M-05 | Rendimiento | Estado de habitaciones en tablero: `p95 < 500 ms` (≥ 20 usuarios concurrentes); listados operativos: `p95 < 800 ms` con página máx. 50; firma registrada: `p95 < 5 s` hasta `SIGNED` (sin minado). Escenario: 20 usuarios, 50 habitaciones, ventana 90 días |
| RNF-M-06 | Trazabilidad | Toda acción de jefe o subordinado queda en logs de auditoría off-chain; las firmas on-chain son verificables públicamente |
| RNF-M-07 | Sin PII on-chain | Nunca se escriben datos personales en la cadena: solo hashes, identificadores de habitación y estados |
| RNF-M-08 | Extensibilidad | `HotelOperations.sol` es **inmutable** y emite un **evento genérico `OperationalAction(actionType, entityId, payloadHash, signer, timestamp)`**; añadir nuevos tipos de acción no requiere redeploy, solo un nuevo `actionType` en el dominio |
| RNF-M-09 | Política de PIN | PIN de 4-6 dígitos, hash bcrypt, bloqueo tras 5 intentos fallidos (solo Jefe/Admin rehabilita), rotación obligatoria cada 90 días, PIN de un solo uso en el primer acceso y cierre de sesión por inactividad a los 5 min |
| RNF-M-10 | Privacidad/GDPR | Notificación al huésped con datos mínimos (reserva, descripción, importe, enlace); fotos cifradas y eliminadas 90 días tras el check-out; base legal contractual; canal según preferencia del huésped; derecho de acceso/supresión tras resolver la reclamación |
| RNF-M-11 | Gobernanza de flags | Solo el Administrador (Owner) cambia los flags, con TOTP y registro en `operator_audit_log`; desactivar un flag obligatorio (bloqueo o cargos) exige firma on-chain del propio cambio de configuración |
| RNF-M-12 | Backup y recuperación | RPO 1 h (BD operativa), RTO 4 h; dump diario + WAL/PITR; evidencias replicadas; retención 30 días diarios + 12 meses mensuales; los trabajos `PENDING_ANCHOR` se reintentan tras restaurar |
| RNF-M-13 | Observabilidad | IDs de correlación en cada firma; logs estructurados por acción; métricas de cola de anclajes (tamaño, retraso, fallos); saldo de gas por wallet; alertas si una firma queda `PENDING` > 10 min o si `retry_count` supera 5 |
| RNF-M-14 | Compensación ante fallo de anclaje | Cambio de estado crítico en BD solo con firma `SIGNED`; si el anclaje falla tras cambiar BD, la entidad queda `PENDING_ANCHOR`, se bloquea nueva acción y el worker reconcilia; el worker detecta reorgs comparando `tx_hash` confirmado |
| RNF-M-15 | Ciclo de vida de wallets | Revocar el rol on-chain en `HotelOperations` **antes** de marcar `revoked_at`; FK de `operator_wallets` a `admin_users.id` (no por username); histórico de wallets por usuario; generación segura de claves documentada |
| RNF-M-16 | Integridad de altas de operarios | `terminal_operators.created_by` debe corresponder a un usuario activo con rol `HEAD_MAINTENANCE`, `HEAD_KEEPER` o `DEFAULT_ADMIN_ROLE` (validado en aplicación y auditoría) |
| RNF-M-17 | Usabilidad de terminales | Registro de tarea/cambio de estado en ≤ 30 s; ≤ 3 toques desde login; mensajes en el idioma del operario (ES/EN/RU) sin jerga técnica; error siempre con acción sugerida; botones amplios y confirmación visual + sonora |
| RNF-M-18 | Fiabilidad de terminales | **Sin modo offline**: el terminal exige conexión y avisa si se pierde. Concurrencia con bloqueo optimista (`updated_at`) y aviso de conflicto. Si Redis cae, se opera sin caché; si PostgreSQL cae, se bloquea la escritura con mensaje claro y se mantiene lectura cacheada |
| RNF-M-19 | Cumplimiento y auditoría | Retención 5 años de `operator_audit_log` y `on_chain_signatures`; auditoría **append-only** con hash de integridad encadenado (`prev_hash` + `integrity_hash`); exportación de expediente de evidencias (PDF/CSV firmado); registro de viajeros no aplica en la vNext |
| RNF-M-20 | Permisos del técnico | Ve solo sus incidencias/tareas asignadas y sus áreas; registra avance, cierra tarea (pendiente de validación) y adjunta evidencia; **no** ve importes, huéspedes, cargos, configuración ni firma on-chain |
| RNF-M-21 | Validación de subordinados | El jefe valida tareas en ≤ 24 h; al vencer pasan a `PENDING_VERIFICATION_EXPIRED` y escalan al Administrador; el panel del jefe muestra tiempo restante y el Administrador ve las vencidas. Una tarea vencida no bloquea la habitación pero no cuenta como completada hasta validarse |

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
| Iniciar limpieza (asignación `IN_PROGRESS`) | Camarera | No | Estado intermedio |
| **Certificar inspección post-limpieza** | Ama de llaves | Opcional (D-C23) | No libera venta por sí sola; la firma certifica la revisión si el hotel la activa |
| Reportar avería desde housekeeping | Ama de llaves / Camarera | No | Apertura de ticket para el jefe |
| **Cargo por daños a habitación** | Ama de llaves | No (D-C27) | Notificación al huésped con plazo de reclamación (D-C14) y auditoría off-chain; el cobro se realiza en el check-out |
| Registrar consumo de suministros | Camarera | No | Inventario off-chain |

### 5.3 Resumen de la regla de oro

> **Se firma on-chain cuando la acción:**  
> 1. Cambia la disponibilidad comercial de una habitación (bloqueo/desbloqueo).  
> 2. Certifica un resultado que habilita un proceso crítico (solo aplica si el hotel activa la firma de inspección; D-C23 la deja opcional).  
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
4. ✅ **Resuelta (2026-10-06; revisada para alinear con D-C14)**: El cargo por daños **se comunica al huésped** con la evidencia y un **plazo de reclamación** (D-C14, §1.1); si no reclama en plazo, se cobra **en el check-out** (se suma al folio/estado de cuenta de la estancia).
5. ✅ **Resuelta (2026-10-06)**: La foto/evidencia es **opcional pero recomendada**; el sistema no bloquea la acción por falta de imagen, pero mostrará avisos de "evidencia no adjunta" en movimientos firmados.

---

*Propuesta vNext · Fase 1 (Concepto) · @asistenteProyecto.*
